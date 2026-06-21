import type { BrowserWindow } from 'electron'
import type {
  GraphicsOverlayTargets,
  GraphicsPlacement,
  GraphicsPreviewFrame
} from '../../../shared/ipc/graphics-contracts'
import type { GraphicsRasterFrame } from './graphicsFrameUtils'
import type { LoadedGraphicsTemplate } from './graphicsTemplates'
import type { GraphicsRendererRuntimeState } from '../nativeTickerRenderer'

export interface GraphicsItemRenderer {
  load(): Promise<void>
  getWindow(): BrowserWindow | null
  isDisposed(): boolean
  dispose(): void
  updateField(fieldId: string, value: string): Promise<void>
  setPlacement(placement: GraphicsPlacement): Promise<void>
  setRuntimeState(runtimeState: GraphicsRendererRuntimeState): Promise<void>
  prepareIn(): Promise<void>
  preparePreview(): Promise<void>
  animateIn(): Promise<void>
  animateOut(): Promise<void>
  setRenderConfig(width: number, height: number, zoomFactor: number): void
  setFrameRate(frameRate: number): void
}

export interface GraphicsPaintStats {
  totalPaintCount: number
  fullFramePaintCount: number
  dirtyCoverageSum: number
  maxDirtyCoverage: number
  lastDirtyCoverage: number
  frameWidth: number
  frameHeight: number
}

export interface GraphicsItem {
  itemId: string
  template: LoadedGraphicsTemplate
  renderer: GraphicsItemRenderer
  currentValues: Record<string, string>
  isVisible: boolean
  placement: GraphicsPlacement
  overlayTargets: GraphicsOverlayTargets
  latestRenderedFrame: GraphicsRasterFrame | null
  scaledFrameCache: Map<string, GraphicsPreviewFrame>
  previewReady: boolean
  awaitingFreshVisibleFrame: boolean
  requireTransparentFrameBeforeUnlock: boolean
  dropNonTransparentPaintsUntil: number
  targetFrameRate: number
  renderWidth: number
  renderHeight: number
  renderZoomFactor: number
  forceFullFramePaintsRemaining: number
  paintStats: GraphicsPaintStats
  lastPaintTimestamp: number
  lastPaintReportTimestamp: number
  paintReportCount: number
  paintReportSlowFrames: number
  paintReportMaxIntervalMs: number
}

export type GraphicsOverlayTarget = 'preview' | 'program'
export type HtmlGraphicsSceneTarget = GraphicsOverlayTarget | 'stack'

export interface HtmlGraphicsSceneItem {
  itemId: string
  templateName: string
  entryUrl: string
  nominalWidth: number
  nominalHeight: number
  frameRate: number
}

export interface HtmlGraphicsSceneState {
  target: HtmlGraphicsSceneTarget
  window: BrowserWindow
  items: Map<string, HtmlGraphicsSceneItem>
  latestFrame: GraphicsPreviewFrame | null
  lastPaintTimestamp: number
  lastPaintReportTimestamp: number
  lastSpikeTraceTimestamp: number
  paintReportCount: number
  paintReportSlowFrames: number
  paintReportMaxIntervalMs: number
}

export interface HtmlGraphicsScenePaintTraceContext {
  rawImageWidth: number
  rawImageHeight: number
  captureScaleFactor: number
  normalized: boolean
  transparentPixelCount: number
}

export type PersistedGraphicsPlacements = Record<string, GraphicsPlacement>
