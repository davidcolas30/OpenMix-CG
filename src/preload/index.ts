import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ipcChannels } from '../shared/ipc/channels'
import type {
  MixerAutoTransitionRequest,
  MixerNativeMonitorLayout,
  MixerMonitorStatsReport,
  MixerRecordingAudioDelayRequest
} from '../shared/ipc/mixer-contracts'
import type { RecordingSettings, StartRecordingRequest } from '../shared/ipc/output-contracts'
import type { UpdateKeyboardShortcutBindingRequest } from '../shared/ipc/shortcut-contracts'
import type {
  LocalVideoSourceInfo,
  LoadLocalVideoSourceRequest,
  SetLocalVideoAutoPlayRequest,
  SetLocalVideoLoopRequest,
  SetLocalVideoPausedRequest
} from '../shared/ipc/source-contracts'

type MixerFramePayload = {
  width: number
  height: number
  format?: string
  data: Uint8Array
}

type MixerSourceFramePayload = MixerFramePayload & {
  sourceIndex: number
}

/**
 * API personalizada de OpenMix-CG expuesta al Renderer via contextBridge.
 *
 * Fase 2: Mixer con paradigma Preview/Program.
 *
 * contextBridge es el mecanismo seguro de Electron para que el Renderer
 * (donde corre React) pueda llamar a funciones del Main Process sin tener
 * acceso directo a Node.js. Solo se exponen las funciones que definimos aquí.
 *
 * IMPORTANTE: NO exponemos ipcRenderer directamente.
 * Creamos funciones wrapper que llaman a ipcRenderer.invoke()
 * internamente. Así el Renderer no puede enviar mensajes a canales arbitrarios.
 */
const openMixApi = {
  /**
   * API del mixer de vídeo (Fase 2).
   *
   * Expone comandos de control del mixer (start, stop, cut, cambiar fuentes)
   * y suscripciones a eventos de frames (PGM, PVW, thumbnails).
   */
  mixer: {
    // ── Comandos (Renderer → Main) ─────────────────────────

    /** Inicia el mixer con 4 fuentes de prueba */
    start: (): Promise<unknown> => ipcRenderer.invoke('mixer:start'),

    /** Detiene y destruye el mixer */
    stop: (): Promise<unknown> => ipcRenderer.invoke('mixer:stop'),

    /** Ejecuta un corte (intercambia PGM ↔ PVW) */
    cut: (): Promise<unknown> => ipcRenderer.invoke('mixer:cut'),

    /** Ejecuta una transición AUTO sobre Program usando la fuente actual de Preview */
    autoTransition: (request: MixerAutoTransitionRequest): Promise<unknown> =>
      ipcRenderer.invoke('mixer:auto-transition', request),

    /** Cambia la fuente en Program */
    setProgramSource: (index: number): Promise<unknown> =>
      ipcRenderer.invoke('mixer:set-program-source', { index }),

    /** Cambia la fuente en Preview */
    setPreviewSource: (index: number): Promise<unknown> =>
      ipcRenderer.invoke('mixer:set-preview-source', { index }),

    /** Obtiene el estado actual del mixer */
    getState: (): Promise<unknown> => ipcRenderer.invoke('mixer:get-state'),

    /** Obtiene la configuración de monitorización (resolución Preview/Program) */
    getMonitorSettings: (): Promise<unknown> => ipcRenderer.invoke('mixer:get-monitor-settings'),

    /** Actualiza la configuración de monitorización */
    updateMonitorSettings: (settings: { monitorResolution: string }): Promise<unknown> =>
      ipcRenderer.invoke('mixer:update-monitor-settings', settings),

    /** Reenvía a Main telemetría ligera del monitor para verla en el terminal */
    reportMonitorStats: (stats: MixerMonitorStatsReport): void => {
      ipcRenderer.send(ipcChannels.mixerReportMonitorStats, stats)
    },

    /** Indica si Preview debe mostrarse por IPC legacy o por WebRTC local. */
    getPreviewMonitorTransport: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerGetPreviewMonitorTransport),

    /** Indica si los monitores grandes viven dentro de React o en webviews aislados. */
    getMonitorSurfaceConfig: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerGetMonitorSurfaceConfig),

    /** Devuelve qué monitores WebRTC deben negociarse en esta prueba. */
    getMonitorTargets: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerGetMonitorTargets),

    /** Consulta el estado de la captura de audio local que puede entrar en REC. */
    getRecordingAudioState: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerGetRecordingAudioState),

    /** Aplica el delay de claqueta a la rama de audio local de REC. */
    setRecordingAudioDelay: (request: MixerRecordingAudioDelayRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerSetRecordingAudioDelay, request),

    /** Coloca/oculta una superficie nativa de monitorización. */
    setNativeMonitorLayout: (layout: MixerNativeMonitorLayout): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerSetNativeMonitorLayout, layout),

    /** Envía la offer SDP del Renderer para recibir Preview como MediaStreamTrack. */
    startPreviewMonitorWebRtc: (sdp: string): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStartPreviewMonitorWebRtc, { sdp }),

    /** Reenvía un ICE candidate del Renderer al webrtcbin local de Preview. */
    addPreviewMonitorIceCandidate: (candidate: {
      sdpMLineIndex: number
      candidate: string
    }): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerAddPreviewMonitorIceCandidate, candidate),

    /** Detiene la salida WebRTC local de Preview. */
    stopPreviewMonitorWebRtc: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStopPreviewMonitorWebRtc),

    /** Envía la offer SDP del Renderer para recibir Program como MediaStreamTrack. */
    startProgramMonitorWebRtc: (sdp: string): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStartProgramMonitorWebRtc, { sdp }),

    /** Reenvía un ICE candidate del Renderer al webrtcbin local de Program. */
    addProgramMonitorIceCandidate: (candidate: {
      sdpMLineIndex: number
      candidate: string
    }): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerAddProgramMonitorIceCandidate, candidate),

    /** Detiene la salida WebRTC local de Program. */
    stopProgramMonitorWebRtc: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStopProgramMonitorWebRtc),

    /** Envía la offer SDP del Renderer para recibir Preview+Program en un solo stream. */
    startCombinedMonitorWebRtc: (sdp: string): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStartCombinedMonitorWebRtc, { sdp }),

    /** Reenvía un ICE candidate del Renderer al webrtcbin local combinado. */
    addCombinedMonitorIceCandidate: (candidate: {
      sdpMLineIndex: number
      candidate: string
    }): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerAddCombinedMonitorIceCandidate, candidate),

    /** Detiene la salida WebRTC local combinada. */
    stopCombinedMonitorWebRtc: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStopCombinedMonitorWebRtc),

    /** Envía la offer SDP del Renderer para recibir Multiview como MediaStreamTrack. */
    startMultiviewMonitorWebRtc: (sdp: string): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStartMultiviewMonitorWebRtc, { sdp }),

    /** Reenvía un ICE candidate del Renderer al webrtcbin local de Multiview. */
    addMultiviewMonitorIceCandidate: (candidate: {
      sdpMLineIndex: number
      candidate: string
    }): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerAddMultiviewMonitorIceCandidate, candidate),

    /** Detiene la salida WebRTC local de Multiview. */
    stopMultiviewMonitorWebRtc: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.mixerStopMultiviewMonitorWebRtc),

    // ── Eventos (Main → Renderer) ──────────────────────────

    /**
     * Suscribirse a frames del Program.
     * Devuelve función de cleanup para desuscribirse.
     */
    onPgmFrame: (callback: (frame: MixerFramePayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, frame: MixerFramePayload): void => {
        callback(frame)
      }
      ipcRenderer.on('mixer:pgm-frame', listener)
      return (): void => {
        ipcRenderer.removeListener('mixer:pgm-frame', listener)
      }
    },

    /**
     * Suscribirse a frames del Preview.
     * Devuelve función de cleanup para desuscribirse.
     */
    onPvwFrame: (callback: (frame: MixerFramePayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, frame: MixerFramePayload): void => {
        callback(frame)
      }
      ipcRenderer.on('mixer:pvw-frame', listener)
      return (): void => {
        ipcRenderer.removeListener('mixer:pvw-frame', listener)
      }
    },

    /**
     * Suscribirse a frames de thumbnails de fuentes.
     * Cada frame incluye sourceIndex para identificar la fuente.
     * Devuelve función de cleanup.
     */
    onSourceFrame: (callback: (frame: MixerSourceFramePayload) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        frame: MixerSourceFramePayload
      ): void => {
        callback(frame)
      }
      ipcRenderer.on('mixer:source-frame', listener)
      return (): void => {
        ipcRenderer.removeListener('mixer:source-frame', listener)
      }
    },

    /**
     * Suscribirse a miniaturas de referencia visual para la calibración de audio.
     * La imagen live va por superficie nativa; estos frames son solo el buffer de claqueta.
     */
    onAudioReferenceFrame: (callback: (frame: MixerFramePayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, frame: MixerFramePayload): void => {
        callback(frame)
      }
      ipcRenderer.on(ipcChannels.mixerAudioReferenceFrame, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerAudioReferenceFrame, listener)
      }
    },

    /**
     * Suscribirse a mensajes del bus GStreamer.
     * Devuelve función de cleanup.
     */
    onBusMessage: (callback: (msg: { type: string; message?: string; debug?: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        msg: { type: string; message?: string; debug?: string }
      ): void => {
        callback(msg)
      }
      ipcRenderer.on('mixer:bus-message', listener)
      return (): void => {
        ipcRenderer.removeListener('mixer:bus-message', listener)
      }
    },

    onPreviewMonitorWebRtcAnswer: (callback: (answer: { type: string; sdp: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        answer: { type: string; sdp: string }
      ): void => {
        callback(answer)
      }
      ipcRenderer.on(ipcChannels.mixerPreviewMonitorWebRtcAnswer, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerPreviewMonitorWebRtcAnswer, listener)
      }
    },

    onPreviewMonitorWebRtcIceCandidate: (
      callback: (candidate: { candidate: string; sdpMLineIndex: number }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        candidate: { candidate: string; sdpMLineIndex: number }
      ): void => {
        callback(candidate)
      }
      ipcRenderer.on(ipcChannels.mixerPreviewMonitorWebRtcIceCandidate, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerPreviewMonitorWebRtcIceCandidate, listener)
      }
    },

    onProgramMonitorWebRtcAnswer: (callback: (answer: { type: string; sdp: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        answer: { type: string; sdp: string }
      ): void => {
        callback(answer)
      }
      ipcRenderer.on(ipcChannels.mixerProgramMonitorWebRtcAnswer, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerProgramMonitorWebRtcAnswer, listener)
      }
    },

    onProgramMonitorWebRtcIceCandidate: (
      callback: (candidate: { candidate: string; sdpMLineIndex: number }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        candidate: { candidate: string; sdpMLineIndex: number }
      ): void => {
        callback(candidate)
      }
      ipcRenderer.on(ipcChannels.mixerProgramMonitorWebRtcIceCandidate, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerProgramMonitorWebRtcIceCandidate, listener)
      }
    },

    onCombinedMonitorWebRtcAnswer: (callback: (answer: { type: string; sdp: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        answer: { type: string; sdp: string }
      ): void => {
        callback(answer)
      }
      ipcRenderer.on(ipcChannels.mixerCombinedMonitorWebRtcAnswer, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerCombinedMonitorWebRtcAnswer, listener)
      }
    },

    onCombinedMonitorWebRtcIceCandidate: (
      callback: (candidate: { candidate: string; sdpMLineIndex: number }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        candidate: { candidate: string; sdpMLineIndex: number }
      ): void => {
        callback(candidate)
      }
      ipcRenderer.on(ipcChannels.mixerCombinedMonitorWebRtcIceCandidate, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerCombinedMonitorWebRtcIceCandidate, listener)
      }
    },

    onMultiviewMonitorWebRtcAnswer: (callback: (answer: { type: string; sdp: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        answer: { type: string; sdp: string }
      ): void => {
        callback(answer)
      }
      ipcRenderer.on(ipcChannels.mixerMultiviewMonitorWebRtcAnswer, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerMultiviewMonitorWebRtcAnswer, listener)
      }
    },

    onMultiviewMonitorWebRtcIceCandidate: (
      callback: (candidate: { candidate: string; sdpMLineIndex: number }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        candidate: { candidate: string; sdpMLineIndex: number }
      ): void => {
        callback(candidate)
      }
      ipcRenderer.on(ipcChannels.mixerMultiviewMonitorWebRtcIceCandidate, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.mixerMultiviewMonitorWebRtcIceCandidate, listener)
      }
    }
  },

  /**
   * API de fuentes de vídeo (Fase 3 — WebRTC).
   *
   * Gestión de cámaras móviles: crear tokens de conexión (QR),
   * listar peers, suscribirse a cambios de estado.
   */
  sources: {
    // ── Comandos (Renderer → Main) ─────────────────────────

    /** Crea un token de conexión para una nueva cámara. Devuelve { peerId, token, url } */
    createToken: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.sourcesCreateToken),

    /** Lista de peers activos con su estado */
    list: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.sourcesList),

    /** Elimina un peer y cierra su conexión */
    removePeer: (peerId: string): Promise<unknown> =>
      ipcRenderer.invoke('sources:remove-peer', peerId),

    /** Info del servidor (IP, puerto) */
    getServerInfo: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.sourcesGetServerInfo),

    /** Abre el diálogo nativo para elegir un fichero de vídeo local */
    chooseLocalVideo: (): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesChooseLocalVideo),

    /** Carga un fichero de vídeo local en un slot real del mixer */
    loadLocalVideo: (request: LoadLocalVideoSourceRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesLoadLocalVideo, request),

    /** Libera el vídeo local cargado en un slot */
    clearLocalVideo: (sourceIndex: number): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesClearLocalVideo, sourceIndex),

    /** Reinicia desde el principio el vídeo local cargado en un slot */
    restartLocalVideo: (sourceIndex: number): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesRestartLocalVideo, sourceIndex),

    /** Pausa o reanuda un vídeo local cargado */
    setLocalVideoPaused: (request: SetLocalVideoPausedRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesSetLocalVideoPaused, request),

    /** Activa o desactiva loop para un vídeo local cargado */
    setLocalVideoLoop: (request: SetLocalVideoLoopRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesSetLocalVideoLoop, request),

    /** Activa autoplay/autopause al entrar o salir de Program */
    setLocalVideoAutoPlay: (request: SetLocalVideoAutoPlayRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.sourcesSetLocalVideoAutoPlay, request),

    /** Lista los vídeos locales cargados actualmente */
    listLocalVideos: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.sourcesListLocalVideos),

    /** Suscribirse a cambios de estado de vídeos locales */
    onLocalVideosChanged: (callback: (sources: LocalVideoSourceInfo[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        event: { sources: LocalVideoSourceInfo[] }
      ): void => {
        callback(event.sources)
      }
      ipcRenderer.on(ipcChannels.sourcesLocalVideosChanged, listener)
      return (): void => {
        ipcRenderer.removeListener(ipcChannels.sourcesLocalVideosChanged, listener)
      }
    },

    // ── Eventos (Main → Renderer) ──────────────────────────

    /** Suscribirse a cambios de estado de peers (conecta, desconecta, etc.) */
    onPeerState: (callback: (event: { peerId: string; state: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { peerId: string; state: string }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('sources:peer-state', listener)
      return (): void => {
        ipcRenderer.removeListener('sources:peer-state', listener)
      }
    }
  },

  /**
   * API de grafismo (Fase 4 — motor de preview de plantillas).
   *
   * Expone una pila de instancias de grafismo: se pueden añadir varias
   * plantillas, editar cada una por separado y llevarlas al aire de forma
   * independiente desde el panel o desde el mixer.
   */
  graphics: {
    /** Lista las plantillas disponibles en resources/graphics-templates */
    listTemplates: (): Promise<unknown> => ipcRenderer.invoke('graphics:list-templates'),

    /** Añade una plantilla como nueva instancia a la pila de grafismos */
    addTemplate: (templateId: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:add-template', templateId),

    /** Selecciona una instancia concreta para editarla en el panel */
    selectItem: (itemId: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:select-item', itemId),

    /** Elimina una instancia de la pila de grafismos */
    removeItem: (itemId: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:remove-item', itemId),

    /** Actualiza un campo editable de una instancia concreta */
    updateField: (itemId: string, fieldId: string, value: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:update-field', { itemId, fieldId, value }),

    /** Ajusta la posición de una instancia dentro del lienzo nominal */
    setPlacement: (
      itemId: string,
      placement: { offsetX: number; offsetY: number }
    ): Promise<unknown> => ipcRenderer.invoke('graphics:set-placement', { itemId, ...placement }),

    /** Decide si una instancia se superpone sobre Preview y/o Program */
    setOverlayTargets: (
      itemId: string,
      targets: { preview: boolean; program: boolean }
    ): Promise<unknown> =>
      ipcRenderer.invoke('graphics:set-overlay-targets', { itemId, ...targets }),

    /** Dispara la animación de entrada de una instancia concreta */
    showItem: (itemId: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:show-item', { itemId }),

    /** Dispara la animación de salida de una instancia concreta */
    hideItem: (itemId: string): Promise<unknown> =>
      ipcRenderer.invoke('graphics:hide-item', { itemId }),

    /** Devuelve el estado actual del motor de grafismo */
    getState: (): Promise<unknown> => ipcRenderer.invoke('graphics:get-state'),

    /** Obtiene el último frame de preview disponible */
    getPreviewFrame: (): Promise<unknown> => ipcRenderer.invoke('graphics:get-preview-frame'),

    /** Obtiene el último frame derivado del overlay nativo del mixer */
    getMixerFrame: (): Promise<unknown> => ipcRenderer.invoke('graphics:get-mixer-frame'),

    /** Ajusta la salida de preview a la vista activa para no sobredimensionar el IPC */
    setPreviewOutput: (config: {
      enabled: boolean
      width: number
      height: number
      maxFps: number
    }): Promise<unknown> => ipcRenderer.invoke('graphics:set-preview-output', config),

    /** Suscribirse a frames del preview de grafismo ya adaptados para la UI */
    onPreviewFrame: (
      callback: (frame: { width: number; height: number; data: Uint8Array }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        frame: { width: number; height: number; data: Uint8Array }
      ): void => {
        callback(frame)
      }

      ipcRenderer.on('graphics:preview-frame', listener)

      void ipcRenderer.invoke('graphics:get-preview-frame').then((result: unknown) => {
        const previewResult = result as {
          ok?: boolean
          data?: { width: number; height: number; data: Uint8Array }
        }

        if (previewResult.ok && previewResult.data) {
          callback(previewResult.data)
        }
      })

      return (): void => {
        ipcRenderer.removeListener('graphics:preview-frame', listener)
      }
    },

    /** Suscribirse al frame del slot de grafismo del multiview derivado del mixer */
    onMixerFrame: (
      callback: (frame: { width: number; height: number; data: Uint8Array }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        frame: { width: number; height: number; data: Uint8Array }
      ): void => {
        callback(frame)
      }

      ipcRenderer.on('graphics:mixer-frame', listener)

      void ipcRenderer.invoke('graphics:get-mixer-frame').then((result: unknown) => {
        const previewResult = result as {
          ok?: boolean
          data?: { width: number; height: number; data: Uint8Array }
        }

        if (previewResult.ok && previewResult.data) {
          callback(previewResult.data)
        }
      })

      return (): void => {
        ipcRenderer.removeListener('graphics:mixer-frame', listener)
      }
    }
  },

  /**
   * API de output (Fase 5 — grabación local del Program).
   */
  output: {
    /** Inicia una grabación local del Program en la carpeta indicada o en la carpeta por defecto */
    startRecording: (request?: StartRecordingRequest): Promise<unknown> =>
      ipcRenderer.invoke('output:start-recording', request),

    /** Detiene la grabación activa y espera a que FFmpeg cierre el fichero */
    stopRecording: (): Promise<unknown> => ipcRenderer.invoke('output:stop-recording'),

    /** Devuelve el estado actual de la grabación */
    getRecordingState: (): Promise<unknown> => ipcRenderer.invoke('output:get-recording-state'),

    /** Lee los ajustes persistidos de grabación para hidratar la UI al arrancar */
    getRecordingSettings: (): Promise<unknown> =>
      ipcRenderer.invoke('output:get-recording-settings'),

    /** Guarda los ajustes persistidos de grabación para siguientes reinicios */
    updateRecordingSettings: (settings: RecordingSettings): Promise<unknown> =>
      ipcRenderer.invoke('output:update-recording-settings', settings),

    /** Abre el selector nativo de carpeta para elegir el destino de las grabaciones */
    chooseRecordingDirectory: (): Promise<unknown> =>
      ipcRenderer.invoke('output:choose-recording-directory')
  },

  /**
   * API de atajos configurables.
   *
   * Solo mueve configuracion pequeña por IPC; la ejecucion de acciones se hace
   * en Renderer llamando a las APIs ya expuestas del mixer/grafismo/fuentes.
   */
  shortcuts: {
    /** Lee los atajos persistidos en Main Process */
    getSettings: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.shortcutsGetSettings),

    /** Cambia una asignacion concreta o la deja sin tecla */
    updateBinding: (request: UpdateKeyboardShortcutBindingRequest): Promise<unknown> =>
      ipcRenderer.invoke(ipcChannels.shortcutsUpdateBinding, request),

    /** Recupera los atajos por defecto */
    resetDefaults: (): Promise<unknown> => ipcRenderer.invoke(ipcChannels.shortcutsResetDefaults)
  }
}

if (process.contextIsolated) {
  try {
    // electron: API genérica del toolkit (acceso a ipcRenderer, etc.)
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // openMix: nuestra API específica del proyecto
    contextBridge.exposeInMainWorld('openMix', openMixApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore — fallback para entornos sin context isolation (no debería ocurrir)
  window.electron = electronAPI
  // @ts-ignore — fallback para entornos sin context isolation (no debería ocurrir)
  window.openMix = openMixApi
}
