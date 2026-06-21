import type { CalibrationState, MeterSnapshot } from './AudioPanel.types'

export const SILENCE_DB = -72
export const DEFAULT_PEAK_THRESHOLD_DB = -16
export const DEFAULT_WAVEFORM_WINDOW_MS = 8000
export const DEFAULT_VISUAL_BUFFER_MS = 4000
export const DEFAULT_VISUAL_POST_ROLL_MS = 800
export const MIN_DELAY_MS = -200
export const MAX_DELAY_MS = 500
export const WAVEFORM_WINDOW_OPTIONS_MS = [4000, 8000, 12000, 20000] as const
export const VISUAL_BUFFER_OPTIONS_MS = [2000, 4000, 6000] as const
export const VISUAL_POST_ROLL_OPTIONS_MS = [400, 800, 1200, 1600] as const

export const idleMeterSnapshot: MeterSnapshot = {
  rmsDb: SILENCE_DB,
  peakDb: SILENCE_DB,
  levelPercent: 0,
  peakPercent: 0
}

export const emptyCalibrationState: CalibrationState = {
  audioPeakAt: null,
  visualMarkAt: null,
  suggestedDelayMs: null,
  peakDb: null
}
