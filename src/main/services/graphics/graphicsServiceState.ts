import type {
  GraphicsDiagnostics,
  GraphicsItemState,
  GraphicsOverlayTargets,
  GraphicsPlacement,
  GraphicsPreviewOutputConfig
} from '../../../shared/ipc/graphics-contracts'
import {
  createEmptyGraphicsPaintStats,
  mergeGraphicsPaintStats,
  toGraphicsPaintDiagnostics
} from './graphicsPaintStats'
import {
  BACKGROUND_GRAPHICS_FPS,
  DEFAULT_GRAPHICS_PREVIEW_FPS,
  DEFAULT_GRAPHICS_PREVIEW_HEIGHT,
  DEFAULT_GRAPHICS_PREVIEW_WIDTH,
  MAX_GRAPHICS_PREVIEW_FPS,
  MAX_GRAPHICS_PREVIEW_HEIGHT,
  MAX_GRAPHICS_PREVIEW_WIDTH,
  MIN_GRAPHICS_PREVIEW_FPS,
  MIN_GRAPHICS_PREVIEW_HEIGHT,
  MIN_GRAPHICS_PREVIEW_WIDTH
} from './graphicsServiceConfig'
import type { GraphicsItem, GraphicsItemRenderer } from './graphicsServiceTypes'
import type { LoadedGraphicsTemplate } from './graphicsTemplates'

export function createDefaultGraphicsPreviewOutputConfig(): GraphicsPreviewOutputConfig {
  return {
    enabled: false,
    width: DEFAULT_GRAPHICS_PREVIEW_WIDTH,
    height: DEFAULT_GRAPHICS_PREVIEW_HEIGHT,
    maxFps: DEFAULT_GRAPHICS_PREVIEW_FPS
  }
}

export function findGraphicsItemIndex(items: GraphicsItem[], itemId: string): number {
  return items.findIndex((item) => item.itemId === itemId)
}

export function findGraphicsItem(items: GraphicsItem[], itemId: string): GraphicsItem | undefined {
  return items.find((item) => item.itemId === itemId)
}

export function buildGraphicsDiagnostics(
  items: GraphicsItem[],
  selectedItemId: string | null
): GraphicsDiagnostics {
  const selectedItem = selectedItemId ? findGraphicsItem(items, selectedItemId) : undefined

  return {
    aggregate: toGraphicsPaintDiagnostics(
      mergeGraphicsPaintStats(items.map((item) => item.paintStats))
    ),
    selectedItem: selectedItem ? toGraphicsPaintDiagnostics(selectedItem.paintStats) : null
  }
}

export function sanitizeOverlayTargets(
  nextTargets: GraphicsOverlayTargets
): GraphicsOverlayTargets {
  return {
    preview: Boolean(nextTargets.preview),
    program: Boolean(nextTargets.program)
  }
}

export function sanitizeGraphicsPreviewOutputConfig(
  nextConfig: GraphicsPreviewOutputConfig
): GraphicsPreviewOutputConfig {
  return {
    enabled: Boolean(nextConfig.enabled),
    width: Math.max(
      MIN_GRAPHICS_PREVIEW_WIDTH,
      Math.min(
        MAX_GRAPHICS_PREVIEW_WIDTH,
        Math.round(nextConfig.width || DEFAULT_GRAPHICS_PREVIEW_WIDTH)
      )
    ),
    height: Math.max(
      MIN_GRAPHICS_PREVIEW_HEIGHT,
      Math.min(
        MAX_GRAPHICS_PREVIEW_HEIGHT,
        Math.round(nextConfig.height || DEFAULT_GRAPHICS_PREVIEW_HEIGHT)
      )
    ),
    maxFps: Math.max(
      MIN_GRAPHICS_PREVIEW_FPS,
      Math.min(
        MAX_GRAPHICS_PREVIEW_FPS,
        Math.round(nextConfig.maxFps || DEFAULT_GRAPHICS_PREVIEW_FPS)
      )
    )
  }
}

export function createGraphicsItemState(options: {
  itemId: string
  template: LoadedGraphicsTemplate
  renderer: GraphicsItemRenderer
  currentValues: Record<string, string>
  placement: GraphicsPlacement
}): GraphicsItem {
  const { itemId, template, renderer, currentValues, placement } = options

  return {
    itemId,
    template,
    renderer,
    currentValues,
    isVisible: false,
    placement,
    overlayTargets: { preview: true, program: false },
    latestRenderedFrame: null,
    scaledFrameCache: new Map(),
    previewReady: false,
    awaitingFreshVisibleFrame: false,
    requireTransparentFrameBeforeUnlock: false,
    dropNonTransparentPaintsUntil: 0,
    targetFrameRate: BACKGROUND_GRAPHICS_FPS,
    renderWidth: template.manifest.resolution.width,
    renderHeight: template.manifest.resolution.height,
    renderZoomFactor: 1,
    forceFullFramePaintsRemaining: 0,
    paintStats: createEmptyGraphicsPaintStats(),
    lastPaintTimestamp: 0,
    lastPaintReportTimestamp: Date.now(),
    paintReportCount: 0,
    paintReportSlowFrames: 0,
    paintReportMaxIntervalMs: 0
  }
}

export function serializeGraphicsItem(item: GraphicsItem): GraphicsItemState {
  return {
    itemId: item.itemId,
    templateId: item.template.manifest.id,
    templateName: item.template.manifest.name,
    category: item.template.manifest.category,
    format: item.template.manifest.format,
    version: item.template.manifest.version,
    resolution: item.template.manifest.resolution,
    fields: item.template.manifest.fields,
    currentValues: { ...item.currentValues },
    isVisible: item.isVisible,
    previewReady: item.previewReady,
    placement: { ...item.placement },
    overlayTargets: { ...item.overlayTargets }
  }
}
