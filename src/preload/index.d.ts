import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  GraphicsOverlayTargets,
  GraphicsPreviewOutputConfig,
  GraphicsPlacement,
  GraphicsPreviewFrame
} from '../shared/ipc/graphics-contracts'
import type {
  MixerAutoTransitionRequest,
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
import type {
  MixerNativeMonitorLayout,
  MixerMonitorStatsReport
} from '../shared/ipc/mixer-contracts'

/**
 * Declaración de tipos globales para window.
 *
 * Fase 2+3: Mixer Preview/Program + WebRTC Sources.
 *
 * Esto le dice a TypeScript qué propiedades existen en el objeto window
 * después de que el preload las haya expuesto via contextBridge.
 */

/** Información de un frame de vídeo recibido via IPC */
interface FrameData {
  width: number
  height: number
  /** Formato de píxel declarado por GStreamer. */
  format?: 'BGRA' | 'RGBA' | string
  /** Datos crudos — Buffer en Main, Uint8Array en Renderer (Structured Clone). */
  data: Uint8Array
}

/** Frame de thumbnail con identificador de fuente */
interface SourceFrameData extends FrameData {
  /** Índice de la fuente (0-3) que generó este thumbnail */
  sourceIndex: number
}

/** Mensaje del bus de GStreamer */
interface BusMessage {
  type: string
  message?: string
  debug?: string
}

interface PreviewMonitorWebRtcDescription {
  type: string
  sdp: string
}

interface PreviewMonitorWebRtcIceCandidate {
  candidate: string
  sdpMLineIndex: number
}

/** API del mixer de vídeo (Fase 2) */
interface MixerApi {
  // Comandos
  start(): Promise<unknown>
  stop(): Promise<unknown>
  cut(): Promise<unknown>
  autoTransition(request: MixerAutoTransitionRequest): Promise<unknown>
  setProgramSource(index: number): Promise<unknown>
  setPreviewSource(index: number): Promise<unknown>
  getState(): Promise<unknown>
  getMonitorSettings(): Promise<unknown>
  updateMonitorSettings(settings: { monitorResolution: string }): Promise<unknown>
  reportMonitorStats(stats: MixerMonitorStatsReport): void
  getPreviewMonitorTransport(): Promise<unknown>
  getMonitorSurfaceConfig(): Promise<unknown>
  getMonitorTargets(): Promise<unknown>
  getRecordingAudioState(): Promise<unknown>
  setRecordingAudioDelay(request: MixerRecordingAudioDelayRequest): Promise<unknown>
  setNativeMonitorLayout(layout: MixerNativeMonitorLayout): Promise<unknown>
  startPreviewMonitorWebRtc(sdp: string): Promise<unknown>
  addPreviewMonitorIceCandidate(candidate: PreviewMonitorWebRtcIceCandidate): Promise<unknown>
  stopPreviewMonitorWebRtc(): Promise<unknown>
  startProgramMonitorWebRtc(sdp: string): Promise<unknown>
  addProgramMonitorIceCandidate(candidate: PreviewMonitorWebRtcIceCandidate): Promise<unknown>
  stopProgramMonitorWebRtc(): Promise<unknown>
  startCombinedMonitorWebRtc(sdp: string): Promise<unknown>
  addCombinedMonitorIceCandidate(candidate: PreviewMonitorWebRtcIceCandidate): Promise<unknown>
  stopCombinedMonitorWebRtc(): Promise<unknown>
  startMultiviewMonitorWebRtc(sdp: string): Promise<unknown>
  addMultiviewMonitorIceCandidate(candidate: PreviewMonitorWebRtcIceCandidate): Promise<unknown>
  stopMultiviewMonitorWebRtc(): Promise<unknown>

  // Eventos
  onPgmFrame(callback: (frame: FrameData) => void): () => void
  onPvwFrame(callback: (frame: FrameData) => void): () => void
  onSourceFrame(callback: (frame: SourceFrameData) => void): () => void
  onAudioReferenceFrame(callback: (frame: FrameData) => void): () => void
  onBusMessage(callback: (msg: BusMessage) => void): () => void
  onPreviewMonitorWebRtcAnswer(
    callback: (answer: PreviewMonitorWebRtcDescription) => void
  ): () => void
  onPreviewMonitorWebRtcIceCandidate(
    callback: (candidate: PreviewMonitorWebRtcIceCandidate) => void
  ): () => void
  onProgramMonitorWebRtcAnswer(
    callback: (answer: PreviewMonitorWebRtcDescription) => void
  ): () => void
  onProgramMonitorWebRtcIceCandidate(
    callback: (candidate: PreviewMonitorWebRtcIceCandidate) => void
  ): () => void
  onCombinedMonitorWebRtcAnswer(
    callback: (answer: PreviewMonitorWebRtcDescription) => void
  ): () => void
  onCombinedMonitorWebRtcIceCandidate(
    callback: (candidate: PreviewMonitorWebRtcIceCandidate) => void
  ): () => void
  onMultiviewMonitorWebRtcAnswer(
    callback: (answer: PreviewMonitorWebRtcDescription) => void
  ): () => void
  onMultiviewMonitorWebRtcIceCandidate(
    callback: (candidate: PreviewMonitorWebRtcIceCandidate) => void
  ): () => void
}

/** Evento de cambio de estado de un peer */
interface PeerStateEvent {
  peerId: string
  state: string
}

/** API de fuentes de vídeo (Fase 3 — WebRTC) */
interface SourcesApi {
  createToken(): Promise<unknown>
  list(): Promise<unknown>
  removePeer(peerId: string): Promise<unknown>
  getServerInfo(): Promise<unknown>
  chooseLocalVideo(): Promise<unknown>
  loadLocalVideo(request: LoadLocalVideoSourceRequest): Promise<unknown>
  clearLocalVideo(sourceIndex: number): Promise<unknown>
  restartLocalVideo(sourceIndex: number): Promise<unknown>
  setLocalVideoPaused(request: SetLocalVideoPausedRequest): Promise<unknown>
  setLocalVideoLoop(request: SetLocalVideoLoopRequest): Promise<unknown>
  setLocalVideoAutoPlay(request: SetLocalVideoAutoPlayRequest): Promise<unknown>
  listLocalVideos(): Promise<unknown>
  onLocalVideosChanged(callback: (sources: LocalVideoSourceInfo[]) => void): () => void
  onPeerState(callback: (event: PeerStateEvent) => void): () => void
}

/** API de grafismo (Fase 4) */
interface GraphicsApi {
  listTemplates(): Promise<unknown>
  addTemplate(templateId: string): Promise<unknown>
  selectItem(itemId: string): Promise<unknown>
  removeItem(itemId: string): Promise<unknown>
  updateField(itemId: string, fieldId: string, value: string): Promise<unknown>
  setPlacement(itemId: string, placement: GraphicsPlacement): Promise<unknown>
  setOverlayTargets(itemId: string, targets: GraphicsOverlayTargets): Promise<unknown>
  showItem(itemId: string): Promise<unknown>
  hideItem(itemId: string): Promise<unknown>
  getState(): Promise<unknown>
  getPreviewFrame(): Promise<unknown>
  getMixerFrame(): Promise<unknown>
  setPreviewOutput(config: GraphicsPreviewOutputConfig): Promise<unknown>
  onPreviewFrame(callback: (frame: GraphicsPreviewFrame) => void): () => void
  onMixerFrame(callback: (frame: GraphicsPreviewFrame) => void): () => void
}

/** API de output (Fase 5) */
interface OutputApi {
  startRecording(request?: StartRecordingRequest): Promise<unknown>
  stopRecording(): Promise<unknown>
  getRecordingState(): Promise<unknown>
  getRecordingSettings(): Promise<unknown>
  updateRecordingSettings(settings: RecordingSettings): Promise<unknown>
  chooseRecordingDirectory(): Promise<unknown>
}

/** API de configuración de atajos de teclado */
interface ShortcutsApi {
  getSettings(): Promise<unknown>
  updateBinding(request: UpdateKeyboardShortcutBindingRequest): Promise<unknown>
  resetDefaults(): Promise<unknown>
}

/** API completa de OpenMix-CG expuesta en window.openMix */
interface OpenMixCgApi {
  mixer: MixerApi
  sources: SourcesApi
  graphics: GraphicsApi
  output: OutputApi
  shortcuts: ShortcutsApi
}

declare global {
  interface Window {
    /** API genérica de Electron (ipcRenderer, etc.) */
    electron: ElectronAPI
    /** API específica de OpenMix-CG */
    openMix: OpenMixCgApi
  }
}
