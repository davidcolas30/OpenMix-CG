function readIntegerEnv(
  name: string,
  defaultValue: number,
  minValue: number,
  maxValue: number
): number {
  const rawValue = process.env[name]
  if (!rawValue) {
    return defaultValue
  }

  const parsedValue = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsedValue)) {
    console.warn(`[Graphics] ${name}=${rawValue} no es valido; usando ${defaultValue}`)
    return defaultValue
  }

  return Math.max(minValue, Math.min(maxValue, parsedValue))
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const rawValue = process.env[name]?.trim().toLowerCase()
  if (!rawValue) {
    return defaultValue
  }

  if (['1', 'true', 'on', 'yes', 'enabled'].includes(rawValue)) {
    return true
  }

  if (['0', 'false', 'off', 'no', 'disabled', 'legacy'].includes(rawValue)) {
    return false
  }

  console.warn(`[Graphics] ${name}=${rawValue} no es valido; usando ${defaultValue}`)
  return defaultValue
}

export const DEFAULT_GRAPHICS_PREVIEW_WIDTH = 640
export const DEFAULT_GRAPHICS_PREVIEW_HEIGHT = 360
export const DEFAULT_GRAPHICS_PREVIEW_FPS = 30
export const MIN_GRAPHICS_PREVIEW_WIDTH = 160
export const MIN_GRAPHICS_PREVIEW_HEIGHT = 90
export const MAX_GRAPHICS_PREVIEW_WIDTH = 1280
export const MAX_GRAPHICS_PREVIEW_HEIGHT = 720
export const MIN_GRAPHICS_PREVIEW_FPS = 1
export const MAX_GRAPHICS_PREVIEW_FPS = 30
export const BACKGROUND_GRAPHICS_FPS = 1
export const VISIBLE_GRAPHICS_FPS = 30
export const MIXER_MONITOR_GRAPHICS_FPS = readIntegerEnv('OPENMIX_GFX_SLOT_FPS', 5, 1, 15)
export const MIXER_MONITOR_GRAPHICS_WIDTH = 640
export const MIXER_MONITOR_GRAPHICS_HEIGHT = 360
export const GRAPHICS_PAINT_DIAGNOSTIC_INTERVAL_MS = 2000
export const GRAPHICS_PAINT_SLOW_FRAME_MS = 45
export const FULL_FRAME_DIRTY_THRESHOLD = 0.98
export const GRAPHICS_SPIKE_TRACE_ENABLED = readBooleanEnv('OPENMIX_GRAPHICS_SPIKE_TRACE', false)
export const GRAPHICS_SPIKE_TRACE_SLOW_MS = readIntegerEnv(
  'OPENMIX_GRAPHICS_SPIKE_TRACE_SLOW_MS',
  120,
  GRAPHICS_PAINT_SLOW_FRAME_MS,
  10_000
)
export const GRAPHICS_SPIKE_TRACE_DIRTY_THRESHOLD =
  readIntegerEnv('OPENMIX_GRAPHICS_SPIKE_TRACE_DIRTY_PERCENT', 95, 1, 100) / 100
export const GRAPHICS_SPIKE_TRACE_MIN_INTERVAL_MS = readIntegerEnv(
  'OPENMIX_GRAPHICS_SPIKE_TRACE_MIN_INTERVAL_MS',
  500,
  0,
  30_000
)
export const ANIMATION_FULL_FRAME_PAINTS = 24
export const STALE_VISIBLE_PAINT_DROP_MS = 48
export const GRAPHICS_PLACEMENTS_FILE_NAME = 'graphics-placements.json'
export const NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH = readIntegerEnv(
  'OPENMIX_GRAPHICS_OVERLAY_WIDTH',
  1280,
  320,
  1920
)
export const NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT = readIntegerEnv(
  'OPENMIX_GRAPHICS_OVERLAY_HEIGHT',
  720,
  180,
  1080
)
export const NATIVE_MIXER_OVERLAY_HEARTBEAT_FPS = readIntegerEnv(
  'OPENMIX_GRAPHICS_OVERLAY_HEARTBEAT_FPS',
  0,
  0,
  30
)

// La escena HTML agregada reduce ventanas offscreen, pero en Electron puede
// aplanar cada iframe como una superficie opaca. El modo estable por defecto
// renderiza cada plantilla HTML como una capa independiente y compone por alpha.
export const HTML_SCENE_RENDERER_ENABLED = readBooleanEnv('OPENMIX_GRAPHICS_SCENE_RENDERER', false)
