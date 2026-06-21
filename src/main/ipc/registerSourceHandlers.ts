/**
 * registerSourceHandlers.ts — Handlers IPC para gestión de fuentes WebRTC.
 *
 * Conecta los comandos del Renderer (crear token QR, listar peers, etc.)
 * con los servicios de señalización y HTTP del Main process.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { ipcOk, ipcError } from '../../shared/ipc/contracts'
import { createConnectionToken, getPeers, removePeer } from '../services/signalingService'
import type { MobileClientConfig } from '../services/signalingService'
import { getServerPort } from '../services/httpServer'
import { ensureMixerPipelinePlaying, isMixerActive } from '../services/mixerService'
import {
  chooseLocalVideoFile,
  clearLocalVideoSource,
  listLocalVideoSources,
  loadLocalVideoSource,
  restartLocalVideoSource,
  setLocalVideoAutoPlay,
  setLocalVideoLoop,
  setLocalVideoPaused,
  subscribeLocalVideoSourcesChanged
} from '../services/localVideoService'
import type {
  LoadLocalVideoSourceRequest,
  SetLocalVideoAutoPlayRequest,
  SetLocalVideoLoopRequest,
  SetLocalVideoPausedRequest
} from '../../shared/ipc/source-contracts'
import { networkInterfaces } from 'os'

const MOBILE_PROFILE_IDS = new Set(['balanced', 'hd', 'fullhd'])
const MOBILE_CLIENT_PRESETS = new Set(['current', 'historical'])

/**
 * Perfil inicial que se inserta en el QR de cámara móvil.
 *
 * La ruta de grabación nativa necesita una fuente real Full HD: si el móvil
 * captura a 720p, cualquier MP4 1080p sería un reescalado. Por eso el QR
 * vuelve a pedir 1080p por defecto. La optimización ya no consiste en bajar
 * la captura inicial, sino en separar dentro de GStreamer la rama de monitor
 * (raster reducido) de la rama REC/master (1920x1080, cerrada hasta grabar).
 *
 * Para pruebas comparativas de CPU solo en monitorización se puede arrancar con:
 *
 *   OPENMIX_MOBILE_PROFILE=hd pnpm dev
 *   OPENMIX_MOBILE_PROFILE=balanced pnpm dev
 */
const requestedMobileProfileId = process.env.OPENMIX_MOBILE_PROFILE ?? 'fullhd'
const DEFAULT_MOBILE_PROFILE_ID = MOBILE_PROFILE_IDS.has(requestedMobileProfileId)
  ? requestedMobileProfileId
  : 'fullhd'
const requestedMobileClientPreset = (process.env.OPENMIX_MOBILE_CLIENT_PRESET ?? 'current')
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_CLIENT_PRESET = MOBILE_CLIENT_PRESETS.has(requestedMobileClientPreset)
  ? requestedMobileClientPreset
  : 'current'
const STUTTER_ISOLATION_ENABLED = [
  'on',
  'true',
  '1',
  'monitors',
  'minimal',
  'big-monitors'
].includes((process.env.OPENMIX_STUTTER_ISOLATION ?? '').trim().toLowerCase())
/*
 * Por defecto usamos el modo que estabilizó Android en pruebas reales:
 * - quality=auto arranca protegiendo 30fps y promociona a 1080p cuando hay margen.
 * - bitrate=cap evita los hints agresivos x-google/minBitrate de guided, que en
 *   algunos Chrome/Qualcomm provocaban entrega RTP a pulsos aunque no hubiera pérdida.
 * Las variables de entorno se mantienen para poder hacer A/B sin tocar código.
 */
const requestedMobileQualityMode = (process.env.OPENMIX_MOBILE_QUALITY_MODE ?? 'auto')
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_QUALITY_MODE =
  requestedMobileQualityMode === 'recording' || requestedMobileQualityMode === 'rec'
    ? 'recording'
    : requestedMobileQualityMode === 'auto' || requestedMobileQualityMode === 'adaptive'
      ? 'auto'
      : 'monitor'
const requestedMobileCodec = (process.env.OPENMIX_MOBILE_CODEC ?? 'h264').trim().toLowerCase()
const DEFAULT_MOBILE_CODEC = requestedMobileCodec === 'vp8' ? 'vp8' : 'h264'
const requestedMobileBitrateMode = (process.env.OPENMIX_MOBILE_BITRATE_MODE ?? 'cap')
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_BITRATE_MODE = ['auto', 'browser', 'native'].includes(
  requestedMobileBitrateMode
)
  ? 'auto'
  : ['cap', 'capped', 'ceiling', 'max-only'].includes(requestedMobileBitrateMode)
    ? 'cap'
    : 'guided'
const requestedMobileSenderMode = (process.env.OPENMIX_MOBILE_SENDER_MODE ?? 'managed')
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_SENDER_MODE = ['legacy', 'plain', 'browser-default'].includes(
  requestedMobileSenderMode
)
  ? 'legacy'
  : 'managed'
const requestedMobileAudioMode = (
  process.env.OPENMIX_MOBILE_AUDIO ?? (STUTTER_ISOLATION_ENABLED ? 'off' : 'on')
)
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_AUDIO_MODE = ['0', 'false', 'off', 'none', 'disabled'].includes(
  requestedMobileAudioMode
)
  ? 'off'
  : 'on'
const requestedMobilePreviewMode = (
  process.env.OPENMIX_MOBILE_PREVIEW ?? (STUTTER_ISOLATION_ENABLED ? 'off' : 'on')
)
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_PREVIEW_MODE = ['0', 'false', 'off', 'none', 'disabled'].includes(
  requestedMobilePreviewMode
)
  ? 'off'
  : 'on'
const requestedMobileCadenceMode = (
  process.env.OPENMIX_MOBILE_CADENCE_MONITOR ?? (STUTTER_ISOLATION_ENABLED ? 'off' : 'on')
)
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_CADENCE_MODE = ['0', 'false', 'off', 'none', 'disabled'].includes(
  requestedMobileCadenceMode
)
  ? 'off'
  : 'on'
const REALTIME_DIAGNOSTICS_ENABLED = ['on', 'true', '1', 'enabled'].includes(
  (process.env.OPENMIX_REALTIME_DIAGNOSTICS ?? '').trim().toLowerCase()
)
const requestedMobileStatsMode =
  process.env.OPENMIX_MOBILE_STATS ?? (REALTIME_DIAGNOSTICS_ENABLED ? 'on' : 'off')
const MOBILE_STATS_ENABLED = !['0', 'false', 'off', 'none', 'disabled'].includes(
  requestedMobileStatsMode.trim().toLowerCase()
)
const requestedMobileStatsIntervalMs = Number(process.env.OPENMIX_MOBILE_STATS_INTERVAL_MS ?? 2000)
const MOBILE_STATS_INTERVAL_MS = Number.isFinite(requestedMobileStatsIntervalMs)
  ? Math.max(250, Math.min(30000, Math.round(requestedMobileStatsIntervalMs)))
  : 2000
const requestedMobileTransportCcMode = (process.env.OPENMIX_MOBILE_TRANSPORT_CC ?? 'on')
  .trim()
  .toLowerCase()
const DEFAULT_MOBILE_TRANSPORT_CC_MODE = ['0', 'false', 'off', 'none', 'disabled'].includes(
  requestedMobileTransportCcMode
)
  ? 'off'
  : 'on'
const requestedMobileMaxBitrateKbps = Number(process.env.OPENMIX_MOBILE_MAX_BITRATE_KBPS ?? '')
const DEFAULT_MOBILE_MAX_BITRATE_KBPS =
  Number.isFinite(requestedMobileMaxBitrateKbps) && requestedMobileMaxBitrateKbps > 0
    ? Math.max(500, Math.min(30000, Math.round(requestedMobileMaxBitrateKbps)))
    : null

function appendOptionalMobileBitrateLimit(url: string): string {
  if (!DEFAULT_MOBILE_MAX_BITRATE_KBPS) {
    return url
  }

  return `${url}&maxBitrateKbps=${DEFAULT_MOBILE_MAX_BITRATE_KBPS}`
}

function buildMobileClientConfig(): MobileClientConfig {
  if (DEFAULT_MOBILE_CLIENT_PRESET === 'historical') {
    /*
     * El preset historico es una herramienta de diagnostico: debe sobrevivir a
     * la configuracion autoritaria enviada en `welcome`. Si no lo reflejamos en
     * el token, el movil aplica `preset=historical` al cargar la URL y acto
     * seguido el servidor lo pisa con la configuracion actual.
     */
    return {
      profile: DEFAULT_MOBILE_PROFILE_ID,
      qualityMode: 'monitor',
      codec: 'h264',
      bitrateMode: 'auto',
      senderMode: 'legacy',
      maxBitrateKbps: DEFAULT_MOBILE_MAX_BITRATE_KBPS,
      audio: false,
      localPreview: DEFAULT_MOBILE_PREVIEW_MODE === 'on',
      cadenceMonitor: false,
      stats: false,
      statsIntervalMs: MOBILE_STATS_INTERVAL_MS,
      transportCc: DEFAULT_MOBILE_TRANSPORT_CC_MODE === 'on'
    }
  }

  return {
    profile: DEFAULT_MOBILE_PROFILE_ID,
    qualityMode: DEFAULT_MOBILE_QUALITY_MODE,
    codec: DEFAULT_MOBILE_CODEC,
    bitrateMode: DEFAULT_MOBILE_BITRATE_MODE,
    senderMode: DEFAULT_MOBILE_SENDER_MODE,
    maxBitrateKbps: DEFAULT_MOBILE_MAX_BITRATE_KBPS,
    audio: DEFAULT_MOBILE_AUDIO_MODE === 'on',
    localPreview: DEFAULT_MOBILE_PREVIEW_MODE === 'on',
    cadenceMonitor: DEFAULT_MOBILE_CADENCE_MODE === 'on',
    stats: MOBILE_STATS_ENABLED,
    statsIntervalMs: MOBILE_STATS_INTERVAL_MS,
    transportCc: DEFAULT_MOBILE_TRANSPORT_CC_MODE === 'on'
  }
}

function buildMobileCameraUrl(ip: string, port: number, token: string): string {
  const baseUrl = `https://${ip}:${port}/cam?token=${token}`

  if (DEFAULT_MOBILE_CLIENT_PRESET === 'historical') {
    return appendOptionalMobileBitrateLimit(
      `${baseUrl}&preset=historical&profile=${DEFAULT_MOBILE_PROFILE_ID}` +
        `&quality=monitor&codec=h264&bitrate=auto&sender=legacy&audio=off` +
        `&preview=${DEFAULT_MOBILE_PREVIEW_MODE}` +
        `&cadence=off&stats=off&statsIntervalMs=${MOBILE_STATS_INTERVAL_MS}` +
        `&twcc=${DEFAULT_MOBILE_TRANSPORT_CC_MODE}`
    )
  }

  const mobileStatsMode = MOBILE_STATS_ENABLED ? 'on' : 'off'
  return appendOptionalMobileBitrateLimit(
    `${baseUrl}` +
      `&profile=${DEFAULT_MOBILE_PROFILE_ID}&quality=${DEFAULT_MOBILE_QUALITY_MODE}` +
      `&codec=${DEFAULT_MOBILE_CODEC}` +
      `&bitrate=${DEFAULT_MOBILE_BITRATE_MODE}` +
      `&sender=${DEFAULT_MOBILE_SENDER_MODE}` +
      `&audio=${DEFAULT_MOBILE_AUDIO_MODE}` +
      `&preview=${DEFAULT_MOBILE_PREVIEW_MODE}` +
      `&cadence=${DEFAULT_MOBILE_CADENCE_MODE}` +
      `&stats=${mobileStatsMode}` +
      `&statsIntervalMs=${MOBILE_STATS_INTERVAL_MS}` +
      `&twcc=${DEFAULT_MOBILE_TRANSPORT_CC_MODE}`
  )
}

/**
 * Obtiene la IP local principal del equipo para construir la URL del QR.
 * Prioriza interfaces WiFi/Ethernet sobre otras.
 */
function getPrimaryLocalIp(): string {
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name]
    if (!entries) continue
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }
  return '127.0.0.1'
}

/**
 * Registra los handlers IPC de gestión de fuentes.
 *
 * @param mainWindow Ventana principal para enviar eventos de estado de peers
 */
export function registerSourceHandlers(mainWindow: BrowserWindow): void {
  subscribeLocalVideoSourcesChanged((event) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcChannels.sourcesLocalVideosChanged, event)
    }
  })

  /**
   * sources:create-token — Crea un nuevo token de conexión para una cámara.
   *
   * Genera un peerId + token, construye la URL completa para el QR.
   * El Renderer usará esta URL para generar el código QR que el
   * operador de cámara escaneará con su móvil.
   */
  ipcMain.handle(ipcChannels.sourcesCreateToken, () => {
    try {
      const mobileConfig = buildMobileClientConfig()
      const { peerId, token } = createConnectionToken(mobileConfig)
      const ip = getPrimaryLocalIp()
      const port = getServerPort()
      const url = buildMobileCameraUrl(ip, port, token)

      console.log(`[SourceHandlers] Token creado → ${url}`)

      return ipcOk({ peerId, token, url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  /**
   * sources:list — Devuelve la lista de peers activos con su estado.
   */
  ipcMain.handle(ipcChannels.sourcesList, () => {
    try {
      return ipcOk(getPeers())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  /**
   * sources:remove-peer — Elimina un peer y cierra su conexión.
   */
  ipcMain.handle(ipcChannels.sourcesRemovePeer, (_event, peerId: string) => {
    try {
      removePeer(peerId)
      return ipcOk(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  /**
   * sources:get-server-info — Info del servidor para mostrar en la UI.
   */
  ipcMain.handle(ipcChannels.sourcesGetServerInfo, () => {
    const ip = getPrimaryLocalIp()
    const port = getServerPort()
    return ipcOk({ ip, port, url: `https://${ip}:${port}` })
  })

  ipcMain.handle(ipcChannels.sourcesListLocalVideos, () => {
    try {
      return ipcOk(listLocalVideoSources())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  /**
   * sources:choose-local-video — Abre el diálogo nativo de macOS/Windows/Linux.
   *
   * Solo devuelve metadatos del fichero. Los bytes no cruzan IPC; después el
   * Renderer pide cargar esa ruta en un slot concreto del mixer.
   */
  ipcMain.handle(ipcChannels.sourcesChooseLocalVideo, async () => {
    try {
      return ipcOk(await chooseLocalVideoFile(mainWindow))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  /**
   * sources:load-local-video — Carga un fichero local en un slot 1-3.
   */
  ipcMain.handle(
    ipcChannels.sourcesLoadLocalVideo,
    async (_event, request: LoadLocalVideoSourceRequest) => {
      try {
        if (!isMixerActive()) {
          return ipcError('CONFLICT', 'Inicia el mixer antes de cargar un vídeo local')
        }
        ensureMixerPipelinePlaying()
        return ipcOk(await loadLocalVideoSource(request))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', msg)
      }
    }
  )

  /**
   * sources:clear-local-video — Libera el slot local y vuelve a dejarlo
   * disponible para cámaras WebRTC.
   */
  ipcMain.handle(ipcChannels.sourcesClearLocalVideo, (_event, sourceIndex: number) => {
    try {
      return ipcOk(clearLocalVideoSource(sourceIndex))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  ipcMain.handle(ipcChannels.sourcesRestartLocalVideo, async (_event, sourceIndex: number) => {
    try {
      return ipcOk(await restartLocalVideoSource(sourceIndex))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', msg)
    }
  })

  ipcMain.handle(
    ipcChannels.sourcesSetLocalVideoPaused,
    (_event, request: SetLocalVideoPausedRequest) => {
      try {
        return ipcOk(setLocalVideoPaused(request))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', msg)
      }
    }
  )

  ipcMain.handle(
    ipcChannels.sourcesSetLocalVideoLoop,
    (_event, request: SetLocalVideoLoopRequest) => {
      try {
        return ipcOk(setLocalVideoLoop(request))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', msg)
      }
    }
  )

  ipcMain.handle(
    ipcChannels.sourcesSetLocalVideoAutoPlay,
    (_event, request: SetLocalVideoAutoPlayRequest) => {
      try {
        return ipcOk(setLocalVideoAutoPlay(request))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', msg)
      }
    }
  )

  /**
   * Función para notificar al Renderer cuando cambia el estado de un peer.
   * Se llamará desde el signalingService cuando un peer se conecta/desconecta.
   */
  return undefined as void
}

/**
 * Envía un evento de cambio de estado de peer al Renderer.
 * Llamado desde el main process cuando un peer se conecta/desconecta.
 */
export function notifyPeerState(mainWindow: BrowserWindow, peerId: string, state: string): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcChannels.sourcesPeerState, { peerId, state })
  }
}
