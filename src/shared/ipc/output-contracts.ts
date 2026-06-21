/** Formatos contenedor soportados por la grabación local. */
export type RecordingContainer = 'mp4' | 'mkv'

/** Presets de x264 expuestos en la UI para equilibrar CPU y tamaño final. */
export type RecordingVideoPreset = 'veryfast' | 'fast' | 'medium'

/** Ajustes editables de la grabación local. */
export interface RecordingSettings {
  directory: string | null
  container: RecordingContainer
  videoPreset: RecordingVideoPreset
  qualityCrf: number
}

/** Valores base para arrancar Fase 5 sin sorpresas al usuario. */
export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  directory: null,
  container: 'mp4',
  videoPreset: 'veryfast',
  qualityCrf: 23
}

/** Parámetros opcionales al arrancar una grabación. */
export interface StartRecordingRequest {
  directory?: string
  container?: RecordingContainer
  videoPreset?: RecordingVideoPreset
  qualityCrf?: number
}

/** Resultado de la selección de carpeta desde el sistema. */
export interface RecordingDirectoryResult {
  directory: string | null
}

/** Estado serializable del módulo de output. */
export interface OutputRecordingState {
  status: 'idle' | 'recording' | 'stopping' | 'error'
  filePath: string | null
  directory: string | null
  container: RecordingContainer | null
  startedAt: number | null
  durationMs: number
  sizeBytes: number
  lastError: string | null
}