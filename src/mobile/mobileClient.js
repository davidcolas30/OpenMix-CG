/**
 * Cliente WebRTC del móvil para OpenMix-CG.
 *
 * Flujo de conexión:
 * 1. Extraer token de la URL
 * 2. Conectar al WebSocket de señalización (wss://<host>/ws)
 * 3. Enviar 'join' con el token
 * 4. Recibir 'welcome' con configuración ICE
 * 5. Obtener acceso a la cámara (getUserMedia)
 * 6. Crear RTCPeerConnection con la configuración ICE
 * 7. Añadir tracks de la cámara al peer connection
 * 8. Crear SDP offer y enviarla por señalización
 * 9. Recibir SDP answer e ICE candidates del servidor
 * 10. Conexión P2P establecida → el stream llega a GStreamer
 */

// ── Estado ──────────────────────────────────────────
let ws = null
let pc = null
let localStream = null
let peerId = null
let currentFacingMode = 'environment' // Cámara trasera por defecto
let makingOffer = false
let hasSentInitialOffer = false
let restartIceRequested = false
let statsIntervalId = null
let lastVideoStatsSnapshot = null
let currentVideoTrack = null
let torchSupported = false
let torchEnabled = false
let postWarmupKeyframeRequested = false
let postWarmupKeyframeUnsupportedLogged = false
/*
 * Defaults defensivos del cliente móvil.
 *
 * La configuración autoritaria llega por dos vías: parámetros del QR y el
 * `welcome` del servidor. Aun así, estos valores de arranque deben reflejar
 * el perfil ligero actual para que una URL incompleta o una recarga vieja no
 * reactive audio, preview local, diagnósticos o el modo de bitrate que ya
 * vimos que podía introducir pulsos en Android.
 */
let mobileVideoQualityMode = 'auto'
let autoVideoEncodingPolicy = 'framerate'
let autoVideoPromotionSamples = 0
let autoVideoDemotionSamples = 0
let lastAutoVideoPolicySwitchAt = 0
let mobileBitrateMode = 'cap'
let mobileSenderMode = 'managed'
let mobileAudioEnabled = false
let mobileLocalPreviewEnabled = false
let mobileCadenceMonitorEnabled = false
let preferredVideoCodec = 'h264'
let mobileStatsEnabled = false
let mobileTransportCcEnabled = true
let mobileMaxBitrateOverrideKbps = null
let localFrameCadenceHandle = null
let localFrameCadenceLastWallTime = 0
let localFrameCadenceWindowStart = 0
let localFrameCadenceFrames = 0
let localFrameCadenceSlowFrames = 0
let localFrameCadenceMaxIntervalMs = 0
let latestLocalFrameCadenceStats = null

const mobileVideoPolicy = window.OpenMixMobileVideoPolicy

if (!mobileVideoPolicy) {
  throw new Error('OpenMixMobileVideoPolicy no está disponible')
}

const mobileSdpUtils = window.OpenMixMobileSdpUtils

if (!mobileSdpUtils) {
  throw new Error('OpenMixMobileSdpUtils no está disponible')
}

const {
  MOBILE_VIDEO_PROFILES,
  MOBILE_VIDEO_PROFILE_ORDER,
  DEFAULT_MOBILE_VIDEO_STATS_INTERVAL_MS,
  POST_WARMUP_KEYFRAME_MIN_BITRATE_KBPS,
  POST_WARMUP_KEYFRAME_MIN_FPS,
  AUTO_VIDEO_PROMOTION_MIN_FPS,
  AUTO_VIDEO_PROMOTION_MIN_AVAILABLE_KBPS,
  AUTO_VIDEO_PROMOTION_REQUIRED_SAMPLES,
  AUTO_VIDEO_DEMOTION_MAX_FPS,
  AUTO_VIDEO_DEMOTION_MAX_AVAILABLE_KBPS,
  AUTO_VIDEO_DEMOTION_REQUIRED_SAMPLES,
  AUTO_VIDEO_MIN_SWITCH_INTERVAL_MS
} = mobileVideoPolicy
let activeVideoProfileId = 'fullhd'
let mobileVideoStatsIntervalMs = DEFAULT_MOBILE_VIDEO_STATS_INTERVAL_MS

function isResolutionConstraintError(error) {
  return error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError'
}

function isPortraitVideoRequest() {
  if (window.matchMedia) {
    return window.matchMedia('(orientation: portrait)').matches
  }

  return window.innerHeight > window.innerWidth
}

// ── Elementos DOM ───────────────────────────────────
const connectScreen = document.getElementById('connect-screen')
const connectStatus = document.getElementById('connect-status')
const previewContainer = document.getElementById('preview-container')
const localVideo = document.getElementById('localVideo')
const controls = document.getElementById('controls')
const statusBadge = document.getElementById('status-badge')
const statusMeta = document.getElementById('status-meta')
const statusNote = document.getElementById('status-note')
const btnFlip = document.getElementById('btn-flip')
const btnProfile = document.getElementById('btn-profile')
const btnTorch = document.getElementById('btn-torch')
const btnDisconnect = document.getElementById('btn-disconnect')
const mobileClientConfig = window.OpenMixMobileClientConfig

if (!mobileClientConfig) {
  throw new Error('OpenMixMobileClientConfig no está disponible')
}

function updateLocalPreviewOrientation() {
  // Los navegadores móviles modernos gestionan automáticamente la
  // orientación del stream de getUserMedia. No aplicamos rotación CSS
  // manual para evitar conflictos con el comportamiento nativo.
  localVideo.style.setProperty('--preview-max-width', '100%')
  localVideo.style.setProperty('--preview-max-height', '100%')
}

localVideo.addEventListener('loadedmetadata', updateLocalPreviewOrientation)
window.addEventListener('resize', updateLocalPreviewOrientation)
window.screen?.orientation?.addEventListener?.('change', updateLocalPreviewOrientation)

function resetLocalFrameCadenceWindow(now = performance.now()) {
  localFrameCadenceLastWallTime = 0
  localFrameCadenceWindowStart = now
  localFrameCadenceFrames = 0
  localFrameCadenceSlowFrames = 0
  localFrameCadenceMaxIntervalMs = 0
}

function stopLocalFrameCadenceMonitor() {
  if (
    localFrameCadenceHandle !== null &&
    typeof localVideo.cancelVideoFrameCallback === 'function'
  ) {
    localVideo.cancelVideoFrameCallback(localFrameCadenceHandle)
  }

  localFrameCadenceHandle = null
  latestLocalFrameCadenceStats = null
  resetLocalFrameCadenceWindow()
}

function startLocalFrameCadenceMonitor() {
  stopLocalFrameCadenceMonitor()

  if (typeof localVideo.requestVideoFrameCallback !== 'function') {
    console.log('[Camera] requestVideoFrameCallback no disponible; sin cadencia local')
    return
  }

  resetLocalFrameCadenceWindow()

  const onFrame = (now) => {
    if (localFrameCadenceHandle === null) {
      return
    }

    if (localFrameCadenceLastWallTime > 0) {
      const intervalMs = now - localFrameCadenceLastWallTime
      localFrameCadenceMaxIntervalMs = Math.max(localFrameCadenceMaxIntervalMs, intervalMs)
      if (intervalMs > 45) {
        localFrameCadenceSlowFrames += 1
      }
    }

    localFrameCadenceLastWallTime = now
    localFrameCadenceFrames += 1

    const elapsedMs = now - localFrameCadenceWindowStart
    if (elapsedMs >= 1000) {
      latestLocalFrameCadenceStats = {
        fps: Math.round((localFrameCadenceFrames * 1000) / elapsedMs),
        slowFrames: localFrameCadenceSlowFrames,
        maxIntervalMs: Math.round(localFrameCadenceMaxIntervalMs)
      }
      resetLocalFrameCadenceWindow(now)
    }

    localFrameCadenceHandle = localVideo.requestVideoFrameCallback(onFrame)
  }

  localFrameCadenceHandle = localVideo.requestVideoFrameCallback(onFrame)
}

function parseMobileMaxBitrateKbps(value) {
  return mobileClientConfig.parseMaxBitrateKbps(value)
}

function applyNormalizedMobileClientConfig(config) {
  if (!config || typeof config !== 'object') {
    return
  }

  if (config.preset === 'historical') {
    // Modo de diagnóstico: aproxima el cliente móvil al comportamiento del
    // perfil operativo validado donde la ruta nativa iba fluida en Android.
    // Desactiva los ajustes experimentales añadidos después para aislar si
    // el pulso nace en el emisor WebRTC o más adelante.
    mobileVideoQualityMode = 'monitor'
    mobileBitrateMode = 'auto'
    mobileSenderMode = 'legacy'
    mobileAudioEnabled = false
    mobileCadenceMonitorEnabled = false
    mobileStatsEnabled = false
    preferredVideoCodec = 'h264'
    console.log('[OpenMix-CG] Preset móvil histórico activo')
  }

  if (config.profile && config.profile in MOBILE_VIDEO_PROFILES) {
    activeVideoProfileId = config.profile
  }
  if (config.qualityMode) {
    mobileVideoQualityMode = config.qualityMode
  }
  if (config.codec) {
    preferredVideoCodec = config.codec
  }
  if (config.bitrateMode) {
    mobileBitrateMode = config.bitrateMode
  }
  if (config.senderMode) {
    mobileSenderMode = config.senderMode
  }
  if (typeof config.audio === 'boolean') {
    mobileAudioEnabled = config.audio
  }
  if (typeof config.localPreview === 'boolean') {
    mobileLocalPreviewEnabled = config.localPreview
  }
  if (typeof config.cadenceMonitor === 'boolean') {
    mobileCadenceMonitorEnabled = config.cadenceMonitor
  }
  if (typeof config.stats === 'boolean') {
    mobileStatsEnabled = config.stats
  }
  if (typeof config.transportCc === 'boolean') {
    mobileTransportCcEnabled = config.transportCc
  }
  if (Object.prototype.hasOwnProperty.call(config, 'maxBitrateKbps')) {
    mobileMaxBitrateOverrideKbps = config.maxBitrateKbps
  }
  if (Number.isFinite(config.statsIntervalMs) && config.statsIntervalMs > 0) {
    mobileVideoStatsIntervalMs = config.statsIntervalMs
  }
}

function getEffectiveMaxBitrateBps(profileMaxBitrate) {
  return mobileMaxBitrateOverrideKbps ? mobileMaxBitrateOverrideKbps * 1000 : profileMaxBitrate
}

function isLegacySenderMode() {
  return mobileSenderMode === 'legacy'
}

function sendClientLog(level, message, detail) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  ws.send(
    JSON.stringify({
      type: 'client-log',
      level,
      message,
      detail
    })
  )
}

function describeError(err) {
  if (!err) {
    return ''
  }

  const name = err.name ? `${err.name}: ` : ''
  const message = err.message || String(err)
  return `${name}${message}`
}

window.addEventListener('error', (event) => {
  sendClientLog('error', 'Error JavaScript no capturado en cliente movil', event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  sendClientLog(
    'error',
    'Promesa rechazada no capturada en cliente movil',
    describeError(event.reason)
  )
})

// ── Punto de entrada ────────────────────────────────
async function main() {
  // Extraer el token de la URL (?token=xxx)
  const queryClientConfig = mobileClientConfig.parseQueryConfig(
    window.location.search,
    Object.keys(MOBILE_VIDEO_PROFILES)
  )
  const token = queryClientConfig.token
  applyNormalizedMobileClientConfig(queryClientConfig.config)

  updateProfileButton()

  if (!token) {
    setConnectError('No se encontró token en la URL. Escanea el código QR desde OpenMix-CG.')
    return
  }

  // Conectar al WebSocket en la misma dirección que cargó la página
  const wsUrl = `wss://${window.location.host}`
  connectWebSocket(wsUrl, token)
}

// ── WebSocket de señalización ───────────────────────

function connectWebSocket(url, token) {
  connectStatus.textContent = 'Conectando al servidor...'

  ws = new WebSocket(url)

  ws.onopen = () => {
    console.log('[WS] Conectado')
    connectStatus.textContent = 'Autenticando...'

    // Enviar 'join' con el token para identificarnos
    ws.send(
      JSON.stringify({
        type: 'join',
        token: token,
        deviceInfo: {
          userAgent: navigator.userAgent,
          clientConfig: {
            profile: activeVideoProfileId,
            qualityMode: mobileVideoQualityMode,
            bitrateMode: mobileBitrateMode,
            senderMode: mobileSenderMode,
            maxBitrateKbps: mobileMaxBitrateOverrideKbps,
            audio: mobileAudioEnabled,
            localPreview: mobileLocalPreviewEnabled,
            cadenceMonitor: mobileCadenceMonitorEnabled,
            stats: mobileStatsEnabled,
            statsIntervalMs: mobileVideoStatsIntervalMs,
            transportCc: mobileTransportCcEnabled,
            codec: preferredVideoCodec
          }
        }
      })
    )
  }

  ws.onmessage = async (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      console.error('[WS] Mensaje no válido:', event.data)
      return
    }

    switch (msg.type) {
      case 'welcome':
        // Autenticación exitosa — comenzar flujo WebRTC
        peerId = msg.peerId
        console.log(`[WS] Welcome — peerId: ${peerId}`)
        applyServerClientConfig(msg.clientConfig)
        await startCamera(msg.config)
        break

      case 'answer':
        // El servidor (GStreamer) respondió con su SDP
        console.log('[WS] Answer recibida')
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(msg.sdp)
        }
        break

      case 'ice-candidate':
        // El servidor envía un ICE candidate
        if (pc) {
          await pc.addIceCandidate(msg.candidate)
        }
        break

      case 'video-quality':
        await applyVideoQualityMode(
          msg.mode === 'recording' ? 'recording' : msg.mode === 'auto' ? 'auto' : 'monitor'
        )
        break

      case 'error':
        console.error(`[WS] Error: ${msg.code} — ${msg.message}`)
        setConnectError(`Error: ${msg.message}`)
        break

      case 'ping':
        // Keep-alive — no hacer nada
        break

      default:
        console.warn('[WS] Mensaje desconocido:', msg.type)
    }
  }

  ws.onclose = (event) => {
    console.log(`[WS] Desconectado: ${event.code} ${event.reason}`)
    stopStatsReporting()
    setStatus('disconnected', 'Desconectado')
  }

  ws.onerror = () => {
    setConnectError('Error de conexión. Verifica que el mezclador está activo.')
  }
}

// ── Cámara y WebRTC ─────────────────────────────────

/**
 * Inicia la captura de cámara y crea la conexión WebRTC.
 *
 * Pasos:
 * 1. getUserMedia → obtener stream de cámara/micrófono
 * 2. Mostrar preview local
 * 3. Crear RTCPeerConnection
 * 4. Añadir tracks al peer connection
 * 5. Crear y enviar SDP offer
 */
async function startCamera(iceConfig) {
  try {
    connectStatus.textContent = 'Accediendo a la cámara...'
    stopStatsReporting()

    // Pedir acceso a cámara y micrófono
    localStream = await requestLocalMediaStream()

    // La vista local ayuda al operador de cámara, pero durante diagnóstico
    // puede apagarse para comprobar si Chrome/Android está gastando tiempo
    // renderizando la propia previsualización del móvil.
    if (mobileLocalPreviewEnabled) {
      localVideo.srcObject = localStream
    } else {
      localVideo.srcObject = null
    }
    if (mobileLocalPreviewEnabled && mobileCadenceMonitorEnabled) {
      startLocalFrameCadenceMonitor()
    } else {
      stopLocalFrameCadenceMonitor()
      console.log(
        `[Camera] Preview local=${mobileLocalPreviewEnabled ? 'on' : 'off'} ` +
          `cadencia=${mobileCadenceMonitorEnabled ? 'on' : 'off'}`
      )
    }

    // Cambiar a la vista de streaming
    connectScreen.classList.add('hidden')
    previewContainer.classList.remove('hidden')
    controls.classList.remove('hidden')

    setStatus('connecting', 'Conectando...')

    // Crear peer connection con la configuración ICE del servidor
    createPeerConnection(iceConfig)

    // Resetear flags de negociación para esta sesión.
    // El cliente móvil usa una sola conexión PC a la vez, así que
    // estos flags globales son suficientes.
    makingOffer = false
    hasSentInitialOffer = false
    restartIceRequested = false
    postWarmupKeyframeRequested = false
    postWarmupKeyframeUnsupportedLogged = false
    resetAutoVideoPolicy(mobileVideoQualityMode === 'recording' ? 'resolution' : 'framerate')

    // Añadir tracks al peer connection.
    // Para vídeo usamos addTransceiver para poder fijar preferencias
    // de codec ANTES de crear la offer. Esto nos permite priorizar
    // H264 frente a VP8 cuando el navegador lo soporta.
    const videoTrack = localStream.getVideoTracks()[0]
    const audioTrack = localStream.getAudioTracks()[0]
    await prepareVideoTrack(videoTrack, 'Captura inicial')

    if (videoTrack) {
      const videoTransceiver = pc.addTransceiver(videoTrack, {
        direction: 'sendonly',
        streams: [localStream]
      })
      preferVideoCodec(videoTransceiver)
      await configureVideoSender(videoTransceiver.sender)
    }

    if (audioTrack) {
      pc.addTrack(audioTrack, localStream)
    }

    // La adición de tracks dispara 'negotiationneeded' automáticamente
    // → se creará la offer en el handler
  } catch (err) {
    console.error('[Camera] Error:', err)
    if (err.name === 'NotAllowedError') {
      setConnectError('Permiso de cámara denegado. Permite el acceso e intenta de nuevo.')
    } else if (err.name === 'NotFoundError') {
      setConnectError('No se encontró cámara en este dispositivo.')
    } else {
      setConnectError(`Error de cámara: ${err.message}`)
    }
    sendClientLog('error', 'Fallo al iniciar camara/WebRTC', describeError(err))
  }
}

/**
 * Crea el RTCPeerConnection y configura sus callbacks.
 *
 * El peer connection es el corazón de WebRTC:
 * - Negocia codecs (via SDP)
 * - Gestiona ICE candidates (descubrimiento de IPs/puertos)
 * - Establece conexión P2P cifrada (DTLS/SRTP)
 * - Transporta los tracks de vídeo/audio
 */
function createPeerConnection(iceConfig) {
  pc = new RTCPeerConnection(iceConfig)

  // Cuando ICE descubre un candidate, enviarlo al servidor
  pc.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON()
        })
      )
    }
  }

  // Monitorizar estado de la conexión ICE
  pc.oniceconnectionstatechange = () => {
    console.log(`[ICE] Estado: ${pc.iceConnectionState}`)
    switch (pc.iceConnectionState) {
      case 'checking':
        setStatus('connecting', 'Conectando...')
        break
      case 'connected':
      case 'completed':
        setStatus('streaming', 'En vivo')
        requestWakeLock() // Evitar que la pantalla se apague
        startStatsReporting()
        break
      case 'disconnected':
        setStatus('connecting', 'Reconectando...')
        stopStatsReporting()
        break
      case 'failed':
        setStatus('error', 'Conexión fallida')
        stopStatsReporting()
        // Intentar ICE restart
        restartIceRequested = true
        pc.restartIce()
        break
    }
  }

  // Crear offer cuando se necesita negociación
  pc.onnegotiationneeded = async () => {
    // Safari/WebKit puede disparar negotiationneeded varias veces
    // durante el arranque (tracks, codec preferences, setParameters).
    // Para este cliente solo necesitamos la primera offer y, en el
    // futuro, las derivadas de un ICE restart explícito.
    if (makingOffer) {
      console.log('[WebRTC] negotiationneeded ignorado: ya se está creando una offer')
      return
    }
    if (pc.signalingState !== 'stable') {
      console.log(`[WebRTC] negotiationneeded ignorado: signalingState=${pc.signalingState}`)
      return
    }
    if (hasSentInitialOffer && !restartIceRequested) {
      console.log('[WebRTC] negotiationneeded ignorado: la offer inicial ya se envió')
      return
    }

    try {
      makingOffer = true
      const rawOffer = await pc.createOffer()
      const videoProfile = getActiveVideoProfile()
      const sdpProfileMaxBitrate =
        videoProfile.sdpMaxBitrate || videoProfile.recordingMaxBitrate || videoProfile.maxBitrate
      const offer = mobileSdpUtils.applyVideoSdpTransportCcPolicy(
        mobileSdpUtils.applyVideoSdpBitrateHints(rawOffer, {
          senderMode: mobileSenderMode,
          bitrateMode: mobileBitrateMode,
          videoProfile,
          maxBitrateBps: getEffectiveMaxBitrateBps(sdpProfileMaxBitrate)
        }),
        { transportCcEnabled: mobileTransportCcEnabled }
      )
      await pc.setLocalDescription(offer)

      // Enviar la offer al servidor via señalización
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'offer',
            sdp: pc.localDescription
          })
        )
        hasSentInitialOffer = true
        restartIceRequested = false
      }
    } catch (err) {
      console.error('[WebRTC] Error creando offer:', err)
      setStatus('error', 'Error WebRTC')
      setStatusNote('No se pudo crear la oferta WebRTC. Revisa el log de OpenMix-CG.')
      sendClientLog('error', 'Error creando offer WebRTC', describeError(err))
    } finally {
      makingOffer = false
    }
  }
}

/**
 * Prioriza H264 cuando el navegador lo soporta.
 *
 * ¿Por qué?
 * - En nuestras pruebas actuales, el móvil está negociando VP8.
 * - La ruta VP8 sigue mostrando corrupción con el tiempo.
 * - En el receptor GStreamer ya existe una rama H264 explícita con
 *   `vtdec` (macOS, hardware VideoToolbox) o `avdec_h264` (software),
 *
 * Dentro de H264, aquí priorizamos estabilidad temporal: algunos móviles
 * exponen perfiles High que conservan detalle, pero en la práctica pueden
 * derribar la cadencia del sender aunque la red esté limpia.
 *
 * Si H264 no está disponible, mantenemos VP8 como fallback.
 */
function preferVideoCodec(transceiver) {
  if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') {
    console.log('[WebRTC] setCodecPreferences no disponible; se usará selección automática')
    return
  }

  const caps = window.RTCRtpSender?.getCapabilities?.('video')
  if (!caps?.codecs?.length) {
    console.log('[WebRTC] No se pudieron obtener capacidades de codecs de vídeo')
    return
  }

  const codecs = caps.codecs.filter((codec) => {
    const mime = codec.mimeType?.toLowerCase?.() || ''
    return mime && !mime.endsWith('/rtx') && !mime.endsWith('/red') && !mime.endsWith('/ulpfec')
  })

  const codecLabels = codecs.map(
    (codec) => `${codec.mimeType}${codec.sdpFmtpLine ? ` (${codec.sdpFmtpLine})` : ''}`
  )
  console.log('[WebRTC] Codecs de vídeo disponibles:', codecLabels.join(' | '))

  const h264Codecs = codecs
    .filter((codec) => codec.mimeType?.toLowerCase?.() === 'video/h264')
    .sort(
      (left, right) => mobileSdpUtils.scoreH264Codec(right) - mobileSdpUtils.scoreH264Codec(left)
    )
  const vp8Codecs = codecs.filter((codec) => codec.mimeType?.toLowerCase?.() === 'video/vp8')
  const restCodecs = codecs.filter(
    (codec) =>
      codec.mimeType?.toLowerCase?.() !== 'video/h264' &&
      codec.mimeType?.toLowerCase?.() !== 'video/vp8'
  )

  if (preferredVideoCodec === 'vp8') {
    if (vp8Codecs.length === 0) {
      console.log(
        '[WebRTC] VP8 solicitado pero no disponible; se mantiene H264/selección automática'
      )
    } else {
      transceiver.setCodecPreferences([...vp8Codecs, ...h264Codecs, ...restCodecs])
      console.log('[WebRTC] Preferencia de codec aplicada: VP8 primero, H264 como fallback')
      return
    }
  }

  if (h264Codecs.length === 0) {
    console.log('[WebRTC] H264 no disponible; se mantiene VP8/selección automática')
    return
  }

  transceiver.setCodecPreferences([...h264Codecs, ...vp8Codecs, ...restCodecs])

  const preferredH264Labels = h264Codecs.map(
    (codec) => `${codec.mimeType}${codec.sdpFmtpLine ? ` (${codec.sdpFmtpLine})` : ''}`
  )

  console.log(
    '[WebRTC] Preferencia de codec aplicada: H264 ordenado por estabilidad/fps, VP8 como fallback:',
    preferredH264Labels.join(' | ')
  )
}

function resetAutoVideoPolicy(policy = 'framerate') {
  autoVideoEncodingPolicy = policy
  autoVideoPromotionSamples = 0
  autoVideoDemotionSamples = 0
  lastAutoVideoPolicySwitchAt = performance.now()
}

function getEffectiveVideoEncodingPolicy() {
  if (mobileVideoQualityMode === 'recording') {
    return 'resolution'
  }

  if (mobileVideoQualityMode === 'auto') {
    return autoVideoEncodingPolicy
  }

  return 'framerate'
}

function isResolutionPriorityActive() {
  return getEffectiveVideoEncodingPolicy() === 'resolution'
}

/**
 * Ajusta parámetros del emisor de vídeo según el modo operativo.
 *
 * Monitor: puede reducir resolución para conservar 30fps y bajar coste.
 * Recording: bloquea escala 1:1 para que el receptor reciba 1080p real.
 * Esta diferencia es la pieza que separa plano de monitorización y plano
 * de salida sin obligar a pagar Full HD durante toda la sesión.
 */
async function configureVideoSender(sender) {
  if (!sender?.getParameters || !sender?.setParameters) {
    console.log('[WebRTC] setParameters no disponible en el sender de vídeo')
    return
  }

  if (isLegacySenderMode()) {
    console.log('[WebRTC] setParameters omitido: sender=legacy')
    return
  }

  try {
    const videoProfile = getActiveVideoProfile()
    const resolutionPriority = isResolutionPriorityActive()
    const highCeilingMode = resolutionPriority || mobileVideoQualityMode === 'auto'
    const profileMaxBitrate = highCeilingMode
      ? videoProfile.recordingMaxBitrate || videoProfile.maxBitrate
      : videoProfile.maxBitrate
    const maxBitrate = getEffectiveMaxBitrateBps(profileMaxBitrate)
    const profileMinBitrate = resolutionPriority
      ? videoProfile.recordingMinBitrate || videoProfile.minBitrate
      : videoProfile.minBitrate
    const minBitrate = mobileMaxBitrateOverrideKbps
      ? Math.min(profileMinBitrate, Math.max(100_000, Math.floor(maxBitrate * 0.75)))
      : profileMinBitrate
    const degradationPreference = resolutionPriority
      ? videoProfile.recordingDegradationPreference || 'maintain-resolution'
      : videoProfile.degradationPreference
    const params = sender.getParameters()
    params.encodings ??= [{}]
    params.encodings[0].maxFramerate = videoProfile.frameRate
    if (mobileBitrateMode === 'auto') {
      delete params.encodings[0].maxBitrate
      delete params.encodings[0].minBitrate
    } else if (mobileBitrateMode === 'cap') {
      // Modo intermedio para REC: deja margen hasta 1080p, pero evita el
      // minimo agresivo que podia hacer oscilar el estimador de WebRTC.
      params.encodings[0].maxBitrate = maxBitrate
      delete params.encodings[0].minBitrate
    } else {
      params.encodings[0].maxBitrate = maxBitrate
      params.encodings[0].minBitrate = minBitrate
    }

    if (resolutionPriority || !videoProfile.allowEncoderScaling) {
      params.encodings[0].scaleResolutionDownBy = 1.0
    } else {
      delete params.encodings[0].scaleResolutionDownBy
    }

    // NOTA: keyFrameInterval NO se establece aquí porque Chrome ignora
    // RTCRtpEncodingParameters.keyFrameInterval. Más abajo pedimos un
    // keyframe único cuando ya hay bitrate suficiente para limpiar el
    // keyframe inicial de baja calidad sin caer en PLI periódico.
    params.degradationPreference = degradationPreference

    await sender.setParameters(params)
    const maxBitrateLabel =
      mobileBitrateMode === 'auto'
        ? 'browser-auto'
        : `${maxBitrate}${mobileMaxBitrateOverrideKbps ? ' (env override)' : ''}`
    const minBitrateLabel =
      mobileBitrateMode === 'auto'
        ? 'browser-auto'
        : mobileBitrateMode === 'cap'
          ? 'unset'
          : String(minBitrate)

    console.log(
      `[WebRTC] Parámetros de vídeo aplicados para ${videoProfile.description}: ` +
        `mode=${mobileVideoQualityMode}, bitrate=${mobileBitrateMode}, ` +
        `maxBitrate=${maxBitrateLabel}, ` +
        `minBitrate=${minBitrateLabel}, ` +
        `maxFramerate=${videoProfile.frameRate}, ` +
        `policy=${getEffectiveVideoEncodingPolicy()}, ` +
        `encoderScaling=${resolutionPriority || !videoProfile.allowEncoderScaling ? 'fixed' : 'auto'}, ` +
        `degradationPreference=${degradationPreference}`
    )
  } catch (err) {
    console.warn('[WebRTC] No se pudieron aplicar parámetros de vídeo:', err.message)
  }
}

async function applyVideoQualityMode(mode) {
  mobileVideoQualityMode = mode
  if (mode === 'auto') {
    resetAutoVideoPolicy('framerate')
  } else {
    resetAutoVideoPolicy(mode === 'recording' ? 'resolution' : 'framerate')
  }

  if (mode === 'recording' || mode === 'auto') {
    activeVideoProfileId = 'fullhd'
    updateProfileButton()

    if (currentVideoTrack?.applyConstraints) {
      try {
        await currentVideoTrack.applyConstraints(
          getVideoConstraints(MOBILE_VIDEO_PROFILES.fullhd, {
            exactDimensions: true,
            portrait: isPortraitVideoRequest()
          })
        )
        logVideoTrackSettings(
          currentVideoTrack,
          mode === 'auto' ? 'Captura ajustada para modo auto' : 'Captura ajustada para REC'
        )
      } catch (err) {
        console.warn('[Camera] No se pudo fijar captura Full HD exacta para REC:', err.message)
      }
    }
  }

  const videoSender = pc?.getSenders?.().find((sender) => sender.track?.kind === 'video')
  if (videoSender) {
    await configureVideoSender(videoSender)
    if (!isLegacySenderMode() && typeof videoSender.generateKeyFrame === 'function') {
      try {
        await videoSender.generateKeyFrame()
      } catch (err) {
        console.warn('[WebRTC] No se pudo solicitar keyframe tras cambio de calidad:', err.message)
      }
    }
  }

  console.log(`[WebRTC] Modo de calidad recibido desde OpenMix-CG: ${mode}`)
}

function isAutoPromotionCandidate(stats) {
  const enoughFps = stats.frameRate >= AUTO_VIDEO_PROMOTION_MIN_FPS
  const enoughNetwork =
    Number(stats.availableOutgoingBitrateKbps || 0) >= AUTO_VIDEO_PROMOTION_MIN_AVAILABLE_KBPS
  const healthyRtt = stats.roundTripTimeMs === null || stats.roundTripTimeMs <= 80
  return enoughFps && enoughNetwork && healthyRtt
}

function isAutoDemotionCandidate(stats) {
  const lowFps = stats.frameRate > 0 && stats.frameRate < AUTO_VIDEO_DEMOTION_MAX_FPS
  const tightBandwidth =
    stats.qualityLimitationReason === 'bandwidth' &&
    Number(stats.availableOutgoingBitrateKbps || 0) < AUTO_VIDEO_DEMOTION_MAX_AVAILABLE_KBPS
  const highRtt = stats.roundTripTimeMs !== null && stats.roundTripTimeMs > 180
  return lowFps || tightBandwidth || highRtt
}

async function switchAutoVideoEncodingPolicy(nextPolicy, sender, reason) {
  if (autoVideoEncodingPolicy === nextPolicy) {
    return
  }

  autoVideoEncodingPolicy = nextPolicy
  autoVideoPromotionSamples = 0
  autoVideoDemotionSamples = 0
  lastAutoVideoPolicySwitchAt = performance.now()

  console.log(`[WebRTC] Auto vídeo → ${nextPolicy}: ${reason}`)
  await configureVideoSender(sender)

  if (!isLegacySenderMode() && typeof sender.generateKeyFrame === 'function') {
    try {
      await sender.generateKeyFrame()
    } catch (err) {
      console.warn('[WebRTC] No se pudo solicitar keyframe tras cambio auto:', err.message)
    }
  }
}

async function applyAutoVideoPolicyIfNeeded(sender, stats) {
  if (mobileVideoQualityMode !== 'auto' || !sender) {
    return
  }

  const canSwitch =
    performance.now() - lastAutoVideoPolicySwitchAt >= AUTO_VIDEO_MIN_SWITCH_INTERVAL_MS

  if (autoVideoEncodingPolicy === 'framerate') {
    if (isAutoPromotionCandidate(stats)) {
      autoVideoPromotionSamples += 1
    } else {
      autoVideoPromotionSamples = 0
    }

    if (canSwitch && autoVideoPromotionSamples >= AUTO_VIDEO_PROMOTION_REQUIRED_SAMPLES) {
      await switchAutoVideoEncodingPolicy(
        'resolution',
        sender,
        `${stats.frameRate}fps, avail=${stats.availableOutgoingBitrateKbps ?? 'n/a'}kbps`
      )
    }
    return
  }

  if (isAutoDemotionCandidate(stats)) {
    autoVideoDemotionSamples += 1
  } else {
    autoVideoDemotionSamples = 0
  }

  if (canSwitch && autoVideoDemotionSamples >= AUTO_VIDEO_DEMOTION_REQUIRED_SAMPLES) {
    await switchAutoVideoEncodingPolicy(
      'framerate',
      sender,
      `${stats.frameRate}fps, limit=${stats.qualityLimitationReason ?? 'none'}, ` +
        `avail=${stats.availableOutgoingBitrateKbps ?? 'n/a'}kbps`
    )
  }
}

async function requestPostWarmupKeyframeIfReady(sender, stats) {
  if (isLegacySenderMode()) {
    return
  }

  if (postWarmupKeyframeRequested) {
    return
  }

  if (
    stats.frameRate < POST_WARMUP_KEYFRAME_MIN_FPS ||
    stats.bitrateKbps < POST_WARMUP_KEYFRAME_MIN_BITRATE_KBPS
  ) {
    return
  }

  if (typeof sender.generateKeyFrame !== 'function') {
    if (!postWarmupKeyframeUnsupportedLogged) {
      postWarmupKeyframeUnsupportedLogged = true
      console.log('[WebRTC] generateKeyFrame no disponible; se mantiene recuperación por RTCP')
    }
    return
  }

  try {
    postWarmupKeyframeRequested = true
    await sender.generateKeyFrame()
    console.log(
      `[WebRTC] Keyframe post-arranque solicitado ` +
        `(${stats.frameRate}fps, ${stats.bitrateKbps}kbps)`
    )
  } catch (err) {
    postWarmupKeyframeRequested = false
    console.warn('[WebRTC] No se pudo solicitar keyframe post-arranque:', err.message)
  }
}

// ── Controles ───────────────────────────────────────

// Voltear cámara (frontal ↔ trasera)
btnFlip.addEventListener('click', async () => {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment'
  try {
    await replaceLocalStreamTracks('Captura tras voltear')
  } catch (err) {
    console.error('[Camera] Error al voltear:', err)
  }
})

btnProfile.addEventListener('click', async () => {
  const previousProfileId = activeVideoProfileId
  const currentProfileIndex = MOBILE_VIDEO_PROFILE_ORDER.indexOf(activeVideoProfileId)
  const nextProfileId =
    MOBILE_VIDEO_PROFILE_ORDER[(currentProfileIndex + 1) % MOBILE_VIDEO_PROFILE_ORDER.length]

  activeVideoProfileId = nextProfileId
  updateProfileButton()

  try {
    await replaceLocalStreamTracks(`Cambio de perfil a ${getActiveVideoProfile().description}`)
    setStatusNote(
      `Perfil ${getActiveVideoProfile().description} solicitado. ` +
        `Comprueba si la captura concedida y el envío siguen en 30 fps.`
    )
  } catch (err) {
    activeVideoProfileId = previousProfileId
    updateProfileButton()
    console.error('[Camera] Error al cambiar perfil:', err)
  }
})

// Desconectar
btnDisconnect.addEventListener('click', () => {
  disconnect()
})

btnTorch.addEventListener('click', async () => {
  if (!currentVideoTrack || !torchSupported) {
    return
  }

  try {
    const nextTorchEnabled = !torchEnabled
    await currentVideoTrack.applyConstraints({
      advanced: [{ torch: nextTorchEnabled }]
    })
    torchEnabled = nextTorchEnabled
    updateTorchButton()
    updateCaptureReadout(currentVideoTrack)
  } catch (err) {
    console.warn('[Camera] No se pudo cambiar la antorcha:', err.message)
  }
})

// ── Utilidades ──────────────────────────────────────

function setStatus(state, text) {
  statusBadge.textContent = text
  statusBadge.className = `status-${state}`
}

function setStatusMeta(text) {
  if (!text) {
    statusMeta.textContent = ''
    statusMeta.classList.add('hidden')
    return
  }

  statusMeta.textContent = text
  statusMeta.classList.remove('hidden')
}

function setStatusNote(text) {
  if (!text) {
    statusNote.textContent = ''
    statusNote.classList.add('hidden')
    return
  }

  statusNote.textContent = text
  statusNote.classList.remove('hidden')
}

function setConnectError(text) {
  connectStatus.textContent = text
  connectStatus.style.color = '#ef4444'
}

function getActiveVideoProfile() {
  return MOBILE_VIDEO_PROFILES[activeVideoProfileId] || MOBILE_VIDEO_PROFILES.balanced
}

function getFallbackProfileIds(requestedProfileId) {
  const requestedIndex = MOBILE_VIDEO_PROFILE_ORDER.indexOf(requestedProfileId)

  if (requestedIndex === -1) {
    return ['balanced']
  }

  return MOBILE_VIDEO_PROFILE_ORDER.slice(0, requestedIndex + 1).reverse()
}

function updateProfileButton() {
  const profile = getActiveVideoProfile()
  btnProfile.textContent = `🎯 ${profile.buttonLabel}`
  btnProfile.title = `Perfil actual: ${profile.description}`
}

function applyServerClientConfig(config) {
  if (!config || typeof config !== 'object') {
    return
  }

  const normalizedConfig = mobileClientConfig.normalizeConfig(
    config,
    Object.keys(MOBILE_VIDEO_PROFILES)
  )
  applyNormalizedMobileClientConfig(normalizedConfig)
  updateProfileButton()

  console.log(
    `[OpenMix-CG] Config servidor aplicada: profile=${activeVideoProfileId} ` +
      `quality=${mobileVideoQualityMode} bitrate=${mobileBitrateMode} ` +
      `sender=${mobileSenderMode} audio=${mobileAudioEnabled ? 'on' : 'off'} ` +
      `preview=${mobileLocalPreviewEnabled ? 'on' : 'off'} ` +
      `cadence=${mobileCadenceMonitorEnabled ? 'on' : 'off'} ` +
      `stats=${mobileStatsEnabled ? 'on' : 'off'} ` +
      `statsIntervalMs=${mobileVideoStatsIntervalMs} ` +
      `twcc=${mobileTransportCcEnabled ? 'on' : 'off'} ` +
      `maxBitrate=${mobileMaxBitrateOverrideKbps ? `${mobileMaxBitrateOverrideKbps}kbps` : 'profile'} ` +
      `codec=${preferredVideoCodec}`
  )
}

function getAudioConstraints() {
  if (!mobileAudioEnabled) {
    return false
  }

  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000
  }
}

async function requestLocalMediaStream() {
  const requestedProfileId = activeVideoProfileId
  const requestedProfile = getActiveVideoProfile()
  const portrait = isPortraitVideoRequest()
  const audioConstraints = getAudioConstraints()
  console.log(`[Camera] Audio móvil: ${mobileAudioEnabled ? 'on' : 'off'}`)
  let lastConstraintError = null

  for (const profileId of getFallbackProfileIds(requestedProfileId)) {
    const videoProfile = MOBILE_VIDEO_PROFILES[profileId]

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(videoProfile, {
          exactDimensions: true,
          portrait
        }),
        audio: audioConstraints
      })

      if (profileId !== requestedProfileId) {
        activeVideoProfileId = profileId
        updateProfileButton()
        setStatusNote(
          `El dispositivo no concedió ${requestedProfile.description} exacto. ` +
            `Se usa ${videoProfile.description}.`
        )
        console.warn(
          `[Camera] Fallback automático de ${requestedProfile.description} a ` +
            `${videoProfile.description} para obtener una captura exacta.`
        )
      }

      return stream
    } catch (err) {
      if (!isResolutionConstraintError(err)) {
        throw err
      }

      lastConstraintError = err
      console.warn(
        `[Camera] ${videoProfile.description} exacto no disponible en ` +
          `${portrait ? 'vertical' : 'horizontal'}: ${err.message}`
      )
    }
  }

  console.warn(
    `[Camera] No se pudo obtener ${requestedProfile.description} exacto; ` +
      'se intentará una petición blanda para inspeccionar la captura real.'
  )

  setStatusNote(
    `El dispositivo no concedió ${requestedProfile.description} exacto. ` +
      'Revisa la captura real mostrada en pantalla.'
  )

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: getVideoConstraints(requestedProfile, {
        exactDimensions: false,
        portrait
      }),
      audio: audioConstraints
    })
  } catch (err) {
    throw lastConstraintError || err
  }
}

async function prepareVideoTrack(track, context) {
  currentVideoTrack = track || null

  logVideoTrackSettings(track, context)
  logVideoTrackCapabilities(track, context)
  if (!isLegacySenderMode()) {
    await configureVideoTrackForLiveMotion(track)
  } else {
    console.log('[Camera] Ajustes avanzados de cámara omitidos: sender=legacy')
  }

  // motion: el problema residual aparece justo con movimiento,
  // así que conviene orientar el encoder hacia contenido temporal.
  if (!isLegacySenderMode() && track && 'contentHint' in track) {
    track.contentHint = 'motion'
  }

  syncTorchControl(track)
  await restoreTorchStateIfNeeded(track)
  updateCaptureReadout(track)
  updateLocalPreviewOrientation()
}

async function replaceLocalStreamTracks(context) {
  if (!pc) {
    return
  }

  const previousStream = localStream
  const previousVideoTrack = currentVideoTrack
  const nextStream = await requestLocalMediaStream()

  try {
    localStream = nextStream
    localVideo.srcObject = mobileLocalPreviewEnabled ? nextStream : null
    if (mobileLocalPreviewEnabled && mobileCadenceMonitorEnabled) {
      startLocalFrameCadenceMonitor()
    } else {
      stopLocalFrameCadenceMonitor()
    }
    lastVideoStatsSnapshot = null

    const videoTrack = nextStream.getVideoTracks()[0]
    const audioTrack = nextStream.getAudioTracks()[0]

    await prepareVideoTrack(videoTrack, context)

    const senders = pc.getSenders()
    for (const sender of senders) {
      if (sender.track?.kind === 'video' && videoTrack) {
        await sender.replaceTrack(videoTrack)
        await configureVideoSender(sender)
      } else if (sender.track?.kind === 'audio' && audioTrack) {
        await sender.replaceTrack(audioTrack)
      }
    }

    if (previousStream) {
      previousStream.getTracks().forEach((track) => track.stop())
    }
  } catch (err) {
    nextStream.getTracks().forEach((track) => track.stop())
    localStream = previousStream
    currentVideoTrack = previousVideoTrack
    if (previousStream) {
      localVideo.srcObject = previousStream
      startLocalFrameCadenceMonitor()
      syncTorchControl(previousVideoTrack)
      updateCaptureReadout(previousVideoTrack)
    }
    throw err
  }
}

function disconnect() {
  stopStatsReporting()

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'bye' }))
    ws.close()
  }

  if (pc) {
    pc.close()
    pc = null
  }

  makingOffer = false
  hasSentInitialOffer = false
  restartIceRequested = false
  mobileVideoQualityMode = 'monitor'
  currentVideoTrack = null
  torchSupported = false
  torchEnabled = false
  updateTorchButton()
  setStatusMeta('')
  setStatusNote('')

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop())
    localStream = null
  }
  stopLocalFrameCadenceMonitor()

  setStatus('idle', 'Desconectado')
  updateLocalPreviewOrientation()
}

/**
 * Restricciones de captura de vídeo.
 *
 * Mantener 16:9 y 640x360 limita el coste por cámara dentro del mixer.
 * Con la pérdida RTP interna ya corregida, 30fps vuelve a ser un punto
 * de partida razonable para medir suavidad y escalar después a 2-3 cámaras.
 */
function getVideoConstraints(videoProfile = getActiveVideoProfile(), options = {}) {
  const portrait = options.portrait ?? isPortraitVideoRequest()
  const exactDimensions = options.exactDimensions === true
  const targetWidth = portrait ? videoProfile.height : videoProfile.width
  const targetHeight = portrait ? videoProfile.width : videoProfile.height

  return {
    facingMode: { ideal: currentFacingMode },
    resizeMode: 'crop-and-scale',
    width: exactDimensions
      ? { exact: targetWidth }
      : {
          ideal: targetWidth,
          max: targetWidth
        },
    height: exactDimensions
      ? { exact: targetHeight }
      : {
          ideal: targetHeight,
          max: targetHeight
        },
    aspectRatio: { ideal: targetWidth / targetHeight },
    frameRate: {
      ideal: videoProfile.frameRate,
      max: videoProfile.frameRate
    }
  }
}

/**
 * Muestra la resolución/fps reales concedidos por el navegador.
 */
function logVideoTrackSettings(track, context) {
  if (!track?.getSettings) {
    return
  }

  const settings = track.getSettings()
  console.log(
    `[Camera] ${context}: ${settings.width || '?'}x${settings.height || '?'} ` +
      `@ ${settings.frameRate || '?'}fps`
  )
}

function logVideoTrackCapabilities(track, context) {
  if (!track?.getCapabilities) {
    console.log(`[Camera] ${context}: el navegador no expone getCapabilities()`)
    return
  }

  const capabilities = track.getCapabilities()
  console.log(
    `[Camera] ${context} capacidades: ` +
      `width=${capabilities.width?.min || '?'}-${capabilities.width?.max || '?'} ` +
      `height=${capabilities.height?.min || '?'}-${capabilities.height?.max || '?'} ` +
      `fps=${capabilities.frameRate?.min || '?'}-${capabilities.frameRate?.max || '?'} ` +
      `torch=${capabilities.torch === true ? 'si' : 'no'} ` +
      `focus=${Array.isArray(capabilities.focusMode) ? capabilities.focusMode.join('/') : 'n/a'} ` +
      `exposure=${Array.isArray(capabilities.exposureMode) ? capabilities.exposureMode.join('/') : 'n/a'}`
  )
}

async function configureVideoTrackForLiveMotion(track) {
  if (!track?.applyConstraints) {
    return
  }

  const capabilities = track.getCapabilities?.() || {}
  const advanced = []

  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' })
  }
  if (
    Array.isArray(capabilities.exposureMode) &&
    capabilities.exposureMode.includes('continuous')
  ) {
    advanced.push({ exposureMode: 'continuous' })
  }
  if (
    Array.isArray(capabilities.whiteBalanceMode) &&
    capabilities.whiteBalanceMode.includes('continuous')
  ) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  if (advanced.length === 0) {
    return
  }

  try {
    await track.applyConstraints({ advanced })
    console.log('[Camera] Ajustes continuos aplicados para emisión en vivo:', advanced)
  } catch (err) {
    console.warn('[Camera] No se pudieron aplicar ajustes continuos de cámara:', err.message)
  }
}

function syncTorchControl(track) {
  const capabilities = track?.getCapabilities?.()
  torchSupported = Boolean(
    track && currentFacingMode === 'environment' && capabilities && capabilities.torch === true
  )

  if (!torchSupported) {
    torchEnabled = false
  }

  updateTorchButton()
}

async function restoreTorchStateIfNeeded(track) {
  if (!track?.applyConstraints || !torchSupported || !torchEnabled) {
    return
  }

  try {
    await track.applyConstraints({
      advanced: [{ torch: true }]
    })
  } catch (err) {
    torchEnabled = false
    updateTorchButton()
    console.warn(
      '[Camera] No se pudo restaurar la antorcha tras reconfigurar la cámara:',
      err.message
    )
  }
}

function updateTorchButton() {
  if (!torchSupported) {
    btnTorch.classList.add('hidden')
    return
  }

  btnTorch.classList.remove('hidden')
  btnTorch.textContent = torchEnabled ? '💡 Luz ON' : '💡 Luz'
}

function updateCaptureReadout(track, stats) {
  if (!track?.getSettings) {
    return
  }

  const videoProfile = getActiveVideoProfile()
  const settings = track.getSettings()
  const targetText = `objetivo ${videoProfile.description}`
  const grantedText = `captura ${settings.width || '?'}x${settings.height || '?'} @ ${settings.frameRate || '?'}fps`
  const senderText = stats?.frameRate ? ` · envío ${stats.frameRate}fps` : ''
  const torchText = torchSupported ? ` · torch ${torchEnabled ? 'on' : 'off'}` : ''
  setStatusMeta(`${targetText} · ${grantedText}${senderText}${torchText}`)
}

function updateLowLightHint(stats) {
  if (!stats) {
    setStatusNote('')
    return
  }

  const videoProfile = getActiveVideoProfile()
  const targetFrameRate = videoProfile.frameRate
  const actualFrameRate = Number(stats.frameRate || 0)
  const noNetworkWarning =
    (stats.qualityLimitationReason === null || stats.qualityLimitationReason === 'none') &&
    (stats.packetsLost === null || stats.packetsLost === 0) &&
    (stats.roundTripTimeMs === null || stats.roundTripTimeMs < 80)

  if (actualFrameRate > 0 && actualFrameRate < targetFrameRate - 5 && noNetworkWarning) {
    const torchHint =
      torchSupported && !torchEnabled ? ' Activa la luz si tu móvil la soporta.' : ''
    setStatusNote(
      `Posible limitación de cámara por baja luz o autoexposición. ` +
        `Para sostener ${videoProfile.description} hace falta mantener primero la cadencia con buena iluminación.${torchHint}`
    )
    return
  }

  setStatusNote('')
}

/**
 * Envía estadísticas periódicas al servidor de señalización.
 *
 * Así podemos correlacionar artefactos con bitrate real, pérdida RTCP
 * y limitaciones activas del encoder del navegador.
 */
function startStatsReporting() {
  if (!mobileStatsEnabled) {
    console.log('[WebRTC] Stats móvil desactivadas por parámetro de URL')
    return
  }

  if (statsIntervalId !== null) {
    return
  }

  statsIntervalId = window.setInterval(async () => {
    if (!pc || !ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video')
    if (!videoSender?.getStats) {
      return
    }

    try {
      const reports = await videoSender.getStats()
      const reportValues = Array.from(reports.values())
      const outbound = reportValues.find(
        (report) =>
          report.type === 'outbound-rtp' &&
          (report.kind === 'video' || report.mediaType === 'video')
      )

      if (!outbound) {
        return
      }

      const track = reportValues.find(
        (report) =>
          report.type === 'track' && (report.kind === 'video' || report.mediaType === 'video')
      )
      const remoteInbound = reportValues.find(
        (report) =>
          report.type === 'remote-inbound-rtp' &&
          (report.kind === 'video' || report.mediaType === 'video')
      )
      const transport = reportValues.find((report) => report.type === 'transport')
      const selectedPair =
        reportValues.find((report) => report.id === transport?.selectedCandidatePairId) ||
        reportValues.find((report) => report.type === 'candidate-pair' && report.selected)
      const localCandidate = selectedPair?.localCandidateId
        ? reportValues.find((report) => report.id === selectedPair.localCandidateId)
        : null
      const remoteCandidate = selectedPair?.remoteCandidateId
        ? reportValues.find((report) => report.id === selectedPair.remoteCandidateId)
        : null

      const timestamp = Number(outbound.timestamp || performance.now())
      const bytesSent = Number(outbound.bytesSent || 0)
      const framesSent = Number(outbound.framesSent || track?.framesSent || 0)
      const framesEncoded = Number(outbound.framesEncoded || 0)
      const totalEncodeTimeMs = Number(outbound.totalEncodeTime || 0) * 1000
      const totalPacketSendDelayMs = Number(outbound.totalPacketSendDelay || 0) * 1000
      const pliCount = Number(outbound.pliCount || 0)
      const firCount = Number(outbound.firCount || 0)
      const nackCount = Number(outbound.nackCount || 0)
      const keyFramesEncoded = Number(outbound.keyFramesEncoded || 0)

      let bitrateKbps = 0
      let frameRate = 0
      let encodedFrameRate = 0
      let encodeMsPerFrame = null
      let sendDelayMsPerFrame = null
      let deltaPliCount = 0
      let deltaFirCount = 0
      let deltaNackCount = 0
      let deltaKeyFramesEncoded = 0

      if (lastVideoStatsSnapshot) {
        const deltaMs = timestamp - lastVideoStatsSnapshot.timestamp
        const deltaBytes = bytesSent - lastVideoStatsSnapshot.bytesSent
        const deltaFrames = framesSent - lastVideoStatsSnapshot.framesSent
        const deltaFramesEncoded = framesEncoded - lastVideoStatsSnapshot.framesEncoded
        const deltaEncodeTimeMs = totalEncodeTimeMs - lastVideoStatsSnapshot.totalEncodeTimeMs
        const deltaPacketSendDelayMs =
          totalPacketSendDelayMs - lastVideoStatsSnapshot.totalPacketSendDelayMs
        deltaPliCount = Math.max(0, pliCount - lastVideoStatsSnapshot.pliCount)
        deltaFirCount = Math.max(0, firCount - lastVideoStatsSnapshot.firCount)
        deltaNackCount = Math.max(0, nackCount - lastVideoStatsSnapshot.nackCount)
        deltaKeyFramesEncoded = Math.max(
          0,
          keyFramesEncoded - lastVideoStatsSnapshot.keyFramesEncoded
        )

        if (deltaMs > 0) {
          bitrateKbps = Math.max(0, Math.round((deltaBytes * 8) / deltaMs))
          frameRate = Math.max(0, Math.round((deltaFrames * 1000) / deltaMs))
          encodedFrameRate = Math.max(0, Math.round((deltaFramesEncoded * 1000) / deltaMs))
        }

        if (deltaFramesEncoded > 0 && deltaEncodeTimeMs >= 0) {
          encodeMsPerFrame = Math.round((deltaEncodeTimeMs / deltaFramesEncoded) * 10) / 10
        }

        if (deltaFrames > 0 && deltaPacketSendDelayMs >= 0) {
          sendDelayMsPerFrame = Math.round((deltaPacketSendDelayMs / deltaFrames) * 10) / 10
        }
      }

      lastVideoStatsSnapshot = {
        timestamp,
        bytesSent,
        framesSent,
        framesEncoded,
        totalEncodeTimeMs,
        totalPacketSendDelayMs,
        pliCount,
        firCount,
        nackCount,
        keyFramesEncoded
      }

      const captureSettings = currentVideoTrack?.getSettings?.() || {}
      const localFrameCadence = latestLocalFrameCadenceStats

      const stats = {
        bitrateKbps,
        frameRate,
        width: Number(track?.frameWidth || outbound.frameWidth || 0),
        height: Number(track?.frameHeight || outbound.frameHeight || 0),
        qualityMode: mobileVideoQualityMode,
        encodingPolicy: getEffectiveVideoEncodingPolicy(),
        captureWidth: Number(captureSettings.width || 0) || null,
        captureHeight: Number(captureSettings.height || 0) || null,
        captureFrameRate: Number(captureSettings.frameRate || 0) || null,
        localPreviewFps: localFrameCadence?.fps ?? null,
        localPreviewSlowFrames: localFrameCadence?.slowFrames ?? null,
        localPreviewMaxIntervalMs: localFrameCadence?.maxIntervalMs ?? null,
        framesSent,
        framesEncoded,
        encodedFrameRate,
        encodeMsPerFrame,
        sendDelayMsPerFrame,
        encoderImplementation: outbound.encoderImplementation || null,
        roundTripTimeMs: Number.isFinite(remoteInbound?.roundTripTime)
          ? Math.round(remoteInbound.roundTripTime * 1000)
          : Number.isFinite(selectedPair?.currentRoundTripTime)
            ? Math.round(selectedPair.currentRoundTripTime * 1000)
            : null,
        packetsLost:
          Number.isFinite(remoteInbound?.packetsLost) && Number(remoteInbound.packetsLost) >= 0
            ? Number(remoteInbound.packetsLost)
            : null,
        qualityLimitationReason: outbound.qualityLimitationReason || null,
        availableOutgoingBitrateKbps: Number.isFinite(selectedPair?.availableOutgoingBitrate)
          ? Math.round(selectedPair.availableOutgoingBitrate / 1000)
          : null,
        localCandidateType: localCandidate?.candidateType || null,
        remoteCandidateType: remoteCandidate?.candidateType || null,
        localCandidateProtocol: localCandidate?.protocol || selectedPair?.protocol || null,
        remoteCandidateProtocol: remoteCandidate?.protocol || null,
        pliCount,
        firCount,
        nackCount,
        keyFramesEncoded,
        deltaPliCount,
        deltaFirCount,
        deltaNackCount,
        deltaKeyFramesEncoded
      }

      updateCaptureReadout(currentVideoTrack, stats)
      updateLowLightHint(stats)
      await requestPostWarmupKeyframeIfReady(videoSender, stats)
      await applyAutoVideoPolicyIfNeeded(videoSender, stats)

      ws.send(JSON.stringify({ type: 'stats', stats }))

      console.log(
        '[WebRTC] Stats vídeo:',
        `${stats.width}x${stats.height}`,
        `${stats.frameRate}fps`,
        `${stats.bitrateKbps}kbps`,
        `mode=${stats.qualityMode}/${stats.encodingPolicy}`,
        `local=${stats.localPreviewFps ?? 'n/a'}fps/${stats.localPreviewMaxIntervalMs ?? 'n/a'}ms`,
        `lost=${stats.packetsLost ?? 'n/a'}`,
        `rtt=${stats.roundTripTimeMs ?? 'n/a'}ms`,
        `limit=${stats.qualityLimitationReason ?? 'none'}`,
        `avail=${stats.availableOutgoingBitrateKbps ?? 'n/a'}kbps`,
        `pair=${stats.localCandidateType ?? 'n/a'}->${stats.remoteCandidateType ?? 'n/a'}`,
        `proto=${stats.localCandidateProtocol ?? 'n/a'}->${stats.remoteCandidateProtocol ?? 'n/a'}`,
        `pli=${stats.pliCount}(+${stats.deltaPliCount})`,
        `fir=${stats.firCount}(+${stats.deltaFirCount})`,
        `nack=${stats.nackCount}(+${stats.deltaNackCount})`,
        `keyframes=${stats.keyFramesEncoded}(+${stats.deltaKeyFramesEncoded})`
      )
    } catch (err) {
      console.warn('[WebRTC] Error obteniendo stats:', err.message)
    }
  }, mobileVideoStatsIntervalMs)
}

function stopStatsReporting() {
  if (statsIntervalId !== null) {
    window.clearInterval(statsIntervalId)
    statsIntervalId = null
  }

  lastVideoStatsSnapshot = null
}

/**
 * Wake Lock API: evita que la pantalla del móvil se apague
 * mientras está transmitiendo. Si la API no está disponible
 * (navegadores antiguos), simplemente la ignoramos.
 */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen')
      console.log('[WakeLock] Pantalla mantenida activa')
    }
  } catch (err) {
    console.warn('[WakeLock] No disponible:', err.message)
  }
}

// ── Iniciar ─────────────────────────────────────────
main()
