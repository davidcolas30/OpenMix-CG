export interface AudioInputSummary {
  deviceId: string
  label: string
}

export interface MeterSnapshot {
  rmsDb: number
  peakDb: number
  levelPercent: number
  peakPercent: number
}

export interface CalibrationState {
  audioPeakAt: number | null
  visualMarkAt: number | null
  suggestedDelayMs: number | null
  peakDb: number | null
}

export interface WaveformHistoryPoint {
  time: number
  min: number
  max: number
  peakDb: number
}

export interface AudioReferenceFrameSample {
  time: number
  imageUrl: string
  width: number
  height: number
}

export interface AudioReferenceNativeFrame {
  width: number
  height: number
  format?: 'BGRA' | 'RGBA' | string
  data: Uint8Array
}

export interface AudioReferenceSource {
  index: number
  name: string
}

export interface RecordingAudioState {
  enabled: boolean
  active: boolean
  source: string
  delayMs: number
}

export interface IpcResult<T> {
  ok?: boolean
  data?: T
  error?: {
    message?: string
  }
}

export interface AudioPanelProps {
  referenceEnabled?: boolean
  referenceStartSignal?: number
  isMixerRunning?: boolean
  referenceSources?: AudioReferenceSource[]
  selectedReferenceSource?: number
  onSelectReferenceSource?: (sourceIndex: number) => void
}

export type AudioByteBuffer = Uint8Array<ArrayBuffer>
