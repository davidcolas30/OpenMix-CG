/**
 * registerMixerHandlers — Registra los handlers IPC del mixer.
 *
 * Estos handlers reciben comandos del Renderer (via ipcMain.handle) y
 * ejecutan las acciones correspondientes en el MixerService.
 *
 * Patrón:
 *   Renderer llama window.openMix.mixer.start()
 *   → Preload lo convierte en ipcRenderer.invoke('mixer:start')
 *   → ipcMain.handle('mixer:start') ejecuta startMixer()
 *   → El resultado (IpcResult) se devuelve al Renderer
 */

import { ipcMain, BrowserWindow, WebContents } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { ipcOk, ipcError } from '../../shared/ipc/contracts'
import type {
  MixerAutoTransitionRequest,
  MixerNativeMonitorLayout,
  MixerMonitorResolution,
  MixerMonitorStatsReport,
  MixerRecordingAudioDelayRequest,
  MixerState,
  MixerSourceInfo
} from '../../shared/ipc/mixer-contracts'
import {
  initializeGStreamer,
  startMixer,
  stopMixer,
  setProgramSource,
  setPreviewSource,
  cut,
  autoTransition,
  getMixerState,
  getPreviewMonitorTransport,
  getMonitorSurfaceConfig,
  getMonitorTargets,
  getRecordingAudioState,
  setRecordingAudioDelayMs,
  setNativeMonitorSurfaceLayout,
  startPreviewMonitorWebRTC,
  addPreviewMonitorIceCandidate,
  stopPreviewMonitorWebRTC,
  startProgramMonitorWebRTC,
  addProgramMonitorIceCandidate,
  stopProgramMonitorWebRTC,
  startCombinedMonitorWebRTC,
  addCombinedMonitorIceCandidate,
  stopCombinedMonitorWebRTC,
  startMultiviewMonitorWebRTC,
  addMultiviewMonitorIceCandidate,
  stopMultiviewMonitorWebRTC
} from '../services/mixerService'
import { detachAllPeersBeforeMixerStop } from '../services/webrtcBridge'
import { stopRecordingIfActive } from '../services/outputService'
import {
  getMixerMonitorSettings,
  updateMixerMonitorSettings
} from '../services/mixerSettingsService'

function isEnvEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'on', 'enabled'].includes((value ?? '').trim().toLowerCase())
}

const MONITOR_STATS_LOG_ENABLED =
  isEnvEnabled(process.env.OPENMIX_MONITOR_STATS_LOG) ||
  isEnvEnabled(process.env.OPENMIX_REALTIME_DIAGNOSTICS)

/**
 * Registra todos los handlers IPC del mixer.
 * @param mainWindow — Referencia a la ventana principal para enviar frames
 */
export function registerMixerHandlers(mainWindow: BrowserWindow): void {
  const externalMonitorSurfacesEnabled = getMonitorSurfaceConfig().mode === 'external'
  const isMainRenderer = (sender: WebContents): boolean => sender === mainWindow.webContents

  const isMonitorRenderer = (sender: WebContents): boolean => {
    if (isMainRenderer(sender)) return true
    if (!externalMonitorSurfacesEnabled) return false

    const senderUrl = sender.getURL()

    // Los monitores externos son páginas data: generadas por React y cargadas
    // en <webview>. Se autorizan solo para la ruta de monitorización WebRTC:
    // pueden negociar su MediaStream local, pero no se relaja el resto de IPC.
    return senderUrl.startsWith('data:text/html')
  }

  ipcMain.on(ipcChannels.mixerReportMonitorStats, (event, payload: MixerMonitorStatsReport) => {
    if (!isMonitorRenderer(event.sender)) {
      return
    }

    if (
      !payload ||
      typeof payload.label !== 'string' ||
      typeof payload.receivedFps !== 'number' ||
      typeof payload.renderedFps !== 'number' ||
      typeof payload.skippedFrames !== 'number' ||
      typeof payload.rasterWidth !== 'number' ||
      typeof payload.rasterHeight !== 'number'
    ) {
      return
    }

    if (!MONITOR_STATS_LOG_ENABLED) {
      return
    }

    const sampleText =
      typeof payload.sampleMs === 'number' && Number.isFinite(payload.sampleMs)
        ? ` dt=${Math.round(payload.sampleMs)}ms`
        : ''

    console.log(
      `[MixerMonitor] ${payload.label}: ` +
        `rx=${payload.receivedFps}fps ui=${payload.renderedFps}fps ` +
        `skip=${payload.skippedFrames}${sampleText} raster=${payload.rasterWidth}x${payload.rasterHeight}`
    )
  })

  /**
   * mixer:start — Inicializa GStreamer y arranca el mixer.
   * Crea el pipeline con 4 fuentes de prueba, 2 compositores y thumbnails.
   * Los frames empezarán a fluir al Renderer automáticamente.
   */
  ipcMain.handle(ipcChannels.mixerStart, () => {
    try {
      initializeGStreamer()
      startMixer(mainWindow)
      return ipcOk({ running: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      console.error('[IPC] Error iniciando mixer:', message)
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:stop — Detiene y destruye el pipeline del mixer.
   */
  ipcMain.handle(ipcChannels.mixerStop, async () => {
    try {
      await stopRecordingIfActive()
      detachAllPeersBeforeMixerStop()
      await stopMixer()
      return ipcOk({ running: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:cut — Ejecuta un corte: intercambia PGM ↔ PVW.
   * Devuelve el nuevo estado del mixer después del corte.
   */
  ipcMain.handle(ipcChannels.mixerCut, () => {
    try {
      cut()
      const state = getMixerState()
      return ipcOk({
        programSource: state.programSource,
        previewSource: state.previewSource,
        isPipelinePlaying: state.isPipelinePlaying,
        isTransitionInProgress: state.isTransitionInProgress
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:auto-transition — Ejecuta una transición temporal sobre Program.
   * Recibe { transitionId, durationMs } y devuelve el estado inmediato.
   */
  ipcMain.handle(ipcChannels.mixerAutoTransition, (_event, args: MixerAutoTransitionRequest) => {
    try {
      autoTransition(args)
      const state = getMixerState()
      return ipcOk({
        programSource: state.programSource,
        previewSource: state.previewSource,
        sources: state.sourceNames.map((name, index) => ({ index, name })),
        isRunning: state.isRunning,
        isPipelinePlaying: state.isPipelinePlaying,
        isTransitionInProgress: state.isTransitionInProgress
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:set-program-source — Cambia la fuente en Program.
   * Recibe { index: number } como argumento.
   */
  ipcMain.handle(ipcChannels.mixerSetProgramSource, (_event, args: { index: number }) => {
    try {
      setProgramSource(args.index)
      return ipcOk({ programSource: args.index })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:set-preview-source — Cambia la fuente en Preview.
   * Recibe { index: number } como argumento.
   */
  ipcMain.handle(ipcChannels.mixerSetPreviewSource, (_event, args: { index: number }) => {
    try {
      setPreviewSource(args.index)
      return ipcOk({ previewSource: args.index })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:get-state — Devuelve el estado actual del mixer.
   * Incluye qué fuente está en PGM, cuál en PVW, y la lista de fuentes.
   */
  ipcMain.handle(ipcChannels.mixerGetState, () => {
    try {
      const state = getMixerState()
      const sources: MixerSourceInfo[] = state.sourceNames.map((name, index) => ({
        index,
        name
      }))
      const mixerState: MixerState = {
        programSource: state.programSource,
        previewSource: state.previewSource,
        sources,
        isRunning: state.isRunning,
        isPipelinePlaying: state.isPipelinePlaying,
        isTransitionInProgress: state.isTransitionInProgress
      }
      return ipcOk(mixerState)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:get-monitor-settings — Devuelve la configuración de monitorización.
   */
  ipcMain.handle(ipcChannels.mixerGetMonitorSettings, () => {
    try {
      return ipcOk(getMixerMonitorSettings())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  /**
   * mixer:update-monitor-settings — Actualiza la configuración de monitorización.
   * Los cambios se aplican en la siguiente sesión del mixer (requiere reinicio).
   */
  ipcMain.handle(
    ipcChannels.mixerUpdateMonitorSettings,
    (_event, args: { monitorResolution?: string }) => {
      try {
        const validResolutions: string[] = ['360p', '540p', '720p', '1080p']
        if (args.monitorResolution && !validResolutions.includes(args.monitorResolution)) {
          return ipcError('VALIDATION_ERROR', `Resolución no válida: ${args.monitorResolution}`)
        }
        const next = updateMixerMonitorSettings({
          monitorResolution: args.monitorResolution as MixerMonitorResolution
        })
        return ipcOk(next)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerGetPreviewMonitorTransport, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    return ipcOk(getPreviewMonitorTransport())
  })

  ipcMain.handle(ipcChannels.mixerGetMonitorSurfaceConfig, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    return ipcOk(getMonitorSurfaceConfig())
  })

  ipcMain.handle(ipcChannels.mixerGetMonitorTargets, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    return ipcOk(getMonitorTargets())
  })

  ipcMain.handle(ipcChannels.mixerGetRecordingAudioState, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      return ipcOk(getRecordingAudioState())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.mixerSetRecordingAudioDelay,
    (event, args: MixerRecordingAudioDelayRequest) => {
      if (event.sender !== mainWindow.webContents) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        if (!args || typeof args.delayMs !== 'number' || !Number.isFinite(args.delayMs)) {
          return ipcError('VALIDATION_ERROR', 'Delay de audio inválido')
        }

        return ipcOk(setRecordingAudioDelayMs(args.delayMs))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(
    ipcChannels.mixerSetNativeMonitorLayout,
    (event, args: MixerNativeMonitorLayout) => {
      if (event.sender !== mainWindow.webContents) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        const validTarget =
          args?.target === 'preview' ||
          args?.target === 'program' ||
          args?.target === 'multiview' ||
          args?.target === 'audio-reference'
        const rect = args?.rect
        const validRect =
          rect &&
          Number.isFinite(rect.x) &&
          Number.isFinite(rect.y) &&
          Number.isFinite(rect.width) &&
          Number.isFinite(rect.height)

        if (!validTarget || typeof args?.visible !== 'boolean' || !validRect) {
          return ipcError('VALIDATION_ERROR', 'Layout de monitor nativo inválido')
        }

        const applied = setNativeMonitorSurfaceLayout(mainWindow, args)
        return ipcOk({ applied })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerStartPreviewMonitorWebRtc, (event, args: { sdp?: string }) => {
    if (!isMonitorRenderer(event.sender)) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      if (!args?.sdp || typeof args.sdp !== 'string') {
        return ipcError('VALIDATION_ERROR', 'SDP offer inválida')
      }

      startPreviewMonitorWebRTC(event.sender, args.sdp)
      return ipcOk({ started: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.mixerAddPreviewMonitorIceCandidate,
    (event, args: { sdpMLineIndex?: number; candidate?: string }) => {
      if (!isMonitorRenderer(event.sender)) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        if (typeof args?.sdpMLineIndex !== 'number' || typeof args?.candidate !== 'string') {
          return ipcError('VALIDATION_ERROR', 'ICE candidate inválido')
        }

        addPreviewMonitorIceCandidate(args.sdpMLineIndex, args.candidate)
        return ipcOk({ added: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerStopPreviewMonitorWebRtc, (event) => {
    if (!isMonitorRenderer(event.sender)) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      stopPreviewMonitorWebRTC()
      return ipcOk({ stopped: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.mixerStartProgramMonitorWebRtc, (event, args: { sdp?: string }) => {
    if (!isMonitorRenderer(event.sender)) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      if (!args?.sdp || typeof args.sdp !== 'string') {
        return ipcError('VALIDATION_ERROR', 'SDP offer inválida')
      }

      startProgramMonitorWebRTC(event.sender, args.sdp)
      return ipcOk({ started: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.mixerAddProgramMonitorIceCandidate,
    (event, args: { sdpMLineIndex?: number; candidate?: string }) => {
      if (!isMonitorRenderer(event.sender)) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        if (typeof args?.sdpMLineIndex !== 'number' || typeof args?.candidate !== 'string') {
          return ipcError('VALIDATION_ERROR', 'ICE candidate inválido')
        }

        addProgramMonitorIceCandidate(args.sdpMLineIndex, args.candidate)
        return ipcOk({ added: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerStopProgramMonitorWebRtc, (event) => {
    if (!isMonitorRenderer(event.sender)) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      stopProgramMonitorWebRTC()
      return ipcOk({ stopped: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.mixerStartCombinedMonitorWebRtc, (event, args: { sdp?: string }) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      if (!args?.sdp || typeof args.sdp !== 'string') {
        return ipcError('VALIDATION_ERROR', 'SDP offer inválida')
      }

      startCombinedMonitorWebRTC(event.sender, args.sdp)
      return ipcOk({ started: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.mixerAddCombinedMonitorIceCandidate,
    (event, args: { sdpMLineIndex?: number; candidate?: string }) => {
      if (event.sender !== mainWindow.webContents) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        if (typeof args?.sdpMLineIndex !== 'number' || typeof args?.candidate !== 'string') {
          return ipcError('VALIDATION_ERROR', 'ICE candidate inválido')
        }

        addCombinedMonitorIceCandidate(args.sdpMLineIndex, args.candidate)
        return ipcOk({ added: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerStopCombinedMonitorWebRtc, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      stopCombinedMonitorWebRTC()
      return ipcOk({ stopped: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.mixerStartMultiviewMonitorWebRtc, (event, args: { sdp?: string }) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      if (!args?.sdp || typeof args.sdp !== 'string') {
        return ipcError('VALIDATION_ERROR', 'SDP offer inválida')
      }

      startMultiviewMonitorWebRTC(event.sender, args.sdp)
      return ipcOk({ started: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.mixerAddMultiviewMonitorIceCandidate,
    (event, args: { sdpMLineIndex?: number; candidate?: string }) => {
      if (event.sender !== mainWindow.webContents) {
        return ipcError('FORBIDDEN', 'Sender no autorizado')
      }

      try {
        if (typeof args?.sdpMLineIndex !== 'number' || typeof args?.candidate !== 'string') {
          return ipcError('VALIDATION_ERROR', 'ICE candidate inválido')
        }

        addMultiviewMonitorIceCandidate(args.sdpMLineIndex, args.candidate)
        return ipcOk({ added: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.mixerStopMultiviewMonitorWebRtc, (event) => {
    if (event.sender !== mainWindow.webContents) {
      return ipcError('FORBIDDEN', 'Sender no autorizado')
    }

    try {
      stopMultiviewMonitorWebRTC()
      return ipcOk({ stopped: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })
}
