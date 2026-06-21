import { SILENCE_DB } from './AudioPanel.constants'

export function amplitudeToDb(amplitude: number): number {
  if (amplitude <= 0.00025) {
    return SILENCE_DB
  }

  return Math.max(SILENCE_DB, 20 * Math.log10(amplitude))
}

export function dbToPercent(db: number): number {
  return clampNumber(((db - SILENCE_DB) / Math.abs(SILENCE_DB)) * 100, 0, 100)
}

export function formatDb(db: number): string {
  return `${Math.round(db)} dB`
}

export function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}

export function formatRelativeTime(value: number | null, origin: number | null): string {
  if (value === null || origin === null) {
    return '--'
  }

  const deltaMs = Math.round(value - origin)
  return deltaMs === 0 ? '0 ms' : `${deltaMs > 0 ? '+' : ''}${deltaMs} ms`
}

export function formatVisualFrameTime(frameTime: number, audioPeakAt: number | null): string {
  if (audioPeakAt === null) {
    return 'frame'
  }

  const deltaMs = Math.round(frameTime - audioPeakAt)
  return deltaMs === 0 ? '0 ms' : `${deltaMs > 0 ? '+' : ''}${deltaMs} ms`
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(min, Math.min(max, Math.round(value)))
}
