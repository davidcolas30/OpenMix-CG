/**
 * signalingService.ts — Servidor WebSocket de señalización WebRTC.
 *
 * ¿Qué es la señalización?
 * WebRTC necesita un canal fuera de banda para que dos peers intercambien:
 * 1. SDP (Session Description Protocol): describe los codecs, resoluciones
 *    y capacidades de media que cada peer soporta
 * 2. ICE candidates: direcciones IP y puertos por los que el peer puede
 *    recibir media (incluyendo reflexiones STUN y relays TURN)
 *
 * Este servidor actúa como intermediario: el móvil envía su SDP offer
 * y ICE candidates, el servidor los reenvía al módulo GStreamer webrtcbin,
 * y viceversa. Una vez establecida la conexión P2P, la señalización ya
 * no se usa para el flujo de media (solo para control y reconexión).
 *
 * Protocolo de mensajes:
 * - Cliente → Servidor: join, offer, ice-candidate, stats, bye
 * - Servidor → Cliente: welcome, answer, ice-candidate, error
 *
 * Cada conexión se identifica por un token único (UUID) incluido en el QR.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import https from 'https'
import { randomUUID } from 'crypto'
import type { TlsCert } from './certService'

function isEnvDisabled(value: string): boolean {
  return ['0', 'false', 'off', 'none', 'disabled'].includes(value.trim().toLowerCase())
}

const REALTIME_DIAGNOSTIC_LOGS_ENABLED = !isEnvDisabled(
  process.env.OPENMIX_REALTIME_DIAGNOSTICS ?? 'off'
)

const requestedMobileStatsLogMode = process.env.OPENMIX_MOBILE_STATS_LOG
const MOBILE_STATS_LOG_ENABLED =
  requestedMobileStatsLogMode !== undefined
    ? !isEnvDisabled(requestedMobileStatsLogMode)
    : REALTIME_DIAGNOSTIC_LOGS_ENABLED

// ── Tipos del protocolo de señalización ──────────────────

/**
 * Configuración operativa que debe aplicar el cliente móvil.
 *
 * Aunque se incluye también en la URL del QR para compatibilidad, la copia
 * guardada en el token es la autoridad real: evita que una pestaña antigua o
 * un QR pendiente conecten con un modo distinto al que pidió el mezclador.
 */
export interface MobileClientConfig {
  profile: string
  qualityMode: string
  bitrateMode: string
  senderMode: string
  maxBitrateKbps?: number | null
  audio: boolean
  localPreview: boolean
  cadenceMonitor: boolean
  stats: boolean
  statsIntervalMs: number
  transportCc: boolean
  codec: string
}

/** Información del dispositivo móvil que se conecta */
export interface DeviceInfo {
  userAgent: string
  clientConfig?: MobileClientConfig
}

/**
 * Métricas básicas de calidad WebRTC enviadas por el móvil.
 *
 * Nos ayudan a distinguir si los artefactos vienen de pérdida,
 * bitrate insuficiente o limitaciones activadas por el encoder.
 */
export interface ConnectionStats {
  bitrateKbps: number
  frameRate: number
  width: number
  height: number
  qualityMode?: string | null
  encodingPolicy?: string | null
  captureWidth: number | null
  captureHeight: number | null
  captureFrameRate: number | null
  localPreviewFps: number | null
  localPreviewSlowFrames: number | null
  localPreviewMaxIntervalMs: number | null
  framesSent: number | null
  framesEncoded: number | null
  encodedFrameRate: number | null
  encodeMsPerFrame: number | null
  sendDelayMsPerFrame: number | null
  encoderImplementation: string | null
  roundTripTimeMs: number | null
  packetsLost: number | null
  qualityLimitationReason: string | null
  availableOutgoingBitrateKbps: number | null
  localCandidateType: string | null
  remoteCandidateType: string | null
  localCandidateProtocol: string | null
  remoteCandidateProtocol: string | null
  pliCount: number
  firCount: number
  nackCount: number
  keyFramesEncoded: number
  deltaPliCount: number
  deltaFirCount: number
  deltaNackCount: number
  deltaKeyFramesEncoded: number
}

/** Mensaje del cliente móvil al servidor */
export type ClientMessage =
  | { type: 'join'; token: string; deviceInfo?: DeviceInfo }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'stats'; stats: ConnectionStats }
  | {
      type: 'client-log'
      level?: 'debug' | 'info' | 'warn' | 'error'
      message?: string
      detail?: string
    }
  | { type: 'bye' }

/** Mensaje del servidor al cliente móvil */
export type ServerMessage =
  | {
      type: 'welcome'
      peerId: string
      config: RTCConfigurationLike
      clientConfig?: MobileClientConfig
    }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'video-quality'; mode: 'monitor' | 'recording' | 'auto' }
  | { type: 'error'; code: string; message: string }
  | { type: 'ping' }

/** Configuración ICE para el cliente (sin tipos nativos de browser) */
export interface RTCConfigurationLike {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>
  iceTransportPolicy?: string
}

/** Estado de una conexión de cámara móvil */
export interface PeerSession {
  peerId: string
  token: string
  mobileConfig?: MobileClientConfig
  ws: WebSocket | null
  deviceInfo?: DeviceInfo
  lastStats?: ConnectionStats
  state: 'waiting' | 'connected' | 'streaming' | 'disconnected'
  createdAt: number
}

/** Eventos que el servicio de señalización emite a otros servicios */
export interface SignalingEvents {
  /** Un móvil se ha unido con su token */
  onPeerJoined: (peerId: string, deviceInfo?: DeviceInfo) => void
  /** Un móvil envía una SDP offer */
  onOffer: (peerId: string, sdp: RTCSessionDescriptionInit) => void
  /** Un móvil envía un ICE candidate */
  onIceCandidate: (peerId: string, candidate: RTCIceCandidateInit) => void
  /** Un móvil se desconecta */
  onPeerDisconnected: (peerId: string) => void
}

// ── Estado del servicio ──────────────────────────────────

let wss: WebSocketServer | null = null
// let _httpsServer: https.Server | null = null  // Reservado para futuro uso

/** Sesiones activas indexadas por peerId */
const peers = new Map<string, PeerSession>()

/** Tokens pendientes de conexión (token → peerId) */
const pendingTokens = new Map<string, string>()

/** Callbacks de eventos */
let events: SignalingEvents | null = null

/**
 * Tiempo máximo de vida de un token QR pendiente de uso.
 *
 * En un flujo local de plató basta con unos pocos minutos para escanear
 * el QR y conceder permisos en el móvil. Limitar su vida útil reduce el
 * riesgo de reutilizar enlaces antiguos o dejar sesiones huérfanas.
 */
const TOKEN_TTL_MS = 5 * 60 * 1000

interface ConnectionRejection {
  code: string
  message: string
  closeCode: number
  closeReason: string
}

/**
 * Configuración ICE para modo Local Studio.
 * Solo STUN público de Google (gratis, solo para descubrir la IP pública).
 * En LAN, los candidates host (IP local directa) son suficientes para P2P.
 */
const LOCAL_ICE_CONFIG: RTCConfigurationLike = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceTransportPolicy: 'all'
}

// ── API pública ──────────────────────────────────────────

/**
 * Inicia el servidor de señalización WebSocket sobre HTTPS.
 *
 * @param cert Certificado TLS autofirmado
 * @param port Puerto para el servidor HTTPS+WSS
 * @param callbacks Eventos de señalización para conectar con GStreamer
 */
export function startSignaling(
  _cert: TlsCert,
  existingServer: https.Server,
  callbacks: SignalingEvents
): void {
  events = callbacks

  // Crear WebSocket server sobre el mismo servidor HTTPS que sirve la página móvil
  wss = new WebSocketServer({ server: existingServer })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const rejection = validateConnectionRequest(
      req.headers.origin,
      req.headers.host,
      req.socket.remoteAddress
    )

    if (rejection) {
      console.warn(
        `[Signaling] Conexion rechazada (${rejection.code}) ` +
          `origin=${getHeaderValue(req.headers.origin) ?? 'n/a'} ` +
          `host=${getHeaderValue(req.headers.host) ?? 'n/a'} ` +
          `remote=${normalizeRemoteAddress(req.socket.remoteAddress) ?? 'n/a'}`
      )
      sendError(ws, rejection.code, rejection.message)
      ws.close(rejection.closeCode, rejection.closeReason)
      return
    }

    console.log(`[Signaling] Nueva conexión WebSocket desde ${req.socket.remoteAddress}`)
    handleConnection(ws)
  })

  console.log('[Signaling] Servidor de señalización WebSocket listo')
  console.log(`[Signaling] Log stats móviles: ${MOBILE_STATS_LOG_ENABLED ? 'on' : 'off'}`)
}

/**
 * Detiene el servidor de señalización.
 */
export function stopSignaling(): void {
  if (wss) {
    // Cerrar todas las conexiones activas
    for (const peer of peers.values()) {
      if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.close(1000, 'Servidor detenido')
      }
    }
    wss.close()
    wss = null
  }

  peers.clear()
  pendingTokens.clear()
  events = null
  console.log('[Signaling] Servidor de señalización detenido')
}

/**
 * Genera un nuevo token de conexión para una cámara.
 *
 * Crea un peerId único y un token que se incluirá en la URL del QR.
 * El móvil enviará este token en su mensaje 'join' para identificarse.
 *
 * @returns { peerId, token } para asociar la sesión con la fuente del mixer
 */
export function createConnectionToken(mobileConfig?: MobileClientConfig): {
  peerId: string
  token: string
} {
  cleanupExpiredPendingSessions()
  revokeWaitingConnectionTokens()

  const peerId = `cam-${randomUUID().slice(0, 8)}`
  const token = randomUUID()

  // Registrar sesión en estado 'waiting'
  const session: PeerSession = {
    peerId,
    token,
    mobileConfig,
    ws: null,
    state: 'waiting',
    createdAt: Date.now()
  }

  peers.set(peerId, session)
  pendingTokens.set(token, peerId)

  const configSummary = mobileConfig ? ` ${formatMobileClientConfig(mobileConfig)}` : ''
  console.log(`[Signaling] Token creado para ${peerId}: ${token.slice(0, 8)}...${configSummary}`)
  return { peerId, token }
}

/**
 * Envía una SDP answer al peer (respuesta de GStreamer webrtcbin).
 */
export function sendAnswer(peerId: string, sdp: RTCSessionDescriptionInit): void {
  const peer = peers.get(peerId)
  if (!peer?.ws || peer.ws.readyState !== WebSocket.OPEN) {
    console.warn(`[Signaling] No se puede enviar answer a ${peerId}: no conectado`)
    return
  }

  const msg: ServerMessage = { type: 'answer', sdp }
  peer.ws.send(JSON.stringify(msg))
}

/**
 * Envía un ICE candidate al peer (candidate de GStreamer webrtcbin).
 */
export function sendIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
  const peer = peers.get(peerId)
  if (!peer?.ws || peer.ws.readyState !== WebSocket.OPEN) return

  const msg: ServerMessage = { type: 'ice-candidate', candidate }
  peer.ws.send(JSON.stringify(msg))
}

/**
 * Envía un error de señalización a un peer concreto.
 * Se usa para rechazar condiciones operativas válidas pero no soportadas,
 * como intentar conectar más cámaras que slots WebRTC disponibles.
 */
export function sendPeerError(peerId: string, code: string, message: string): void {
  const peer = peers.get(peerId)
  if (!peer?.ws || peer.ws.readyState !== WebSocket.OPEN) return

  const msg: ServerMessage = { type: 'error', code, message }
  peer.ws.send(JSON.stringify(msg))
}

/**
 * Solicita a las cámaras móviles una política de codificación concreta.
 *
 * Esto sigue siendo plano de control: no transporta media, solo indica al
 * navegador si debe priorizar monitorización adaptativa o calidad de REC.
 */
export function setMobileVideoQualityMode(mode: 'monitor' | 'recording' | 'auto'): void {
  const msg: ServerMessage = { type: 'video-quality', mode }
  for (const peer of peers.values()) {
    if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(msg))
    }
  }
}

/**
 * Devuelve la lista de peers activos con su estado.
 */
export function getPeers(): Array<{ peerId: string; state: string }> {
  return Array.from(peers.values()).map((p) => ({
    peerId: p.peerId,
    state: p.state
  }))
}

/**
 * Elimina un peer y su token pendiente.
 */
export function removePeer(peerId: string): void {
  const peer = peers.get(peerId)
  if (peer) {
    pendingTokens.delete(peer.token)
    if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.close(1000, 'Peer eliminado')
    }
    peers.delete(peerId)
  }
}

// ── Lógica interna ───────────────────────────────────────

/**
 * Maneja una nueva conexión WebSocket.
 *
 * El primer mensaje del cliente debe ser 'join' con el token del QR.
 * Si el token es válido, se asocia el WebSocket con la sesión del peer.
 * Si no, se cierra la conexión con error.
 */
function handleConnection(ws: WebSocket): void {
  let peerId: string | null = null
  let disconnectNotified = false

  const notifyPeerDisconnected = (): void => {
    if (!peerId || disconnectNotified) {
      return
    }

    disconnectNotified = true

    console.log(`[Signaling] Peer ${peerId} desconectado`)

    const peer = peers.get(peerId)
    if (peer) {
      peer.state = 'disconnected'
      if (peer.ws === ws) {
        peer.ws = null
      }
    }

    events?.onPeerDisconnected(peerId)
  }

  ws.on('message', (rawData) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawData.toString()) as ClientMessage
    } catch {
      sendError(ws, 'PARSE_ERROR', 'Mensaje no es JSON válido')
      return
    }

    // Validar tipo de mensaje
    if (!msg.type) {
      sendError(ws, 'INVALID_MESSAGE', 'Falta campo type')
      return
    }

    switch (msg.type) {
      case 'join':
        peerId = handleJoin(ws, msg)
        break
      case 'offer':
        if (peerId) handleOffer(peerId, msg)
        else sendError(ws, 'NOT_JOINED', 'Envía join primero')
        break
      case 'ice-candidate':
        if (peerId) handleIceCandidate(peerId, msg)
        else sendError(ws, 'NOT_JOINED', 'Envía join primero')
        break
      case 'stats':
        if (peerId) handleStats(peerId, msg)
        else sendError(ws, 'NOT_JOINED', 'Envía join primero')
        break
      case 'client-log':
        if (peerId) handleClientLog(peerId, msg)
        else sendError(ws, 'NOT_JOINED', 'Envía join primero')
        break
      case 'bye':
        if (peerId) handleBye(peerId, notifyPeerDisconnected)
        break
      default:
        sendError(
          ws,
          'UNKNOWN_TYPE',
          `Tipo de mensaje desconocido: ${(msg as { type: string }).type}`
        )
    }
  })

  ws.on('close', () => {
    notifyPeerDisconnected()
  })

  ws.on('error', (err) => {
    console.error(`[Signaling] Error WebSocket:`, err.message)
  })
}

/**
 * Procesa un mensaje 'join': el móvil se identifica con su token.
 *
 * Valida el token, asocia el WebSocket con la sesión, y envía
 * un mensaje 'welcome' con la configuración ICE y el peerId.
 */
function handleJoin(
  ws: WebSocket,
  msg: { type: 'join'; token: string; deviceInfo?: DeviceInfo },
  now: number = Date.now()
): string | null {
  const { token, deviceInfo } = msg

  cleanupExpiredPendingSessions(now)

  // Buscar el peerId asociado al token
  const peerId = pendingTokens.get(token)
  if (!peerId) {
    sendError(ws, 'INVALID_TOKEN', 'Token no válido o expirado')
    ws.close(4001, 'Token invalido')
    return null
  }

  const peer = peers.get(peerId)
  if (!peer) {
    sendError(ws, 'SESSION_NOT_FOUND', 'Sesión no encontrada')
    ws.close(4002, 'Sesión no encontrada')
    return null
  }

  if (isPendingTokenExpired(peer, now)) {
    pendingTokens.delete(token)
    peers.delete(peer.peerId)
    sendError(ws, 'INVALID_TOKEN', 'Token no válido o expirado')
    ws.close(4001, 'Token invalido')
    return null
  }

  const reportedClientConfig = deviceInfo?.clientConfig
  const hasClientConfigMismatch =
    Boolean(peer.mobileConfig && reportedClientConfig) &&
    formatMobileClientConfig(peer.mobileConfig as MobileClientConfig) !==
      formatMobileClientConfig(reportedClientConfig as MobileClientConfig)
  const effectiveDeviceInfo =
    peer.mobileConfig && deviceInfo
      ? { ...deviceInfo, clientConfig: peer.mobileConfig }
      : peer.mobileConfig
        ? { userAgent: deviceInfo?.userAgent ?? 'unknown', clientConfig: peer.mobileConfig }
        : deviceInfo

  // Asociar WebSocket con la sesión
  peer.ws = ws
  peer.state = 'connected'
  peer.deviceInfo = effectiveDeviceInfo

  // Ya no necesitamos el token pendiente
  pendingTokens.delete(token)

  const expectedConfigSummary = peer.mobileConfig
    ? ` qr={${formatMobileClientConfig(peer.mobileConfig)}}`
    : ''
  const clientConfigSummary = deviceInfo?.clientConfig
    ? ` mobile={${formatMobileClientConfig(deviceInfo.clientConfig)}}`
    : ''

  console.log(
    `[Signaling] Peer ${peerId} autenticado correctamente` +
      `${expectedConfigSummary}${clientConfigSummary}`
  )
  if (hasClientConfigMismatch) {
    console.warn(
      `[Signaling] Config móvil reportada por ${peerId} no coincide con el QR; ` +
        'se usará la copia autoritaria guardada en el token y enviada en welcome'
    )
  }

  // Enviar welcome con configuración ICE
  const welcomeMsg: ServerMessage = {
    type: 'welcome',
    peerId,
    config: LOCAL_ICE_CONFIG,
    clientConfig: peer.mobileConfig
  }
  ws.send(JSON.stringify(welcomeMsg))

  // Notificar a otros servicios (para crear webrtcbin, actualizar UI, etc.)
  events?.onPeerJoined(peerId, effectiveDeviceInfo)

  return peerId
}

/**
 * Retransmite la SDP offer del móvil al servicio de GStreamer.
 */
function handleOffer(peerId: string, msg: { type: 'offer'; sdp: RTCSessionDescriptionInit }): void {
  console.log(`[Signaling] Offer recibida de ${peerId}`)
  events?.onOffer(peerId, msg.sdp)
}

/**
 * Retransmite un ICE candidate del móvil al servicio de GStreamer.
 */
function handleIceCandidate(
  peerId: string,
  msg: { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
): void {
  events?.onIceCandidate(peerId, msg.candidate)
}

/**
 * Recibe estadísticas periódicas del móvil.
 *
 * Si durante movimiento fuerte aparecen artefactos, estas métricas nos dicen
 * si el navegador se está limitando por ancho de banda, CPU o pérdida RTP.
 */
function handleStats(peerId: string, msg: { type: 'stats'; stats: ConnectionStats }): void {
  const peer = peers.get(peerId)
  if (!peer) {
    return
  }

  peer.state = 'streaming'
  peer.lastStats = msg.stats

  if (!MOBILE_STATS_LOG_ENABLED) {
    return
  }

  const {
    width,
    height,
    frameRate,
    qualityMode,
    encodingPolicy,
    captureWidth,
    captureHeight,
    captureFrameRate,
    localPreviewFps,
    localPreviewSlowFrames,
    localPreviewMaxIntervalMs,
    framesSent,
    framesEncoded,
    encodedFrameRate,
    encodeMsPerFrame,
    sendDelayMsPerFrame,
    encoderImplementation,
    bitrateKbps,
    packetsLost,
    roundTripTimeMs,
    qualityLimitationReason,
    availableOutgoingBitrateKbps,
    localCandidateType,
    remoteCandidateType,
    localCandidateProtocol,
    remoteCandidateProtocol,
    pliCount,
    firCount,
    nackCount,
    keyFramesEncoded,
    deltaPliCount,
    deltaFirCount,
    deltaNackCount,
    deltaKeyFramesEncoded
  } = msg.stats

  console.log(
    `[Signaling] Stats ${peerId}: capture=${captureWidth ?? '?'}x${captureHeight ?? '?'} ` +
      `@${captureFrameRate ?? '?'}fps send=${width}x${height} ${frameRate}fps ` +
      `mode=${qualityMode ?? 'n/a'}/${encodingPolicy ?? 'n/a'} ` +
      `local=${localPreviewFps ?? 'n/a'}fps/${localPreviewMaxIntervalMs ?? 'n/a'}ms` +
      `(+${localPreviewSlowFrames ?? 'n/a'} slow) ` +
      `frames=sent:${framesSent ?? 'n/a'} enc:${framesEncoded ?? 'n/a'} ` +
      `encFps=${encodedFrameRate ?? 'n/a'} ` +
      `encode=${encodeMsPerFrame ?? 'n/a'}ms sendDelay=${sendDelayMsPerFrame ?? 'n/a'}ms ` +
      `encoder=${encoderImplementation ?? 'n/a'} ` +
      `${bitrateKbps}kbps lost=${packetsLost ?? 'n/a'} ` +
      `rtt=${roundTripTimeMs ?? 'n/a'}ms limit=${qualityLimitationReason ?? 'none'} ` +
      `avail=${availableOutgoingBitrateKbps ?? 'n/a'}kbps ` +
      `pair=${localCandidateType ?? 'n/a'}->${remoteCandidateType ?? 'n/a'} ` +
      `proto=${localCandidateProtocol ?? 'n/a'}->${remoteCandidateProtocol ?? 'n/a'} ` +
      `pli=${pliCount}(+${deltaPliCount}) fir=${firCount}(+${deltaFirCount}) ` +
      `nack=${nackCount}(+${deltaNackCount}) keyframes=${keyFramesEncoded}(+${deltaKeyFramesEncoded})`
  )
}

function sanitizeLogText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 500) : ''
}

function handleClientLog(
  peerId: string,
  msg: {
    type: 'client-log'
    level?: 'debug' | 'info' | 'warn' | 'error'
    message?: string
    detail?: string
  }
): void {
  const level =
    msg.level === 'error' || msg.level === 'warn' || msg.level === 'debug' ? msg.level : 'info'
  const message = sanitizeLogText(msg.message) || 'mensaje sin texto'
  const detail = sanitizeLogText(msg.detail)
  const line = `[Mobile:${peerId}] ${message}${detail ? ` — ${detail}` : ''}`

  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

/**
 * El móvil indica que quiere desconectarse.
 */
function handleBye(peerId: string, notifyPeerDisconnected: () => void): void {
  console.log(`[Signaling] Bye de ${peerId}`)
  const peer = peers.get(peerId)
  if (peer) {
    peer.state = 'disconnected'
    if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.close(1000, 'Peer cerró la sesión')
    } else {
      peer.ws = null
    }
  }
  notifyPeerDisconnected()
}

/**
 * Envía un mensaje de error al cliente.
 */
function sendError(ws: WebSocket, code: string, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    const msg: ServerMessage = { type: 'error', code, message }
    ws.send(JSON.stringify(msg))
  }
}

/**
 * Extrae el valor único de una cabecera HTTP.
 *
 * Node permite cabeceras repetidas como array. En este servicio solo nos
 * interesan las variantes simples de Host y Origin.
 */
function getHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0]
  }

  return null
}

/**
 * Normaliza la IP remota para poder aplicar reglas LAN de forma estable.
 *
 * En macOS/Node es frecuente recibir IPv4 encapsulada como `::ffff:x.x.x.x`
 * o direcciones IPv6 con zone id (`fe80::1%en0`). Esta función elimina ese
 * ruido para comparar contra rangos LAN reales.
 */
function normalizeRemoteAddress(remoteAddress: string | null | undefined): string | null {
  if (!remoteAddress) {
    return null
  }

  const addressWithoutZone = remoteAddress.split('%')[0]
  if (addressWithoutZone.startsWith('::ffff:')) {
    return addressWithoutZone.slice(7)
  }

  return addressWithoutZone
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = octets

  return (
    first === 10 ||
    first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254)
  )
}

/**
 * Comprueba si la conexión entrante procede de loopback o de una red privada.
 *
 * En modo Local Studio no queremos aceptar peers desde Internet. Filtrar por
 * IP remota no sustituye a un firewall, pero sí evita conexiones accidentales
 * fuera del alcance esperado del MVP local.
 */
function isLocalNetworkAddress(remoteAddress: string | null | undefined): boolean {
  const normalized = normalizeRemoteAddress(remoteAddress)
  if (!normalized) {
    return false
  }

  if (normalized === '::1') {
    return true
  }

  if (normalized.includes(':')) {
    const lowerAddress = normalized.toLowerCase()
    return (
      lowerAddress.startsWith('fe80:') ||
      lowerAddress.startsWith('fc') ||
      lowerAddress.startsWith('fd')
    )
  }

  return isPrivateIpv4(normalized)
}

/**
 * Verifica que el WebSocket proviene de la misma página HTTPS servida por la app.
 *
 * El navegador móvil abre `/cam` y luego conecta a `wss://window.location.host`.
 * Exigir el mismo Host y protocolo HTTPS evita que otra web abierta en el mismo
 * dispositivo reutilice el token para intentar secuestrar la sesión.
 */
function isAllowedOrigin(
  originHeader: string | string[] | undefined,
  hostHeader: string | string[] | undefined
): boolean {
  const origin = getHeaderValue(originHeader)
  const host = getHeaderValue(hostHeader)

  if (!origin || !host) {
    return false
  }

  try {
    const parsedOrigin = new URL(origin)
    return (
      parsedOrigin.protocol === 'https:' && parsedOrigin.host.toLowerCase() === host.toLowerCase()
    )
  } catch {
    return false
  }
}

function validateConnectionRequest(
  originHeader: string | string[] | undefined,
  hostHeader: string | string[] | undefined,
  remoteAddress: string | null | undefined
): ConnectionRejection | null {
  if (!isLocalNetworkAddress(remoteAddress)) {
    return {
      code: 'NON_LOCAL_NETWORK',
      message: 'Solo se aceptan conexiones desde la red local',
      closeCode: 4003,
      closeReason: 'Red no local'
    }
  }

  if (!isAllowedOrigin(originHeader, hostHeader)) {
    return {
      code: 'FORBIDDEN_ORIGIN',
      message: 'Origin no autorizado para este servidor WebSocket',
      closeCode: 4004,
      closeReason: 'Origin no autorizado'
    }
  }

  return null
}

function isPendingTokenExpired(
  peer: Pick<PeerSession, 'state' | 'createdAt'>,
  now: number = Date.now()
): boolean {
  return peer.state === 'waiting' && now - peer.createdAt > TOKEN_TTL_MS
}

function formatMobileClientConfig(config: MobileClientConfig): string {
  return (
    `profile=${config.profile} quality=${config.qualityMode} ` +
    `bitrate=${config.bitrateMode} sender=${config.senderMode} ` +
    `maxBitrate=${config.maxBitrateKbps ? `${config.maxBitrateKbps}kbps` : 'profile'} ` +
    `audio=${config.audio ? 'on' : 'off'} ` +
    `preview=${config.localPreview ? 'on' : 'off'} ` +
    `cadence=${config.cadenceMonitor ? 'on' : 'off'} ` +
    `stats=${config.stats ? 'on' : 'off'} ` +
    `statsIntervalMs=${config.statsIntervalMs} ` +
    `twcc=${config.transportCc ? 'on' : 'off'} codec=${config.codec}`
  )
}

/**
 * Mantiene un único QR pendiente.
 *
 * La interfaz solo muestra un QR activo cada vez; si dejamos varios tokens
 * esperando, un móvil puede escanear una pestaña o captura vieja y conectar
 * con una configuración que ya no representa la prueba actual.
 */
function revokeWaitingConnectionTokens(): void {
  for (const [peerId, peer] of peers.entries()) {
    if (peer.state !== 'waiting') {
      continue
    }

    pendingTokens.delete(peer.token)
    peers.delete(peerId)
    console.log(`[Signaling] Token pendiente revocado para ${peerId}`)
  }
}

/**
 * Limpia tokens QR caducados antes de generar o aceptar nuevas sesiones.
 *
 * Así evitamos que el mapa interno acumule entradas antiguas y, sobre todo,
 * garantizamos que un enlace QR viejo deje de ser válido aunque nadie lo borre
 * manualmente desde la interfaz.
 */
function cleanupExpiredPendingSessions(now: number = Date.now()): void {
  for (const [peerId, peer] of peers.entries()) {
    if (!pendingTokens.has(peer.token) || !isPendingTokenExpired(peer, now)) {
      continue
    }

    pendingTokens.delete(peer.token)
    peers.delete(peerId)
    console.log(`[Signaling] Token expirado para ${peerId}`)
  }
}

export const __testing = {
  TOKEN_TTL_MS,
  handleJoin,
  isAllowedOrigin,
  isLocalNetworkAddress,
  isPendingTokenExpired,
  validateConnectionRequest
}
