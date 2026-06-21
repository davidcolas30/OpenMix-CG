import type {
  GraphicsPreviewOutputConfig,
  GraphicsState
} from '../../../shared/ipc/graphics-contracts'
import {
  MIXER_TRANSITIONS,
  type MixerMonitorSurfaceConfig,
  type MixerMonitorTargets
} from '../../../shared/ipc/mixer-contracts'
import type { OutputRecordingState } from '../../../shared/ipc/output-contracts'
import type { PanelSize } from './MixerLayout.types'

export const DEFAULT_MONITOR_SIZE: PanelSize = { width: 540, height: 304 }
export const DEFAULT_MULTIVIEW_HEIGHT = 196
export const MIN_MULTIVIEW_HEIGHT = 148
export const MULTIVIEW_RESIZER_HEIGHT = 14
export const MULTIVIEW_PANEL_HORIZONTAL_PADDING = 24
export const MULTIVIEW_PANEL_VERTICAL_CHROME = 56
export const MULTIVIEW_ITEM_GAP = 10
export const MULTIVIEW_NATIVE_OUTPUT_WIDTH = 1280
export const MULTIVIEW_NATIVE_OUTPUT_HEIGHT = 180
export const MULTIVIEW_NATIVE_GUTTER = 8
export const MULTIVIEW_NATIVE_ASPECT_RATIO = 1280 / 180
export const MULTIVIEW_NATIVE_COLUMNS = 4
export const SIDEBAR_RESIZER_WIDTH = 14
export const DEFAULT_SIDEBAR_WIDTH = 320
export const MIN_SIDEBAR_WIDTH = 220
export const MIN_MONITOR_WORKSPACE_WIDTH = 760
export const DEFAULT_GRAPHICS_SIDEBAR_HEIGHT = 210
export const DEFAULT_LOCAL_VIDEO_SIDEBAR_HEIGHT = 218
export const MIN_GRAPHICS_SIDEBAR_HEIGHT = 132
export const MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT = 164
export const MIN_QR_SIDEBAR_HEIGHT = 286
export const SIDEBAR_SECTION_RESIZER_HEIGHT = 10
export const SIDEBAR_SECTION_GAP = 8
// La vista de grafismo sigue mostrandose a 560x315 CSS, pero el raster interno
// de preview puede ser menor para bajar CPU cuando solo estamos monitorizando
// overlays continuos como el ticker y el mixer ni siquiera esta arrancado.
export const GRAPHICS_WORKSPACE_PREVIEW_OUTPUT: GraphicsPreviewOutputConfig = {
  enabled: true,
  width: 448,
  height: 252,
  maxFps: 30
}

export const AUTO_MIXER_TRANSITIONS = MIXER_TRANSITIONS.filter(
  (transition) => transition.id !== 'cut'
)

export const defaultGraphicsState: GraphicsState = {
  selectedItemId: null,
  items: [],
  previewReady: false,
  visibleItemCount: 0,
  diagnostics: {
    aggregate: {
      totalPaintCount: 0,
      fullFramePaintCount: 0,
      averageDirtyCoveragePercent: 0,
      maxDirtyCoveragePercent: 0,
      lastDirtyCoveragePercent: 0,
      fullFramePaintRatePercent: 0,
      frameWidth: 0,
      frameHeight: 0
    },
    selectedItem: null
  }
}

export const defaultRecordingState: OutputRecordingState = {
  status: 'idle',
  filePath: null,
  directory: null,
  container: null,
  startedAt: null,
  durationMs: 0,
  sizeBytes: 0,
  lastError: null
}

export const defaultMonitorTargets: MixerMonitorTargets = {
  preview: true,
  program: true,
  combined: false,
  multiview: true
}

export const defaultMonitorSurfaceConfig: MixerMonitorSurfaceConfig = {
  mode: 'inline',
  preloadUrl: null,
  multiviewSurface: 'webrtc'
}
