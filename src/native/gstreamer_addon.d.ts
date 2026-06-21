/**
 * Declaración de tipos para el addon nativo de GStreamer.
 *
 * Fase 2+3: Mixer Preview/Program + WebRTC Peers.
 *
 * Este archivo describe la forma TypeScript de las funciones C++
 * exportadas por gstreamer_addon.cpp. Así podemos usar el addon
 * desde TypeScript con autocompletado y verificación de tipos.
 */

import type { MixerTransitionId } from '../shared/ipc/mixer-contracts'

/** Información de un frame de vídeo extraído del pipeline */
export interface GstFrameInfo {
  /** Ancho del frame en píxeles */
  width: number
  /** Alto del frame en píxeles */
  height: number
  /** Formato de píxel declarado por GStreamer */
  format?: 'BGRA' | 'RGBA' | string
  /** Datos crudos del frame (4 bytes por píxel en monitores y thumbnails) */
  data: Buffer
}

/** Frame de thumbnail con identificador de la fuente */
export interface GstThumbFrameInfo extends GstFrameInfo {
  /** Índice de la fuente (0-3) que generó este thumbnail */
  sourceIndex: number
}

/** Mensaje del bus de GStreamer */
export interface GstBusMessage {
  /** Tipo de mensaje: 'error', 'warning', 'eos', 'state-changed', etc. */
  type: string
  /** Mensaje descriptivo (presente en error, warning, state-changed) */
  message?: string
  /** Información de debug (presente en error, warning) */
  debug?: string
}

/** Estado actual del mixer */
export interface GstMixerState {
  /** Índice de la fuente actualmente en Program (al aire) */
  programSource: number
  /** Índice de la fuente actualmente en Preview */
  previewSource: number
  /** Número total de fuentes disponibles */
  numSources: number
  /** Nombres descriptivos de cada fuente */
  sourceNames: string[]
  /** Si una transición AUTO está modificando el compositor Program */
  isTransitionInProgress: boolean
}

/** Estado de la captura de audio local que puede muxarse en REC. */
export interface GstRecordingAudioState {
  enabled: boolean
  active: boolean
  source: string
  delayMs: number
}

/** API exportada por el addon nativo de GStreamer */
export interface GStreamerAddon {
  /** Inicializa GStreamer. Llamar una sola vez al arrancar. */
  initialize(): void

  /**
   * Crea el pipeline del mixer con 4 fuentes de prueba,
   * 2 compositores (PGM/PVW), grabación nativa, thumbnails y buffer visual de Audio.
   *
   * @param monitorWidth - Ancho de los monitores Preview/Program (ej: 640)
   * @param monitorHeight - Alto de los monitores Preview/Program (ej: 360)
   */
  createMixerPipeline(
    onPgmFrame: (frame: GstFrameInfo) => void,
    onPvwFrame: (frame: GstFrameInfo) => void,
    onThumbFrame: (frame: GstThumbFrameInfo) => void,
    onBusMessage: (msg: GstBusMessage) => void,
    onPgmRecordingFrame: (frame: GstFrameInfo) => void,
    onAudioReferenceFrame: (frame: GstFrameInfo) => void,
    monitorWidth: number,
    monitorHeight: number
  ): void

  /** Arranca el pipeline (estado PLAYING). */
  startPipeline(): void

  /** Detiene el pipeline (estado NULL). */
  stopPipeline(): void

  /** Destruye el pipeline y libera todos los recursos. */
  destroyPipeline(): void

  /** Cambia la fuente activa en Program. */
  setProgramSource(index: number): void

  /** Cambia la fuente activa en Preview. */
  setPreviewSource(index: number): void

  /** Intercambia las fuentes de Program y Preview (corte). */
  cut(): void

  /** Ejecuta una transición AUTO entre Program y Preview. */
  autoTransition(transitionId: MixerTransitionId, durationMs: number): void

  /** Devuelve el estado actual del mixer. */
  getMixerState(): GstMixerState

  /**
   * Carga un fichero de vídeo local dentro de un slot real del mixer.
   * La UI solo pasa una URI file://; la decodificación y el reloj viven en GStreamer.
   */
  loadLocalVideoSource(sourceIndex: number, uri: string): boolean

  /** Libera el fichero local cargado en un slot del mixer. */
  clearLocalVideoSource(sourceIndex: number): boolean

  /** Vuelve a reproducir desde el principio el fichero local de un slot. */
  restartLocalVideoSource(sourceIndex: number): boolean

  /** Pausa o reanuda el fichero local cargado en un slot sin sacar frames del plano nativo. */
  setLocalVideoPaused(sourceIndex: number, paused: boolean): boolean

  /** Activa o desactiva la repetición automática del fichero local. */
  setLocalVideoLoop(sourceIndex: number, loop: boolean): boolean

  /** Empuja un frame BGRA de grafismo al compositor nativo de PGM o PVW. */
  pushGraphicsOverlayFrame(
    target: 'program' | 'preview',
    data: Buffer,
    width: number,
    height: number
  ): boolean

  /** Activa o desactiva la visibilidad del overlay nativo en PGM o PVW. */
  setGraphicsOverlayEnabled(target: 'program' | 'preview', enabled: boolean): boolean

  /**
   * Conecta la salida nativa de Preview/Program a una vista de ventana creada
   * por Electron. El Buffer viene de BrowserWindow.getNativeWindowHandle().
   */
  setNativeMonitorWindowHandle(
    target: 'program' | 'preview' | 'multiview' | 'audio-reference',
    nativeHandle: Buffer
  ): boolean

  /** Abre o cierra la valve de la salida nativa sin destruir el pipeline. */
  setNativeMonitorVisible(
    target: 'program' | 'preview' | 'multiview' | 'audio-reference',
    visible: boolean
  ): boolean

  /** Activa o desactiva el envío de frames Program de alta resolución para grabación. */
  setProgramRecordingEnabled(enabled: boolean): void

  /**
   * Inicia la grabación nativa del Program dentro de GStreamer.
   *
   * A diferencia de setProgramRecordingEnabled(), esta ruta codifica y escribe
   * el fichero en el plano de media, sin enviar frames BGRA 1080p a Electron.
   */
  startProgramRecording(
    filePath: string,
    container: 'mp4' | 'mkv',
    videoPreset: 'veryfast' | 'fast' | 'medium',
    qualityCrf: number
  ): boolean

  /** Detiene la grabación nativa y finaliza el contenedor de salida. */
  stopProgramRecording(): boolean

  /** Aplica el delay del audio local usado por la rama nativa de REC. */
  setRecordingAudioDelayMs(delayMs: number): boolean

  /** Consulta si la rama de audio local para REC está habilitada/activa. */
  getRecordingAudioState(): GstRecordingAudioState

  // ── WebRTC (Fase 3 — Bloque B) ────────────────────────

  /**
   * Crea un nuevo peer WebRTC con su propio pipeline GStreamer.
   *
   * @param peerId - Identificador único del peer
   * @param sourceIndex - Índice de fuente del mixer reservado para este peer
   * @param onAnswer - Callback que recibe la SDP answer generada ({ type: 'answer', sdp: string })
   * @param onIceCandidate - Callback que recibe ICE candidates ({ candidate: string, sdpMLineIndex: number })
   */
  createWebRTCPeer(
    peerId: string,
    sourceIndex: number,
    onAnswer: (answer: { type: string; sdp: string }) => void,
    onIceCandidate: (candidate: { candidate: string; sdpMLineIndex: number }) => void
  ): void

  /**
   * Configura la SDP offer del peer remoto y genera automáticamente la answer.
   * La answer se envía via el callback onAnswer del createWebRTCPeer.
   */
  setRemoteOffer(peerId: string, sdpString: string): void

  /**
   * Añade un ICE candidate remoto al webrtcbin del peer.
   */
  addRemoteIceCandidate(peerId: string, sdpMLineIndex: number, candidate: string): void

  /**
   * Destruye un peer WebRTC y libera todos sus recursos.
   */
  removeWebRTCPeer(peerId: string): void

  /**
   * Crea/activa el peer WebRTC local que envía Preview hacia el Renderer.
   * Este camino es experimental: busca sustituir el envío de frames PVW por IPC
   * por una señal de media real recibida en Chromium como MediaStreamTrack.
   */
  startPreviewMonitorWebRTC(
    sdpString: string,
    onAnswer: (answer: { type: string; sdp: string }) => void,
    onIceCandidate: (candidate: { candidate: string; sdpMLineIndex: number }) => void
  ): void

  /** Añade un ICE candidate generado por el RTCPeerConnection del Renderer. */
  addPreviewMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void

  /** Cierra la salida WebRTC local de Preview y vuelve a cerrar su valve. */
  stopPreviewMonitorWebRTC(): void

  /**
   * Crea/activa el peer WebRTC local que envia Program compuesto al Renderer.
   * Usa la salida del compositor, por tanto incluye grafismos y transiciones.
   */
  startProgramMonitorWebRTC(
    sdpString: string,
    onAnswer: (answer: { type: string; sdp: string }) => void,
    onIceCandidate: (candidate: { candidate: string; sdpMLineIndex: number }) => void
  ): void

  /** Añade un ICE candidate generado por el RTCPeerConnection del Renderer. */
  addProgramMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void

  /** Cierra la salida WebRTC local de Program y vuelve a cerrar su valve. */
  stopProgramMonitorWebRTC(): void

  /**
   * Crea/activa un peer WebRTC local que empaqueta Preview y Program en una
   * sola imagen. Es una ruta de monitorización experimental para evitar dos
   * decodificadores/presentadores grandes en Chromium.
   */
  startCombinedMonitorWebRTC(
    sdpString: string,
    onAnswer: (answer: { type: string; sdp: string }) => void,
    onIceCandidate: (candidate: { candidate: string; sdpMLineIndex: number }) => void
  ): void

  /** Añade un ICE candidate generado por el RTCPeerConnection combinado. */
  addCombinedMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void

  /** Cierra la salida WebRTC local combinada y vuelve a cerrar sus valves. */
  stopCombinedMonitorWebRTC(): void

  /**
   * Crea/activa el peer WebRTC local que envía la multiview nativa al Renderer.
   * Esta salida sustituye a los thumbnails BGRA por IPC: GStreamer compone una
   * parrilla de slots y Chromium la recibe como MediaStreamTrack.
   */
  startMultiviewMonitorWebRTC(
    sdpString: string,
    onAnswer: (answer: { type: string; sdp: string }) => void,
    onIceCandidate: (candidate: { candidate: string; sdpMLineIndex: number }) => void
  ): void

  /** Añade un ICE candidate generado por el RTCPeerConnection de multiview. */
  addMultiviewMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void

  /** Cierra la salida WebRTC local de Multiview y vuelve a cerrar su valve. */
  stopMultiviewMonitorWebRTC(): void
}

declare const addon: GStreamerAddon
export default addon
