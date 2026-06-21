/**
 * Contratos IPC del mixer — tipos compartidos entre Main y Renderer.
 *
 * Define las estructuras de datos que viajan por IPC para el módulo
 * del mixer. Tanto Main como Renderer importan estos tipos, así que
 * cualquier cambio incompatible se detecta en compilación.
 */

// ── Estado del mixer ────────────────────────────────────────

/** Información de una fuente de vídeo disponible en el mixer */
export interface MixerSourceInfo {
  /** Índice de la fuente (0-based) */
  index: number
  /** Nombre descriptivo (ej: "SMPTE Bars", "Ball") */
  name: string
}

/** Identificadores estables de las transiciones disponibles en AUTO */
export type MixerTransitionId = 'cut' | 'mix' | 'dip-to-black' | 'slide-left' | 'slide-right'

/** Preset serializable de transición del mixer */
export interface MixerTransitionDefinition {
  /** ID estable usado en IPC, persistencia futura y automatización */
  id: MixerTransitionId
  /** Nombre corto visible en la UI */
  label: string
  /** Explicación breve para que el operador entienda el efecto */
  description: string
}

/** Configuración mínima que necesita una acción AUTO */
export interface MixerAutoTransitionRequest {
  /** Transición elegida por el operador */
  transitionId: MixerTransitionId
  /** Duración total en milisegundos */
  durationMs: number
}

/** Telemetría ligera del monitor del mixer enviada desde el Renderer. */
export interface MixerMonitorStatsReport {
  /** Etiqueta visible del monitor (PGM, PVW, etc.) */
  label: string
  /** Frames recibidos normalizados a fps en la última muestra */
  receivedFps: number
  /** Frames realmente pintados normalizados a fps en la última muestra */
  renderedFps: number
  /** Frames descartados o sobrescritos durante la última muestra */
  skippedFrames: number
  /** Duración real de la muestra; útil para diagnosticar timers del Renderer */
  sampleMs?: number
  /** Resolución interna del raster que está pintando el canvas */
  rasterWidth: number
  rasterHeight: number
}

/** Monitores WebRTC locales que el Renderer debe negociar para diagnosticar carga. */
export interface MixerMonitorTargets {
  preview: boolean
  program: boolean
  /** Usa una sola señal WebRTC con Preview y Program empaquetados para probar carga de Chromium. */
  combined: boolean
  multiview: boolean
}

/** Configura dónde se renderizan los monitores grandes de la sala de control. */
export interface MixerMonitorSurfaceConfig {
  /** Renderer React actual o guest renderer aislado por cada monitor. */
  mode: 'inline' | 'external' | 'native'
  /** URL file:// del preload que debe usar el webview externo. */
  preloadUrl: string | null
  /**
   * Superficie concreta de la tira multicamara.
   *
   * Preview/Program pueden ser nativos sin obligar a que la multiview tambien
   * lo sea. La multiview nativa queda como experimento medible hasta que su
   * coste sea menor que la ruta WebRTC local.
   */
  multiviewSurface: 'webrtc' | 'native'
}

/** Estado de la rama de audio local que puede entrar en REC nativo. */
export interface MixerRecordingAudioState {
  /** Si la guarda OPENMIX_RECORDING_AUDIO ha activado captura local para REC. */
  enabled: boolean
  /** Si una grabación nativa está activa y la rama de audio existe en GStreamer. */
  active: boolean
  /** Fuente GStreamer elegida, por ejemplo osxaudiosrc o autoaudiosrc. */
  source: string
  /** Delay aplicado al audio antes de muxarlo con Program. Positivo = audio más tarde. */
  delayMs: number
}

/** Petición para aplicar el delay de claqueta al audio local de REC. */
export interface MixerRecordingAudioDelayRequest {
  delayMs: number
}

/** Target estable de las superficies nativas de monitorización. */
export type MixerNativeMonitorTarget = 'preview' | 'program' | 'multiview' | 'audio-reference'

/** Rectángulo en coordenadas CSS/DIP del viewport del Renderer. */
export interface MixerNativeMonitorRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Layout que la UI comunica al Main Process para colocar una superficie
 * nativa de vídeo. Es plano de control: solo geometría, nunca frames.
 */
export interface MixerNativeMonitorLayout {
  target: MixerNativeMonitorTarget
  visible: boolean
  rect: MixerNativeMonitorRect
}

/** Catálogo inicial de transiciones de Fase 6 */
export const MIXER_TRANSITIONS: MixerTransitionDefinition[] = [
  {
    id: 'cut',
    label: 'Cut',
    description: 'Cambio instantáneo sin animación'
  },
  {
    id: 'mix',
    label: 'Mix',
    description: 'Disolvencia lineal entre Program y Preview'
  },
  {
    id: 'dip-to-black',
    label: 'Dip To Black',
    description: 'Oscurece el Program antes de revelar la siguiente fuente'
  },
  {
    id: 'slide-left',
    label: 'Slide Left',
    description: 'La fuente entrante empuja desde la derecha hacia la izquierda'
  },
  {
    id: 'slide-right',
    label: 'Slide Right',
    description: 'La fuente entrante empuja desde la izquierda hacia la derecha'
  }
]

/** Transición recomendada por defecto para AUTO */
export const DEFAULT_MIXER_TRANSITION_ID: MixerTransitionId = 'mix'

/** Duración por defecto suficientemente visible sin sentirse lenta */
export const DEFAULT_MIXER_TRANSITION_DURATION_MS = 700

/** Límites operativos del primer MVP de transiciones */
export const MIN_MIXER_TRANSITION_DURATION_MS = 150
export const MAX_MIXER_TRANSITION_DURATION_MS = 2000

/** Estado completo del mixer para la UI */
export interface MixerState {
  /** Índice de la fuente actualmente en Program (al aire) */
  programSource: number
  /** Índice de la fuente actualmente en Preview */
  previewSource: number
  /** Lista de fuentes disponibles */
  sources: MixerSourceInfo[]
  /** Si el mixer está preparado en Main Process */
  isRunning: boolean
  /**
   * Si el plano pesado de media está realmente en PLAYING.
   *
   * OpenMix-CG mantiene el mixer preparado sin componer vídeo hasta que entra
   * una cámara o un vídeo local. Así la UI puede distinguir "mixer iniciado"
   * de "GStreamer generando frames" sin arrancar media innecesaria.
   */
  isPipelinePlaying: boolean
  /** Si hay una transición AUTO ejecutándose en el compositor nativo */
  isTransitionInProgress: boolean
}

// ── Configuración de monitorización ───────────────────────

/** Resoluciones disponibles para Preview/Program en la UI */
export type MixerMonitorResolution = '360p' | '540p' | '720p' | '1080p'

/** Configuración de calidad de monitorización del mixer */
export interface MixerMonitorSettings {
  /** Resolución de los monitores Preview y Program */
  monitorResolution: MixerMonitorResolution
}

/** Valores por defecto de monitorización */
export const DEFAULT_MIXER_MONITOR_SETTINGS: MixerMonitorSettings = {
  monitorResolution: '360p'
}

/** Resoluciones en píxeles para cada preset */
export const MIXER_MONITOR_RESOLUTION_PRESETS: Record<
  MixerMonitorResolution,
  { width: number; height: number; label: string }
> = {
  '360p': { width: 640, height: 360, label: '360p' },
  '540p': { width: 960, height: 540, label: '540p' },
  '720p': { width: 1280, height: 720, label: '720p' },
  '1080p': { width: 1920, height: 1080, label: '1080p' }
}
