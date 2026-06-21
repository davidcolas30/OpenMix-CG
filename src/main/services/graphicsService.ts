import { BrowserWindow, type NativeImage } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { nativeGStreamerAddon as addon } from './nativeAddon'
import { type GraphicsRendererRuntimeState, type NativeTickerFrame } from './nativeTickerRenderer'
import {
  buildTemplateSummary,
  discoverTemplates,
  type LoadedGraphicsTemplate,
  type ParsedNativeTickerTemplateManifest,
  type ParsedWindowTemplateManifest
} from './graphics/graphicsTemplates'
import {
  ANIMATION_FULL_FRAME_PAINTS,
  BACKGROUND_GRAPHICS_FPS,
  FULL_FRAME_DIRTY_THRESHOLD,
  GRAPHICS_PAINT_DIAGNOSTIC_INTERVAL_MS,
  GRAPHICS_PAINT_SLOW_FRAME_MS,
  GRAPHICS_SPIKE_TRACE_DIRTY_THRESHOLD,
  GRAPHICS_SPIKE_TRACE_ENABLED,
  GRAPHICS_SPIKE_TRACE_MIN_INTERVAL_MS,
  GRAPHICS_SPIKE_TRACE_SLOW_MS,
  HTML_SCENE_RENDERER_ENABLED,
  MIXER_MONITOR_GRAPHICS_FPS,
  MIXER_MONITOR_GRAPHICS_HEIGHT,
  MIXER_MONITOR_GRAPHICS_WIDTH,
  NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT,
  NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
  STALE_VISIBLE_PAINT_DROP_MS,
  VISIBLE_GRAPHICS_FPS
} from './graphics/graphicsServiceConfig'
import {
  clonePreviewFrame,
  computeAlphaBounds,
  createBlankPreviewFrame,
  createRasterFrame,
  createTransparentFrame,
  formatGraphicsFrameBounds,
  isFullFrameBounds,
  makeOpaqueBlackBackgroundTransparent,
  measureDirtyCoverage,
  unpremultiplyBgraFrame,
  type GraphicsDirtyRect
} from './graphics/graphicsFrameUtils'
import { HtmlGraphicsSceneManager } from './graphics/graphicsHtmlSceneManager'
import { createHtmlSceneGraphicsItemRenderer as createHtmlSceneGraphicsItemRendererFromFactory } from './graphics/graphicsHtmlSceneRendererFactory'
import { createHtmlGraphicsItemRenderer as createHtmlGraphicsItemRendererFromFactory } from './graphics/graphicsHtmlWindowRendererFactory'
import { NativeMixerOverlaySync } from './graphics/graphicsNativeMixerOverlaySync'
import { createNativeGraphicsItemRenderer } from './graphics/graphicsNativeRendererFactory'
import {
  composeGraphicsOverlayFrame,
  composeGraphicsStackPreviewFrame
} from './graphics/graphicsOverlaySnapshots'
import { captureGraphicsPaintFrame } from './graphics/graphicsPaintCapture'
import { formatGraphicsOverlayTargets } from './graphics/graphicsPaintStats'
import { GraphicsPlacementStore, clampPlacement } from './graphics/graphicsPlacementStore'
import {
  buildGraphicsDiagnostics,
  createDefaultGraphicsPreviewOutputConfig,
  createGraphicsItemState,
  findGraphicsItem as findGraphicsItemInState,
  findGraphicsItemIndex as findGraphicsItemIndexInState,
  sanitizeGraphicsPreviewOutputConfig,
  sanitizeOverlayTargets,
  serializeGraphicsItem
} from './graphics/graphicsServiceState'
import type {
  GraphicsItem,
  GraphicsItemRenderer,
  GraphicsOverlayTarget,
  HtmlGraphicsScenePaintTraceContext,
  HtmlGraphicsSceneState,
  HtmlGraphicsSceneTarget
} from './graphics/graphicsServiceTypes'
import type {
  GraphicsAddTemplateResult,
  GraphicsFrameBounds,
  GraphicsOverlayTargets,
  GraphicsPlacement,
  GraphicsPreviewFrame,
  GraphicsPreviewOutputConfig,
  GraphicsState,
  GraphicsTemplateSummary
} from '../../shared/ipc/graphics-contracts'

let graphicsItems: GraphicsItem[] = []
let selectedGraphicsItemId: string | null = null
let graphicsPreviewOutputConfig: GraphicsPreviewOutputConfig =
  createDefaultGraphicsPreviewOutputConfig()
let latestPreviewFrame: GraphicsPreviewFrame = createBlankPreviewFrame(
  graphicsPreviewOutputConfig.width,
  graphicsPreviewOutputConfig.height
)
let latestMixerMonitorFrame: GraphicsPreviewFrame = createBlankPreviewFrame(
  MIXER_MONITOR_GRAPHICS_WIDTH,
  MIXER_MONITOR_GRAPHICS_HEIGHT
)
let overlayCompositeCache = new Map<string, GraphicsPreviewFrame>()
let overlayCompositeRevision = 0
let graphicsItemSequence = 0
const graphicsPlacementStore = new GraphicsPlacementStore()
let pendingPreviewEmitTimer: NodeJS.Timeout | null = null
let pendingPreviewRecomputeTimer: NodeJS.Timeout | null = null
let pendingMixerMonitorEmitTimer: NodeJS.Timeout | null = null
const htmlGraphicsSceneManager = new HtmlGraphicsSceneManager({
  onPaint: handleHtmlGraphicsScenePaint
})
let lastPreviewEmitTimestamp = 0
let lastPreviewRecomputeTimestamp = 0
let lastMixerMonitorEmitTimestamp = 0
let isGraphicsOutputActive = false
let graphicsVisibilityOperationChain: Promise<void> = Promise.resolve()
const nativeMixerOverlaySync = new NativeMixerOverlaySync({
  getCompositeRevision: () => overlayCompositeRevision,
  getOverlayFrame: getGraphicsOverlayFrameSnapshot,
  hasActiveOverlay: hasAnyNativeMixerOverlayTargetActive,
  isOutputActive: () => isGraphicsOutputActive,
  isTargetActive: isNativeMixerOverlayTargetActive,
  onError: (error) => {
    console.error('Error sincronizando overlays nativos del mixer:', error)
  },
  onSynced: scheduleMixerMonitorFrameEmit,
  pushOverlayFrame: pushNativeMixerOverlayFrame,
  setOverlayEnabled: (target, enabled) => addon.setGraphicsOverlayEnabled(target, enabled)
})

function createOverlayCompositeCacheKey(
  target: 'preview' | 'program',
  width: number,
  height: number
): string {
  return `${target}:${width}x${height}`
}

function describeHtmlSceneItemsForTrace(target: HtmlGraphicsSceneTarget): string {
  const scene = htmlGraphicsSceneManager.getExistingScene(target)
  if (!scene || scene.items.size === 0) {
    return 'none'
  }

  return Array.from(scene.items.values())
    .map((sceneItem) => {
      const item = findGraphicsItem(sceneItem.itemId)
      if (!item) {
        return `${sceneItem.templateName}#${sceneItem.itemId}:orphan sceneFps=${sceneItem.frameRate}`
      }

      const routedToScene =
        target === 'stack' ||
        (target === 'preview' && item.overlayTargets.preview) ||
        (target === 'program' && item.overlayTargets.program)
      const activeInScene =
        target === 'stack'
          ? isGraphicsItemConsumedByStackPreview(item)
          : item.isVisible && routedToScene
      const targets = formatGraphicsOverlayTargets(item.overlayTargets)

      return [
        `${item.template.manifest.name}#${item.itemId}`,
        `format=${item.template.manifest.format}`,
        `category=${item.template.manifest.category}`,
        `scene=${activeInScene ? 'active' : 'idle'}`,
        `visible=${item.isVisible ? 'yes' : 'no'}`,
        `targets=${targets}`,
        `sceneFps=${sceneItem.frameRate}`,
        `itemFps=${item.targetFrameRate}`,
        `awaitFresh=${item.awaitingFreshVisibleFrame ? 'yes' : 'no'}`
      ].join(' ')
    })
    .join(' | ')
}

function resolveHtmlSceneSpikeSlowThresholdMs(target: HtmlGraphicsSceneTarget): number {
  if (target !== 'stack') {
    return GRAPHICS_SPIKE_TRACE_SLOW_MS
  }

  const stackFrameIntervalMs = Math.round(1000 / Math.max(1, MIXER_MONITOR_GRAPHICS_FPS))
  return Math.max(GRAPHICS_SPIKE_TRACE_SLOW_MS, stackFrameIntervalMs * 2)
}

function traceHtmlScenePaintSpike(
  target: HtmlGraphicsSceneTarget,
  dirtyBounds: GraphicsFrameBounds | null,
  dirtyCoverage: number,
  frameWidth: number,
  frameHeight: number,
  intervalMs: number,
  context: HtmlGraphicsScenePaintTraceContext
): void {
  if (!GRAPHICS_SPIKE_TRACE_ENABLED) {
    return
  }

  const isSlowPaint = intervalMs >= resolveHtmlSceneSpikeSlowThresholdMs(target)
  const isFullDirty = dirtyCoverage >= GRAPHICS_SPIKE_TRACE_DIRTY_THRESHOLD
  if (!isSlowPaint && !isFullDirty) {
    return
  }

  const scene = getHtmlGraphicsScene(target)
  const now = Date.now()
  if (
    GRAPHICS_SPIKE_TRACE_MIN_INTERVAL_MS > 0 &&
    now - scene.lastSpikeTraceTimestamp < GRAPHICS_SPIKE_TRACE_MIN_INTERVAL_MS
  ) {
    return
  }

  scene.lastSpikeTraceTimestamp = now
  const sceneLabel = target === 'preview' ? 'PVW' : target === 'program' ? 'PGM' : 'STACK'
  const reasons = [isSlowPaint ? `slow=${intervalMs}ms` : null, isFullDirty ? 'dirty-full' : null]
    .filter(Boolean)
    .join('+')

  // Esta traza se activa solo en pruebas. Sirve para correlacionar picos de CPU
  // con la escena HTML exacta sin meter los buffers de media por IPC.
  console.warn(
    `[GraphicsSceneSpike] ${sceneLabel} reason=${reasons} interval=${intervalMs}ms dirty=${Math.round(
      dirtyCoverage * 100
    )}% bounds=${formatGraphicsFrameBounds(dirtyBounds)} raster=${frameWidth}x${frameHeight} raw=${context.rawImageWidth}x${context.rawImageHeight} scale=${context.captureScaleFactor} normalized=${context.normalized ? 'yes' : 'no'} transparentKey=${context.transparentPixelCount} items=[${describeHtmlSceneItemsForTrace(
      target
    )}]`
  )
}

function recordGraphicsItemPaint(
  item: GraphicsItem,
  dirtyBounds: GraphicsFrameBounds | null,
  frameWidth: number,
  frameHeight: number
): void {
  const now = Date.now()
  const dirtyCoverage = measureDirtyCoverage(dirtyBounds, frameWidth, frameHeight)

  item.paintStats.totalPaintCount += 1
  item.paintStats.dirtyCoverageSum += dirtyCoverage
  item.paintStats.lastDirtyCoverage = dirtyCoverage
  item.paintStats.maxDirtyCoverage = Math.max(item.paintStats.maxDirtyCoverage, dirtyCoverage)
  item.paintStats.frameWidth = frameWidth
  item.paintStats.frameHeight = frameHeight

  if (dirtyCoverage >= FULL_FRAME_DIRTY_THRESHOLD) {
    item.paintStats.fullFramePaintCount += 1
  }

  if (item.lastPaintTimestamp > 0) {
    const intervalMs = now - item.lastPaintTimestamp
    item.paintReportMaxIntervalMs = Math.max(item.paintReportMaxIntervalMs, intervalMs)
    if (intervalMs > GRAPHICS_PAINT_SLOW_FRAME_MS) {
      item.paintReportSlowFrames += 1
    }
  }

  item.lastPaintTimestamp = now
  item.paintReportCount += 1

  if (now - item.lastPaintReportTimestamp >= GRAPHICS_PAINT_DIAGNOSTIC_INTERVAL_MS) {
    const elapsedMs = Math.max(1, now - item.lastPaintReportTimestamp)
    const fps = (item.paintReportCount * 1000) / elapsedMs
    const targets = [
      item.overlayTargets.preview ? 'PVW' : null,
      item.overlayTargets.program ? 'PGM' : null
    ]
      .filter(Boolean)
      .join('+')

    if (item.isVisible && targets) {
      console.log(
        `[GraphicsPaint] ${item.template.manifest.name} targets=${targets} paint=${fps.toFixed(
          1
        )}fps maxInterval=${item.paintReportMaxIntervalMs}ms slow>${GRAPHICS_PAINT_SLOW_FRAME_MS}ms=${item.paintReportSlowFrames} dirty=${Math.round(
          dirtyCoverage * 100
        )}% raster=${frameWidth}x${frameHeight}`
      )
    }

    item.lastPaintReportTimestamp = now
    item.paintReportCount = 0
    item.paintReportSlowFrames = 0
    item.paintReportMaxIntervalMs = 0
  }
}

function findGraphicsItemIndex(itemId: string): number {
  return findGraphicsItemIndexInState(graphicsItems, itemId)
}

function findGraphicsItem(itemId: string): GraphicsItem | undefined {
  return findGraphicsItemInState(graphicsItems, itemId)
}

function nextGraphicsItemId(): string {
  graphicsItemSequence += 1
  return `gfx-${graphicsItemSequence}`
}

function isGraphicsItemWindow(window: BrowserWindow): boolean {
  return (
    graphicsItems.some((item) => item.renderer.getWindow() === window) ||
    htmlGraphicsSceneManager.hasWindow(window)
  )
}

function emitPreviewFrameToRenderer(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || isGraphicsItemWindow(window)) {
      continue
    }

    window.webContents.send(ipcChannels.graphicsPreviewFrame, latestPreviewFrame)
  }
}

function emitMixerMonitorFrameToRenderer(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || isGraphicsItemWindow(window)) {
      continue
    }

    window.webContents.send(ipcChannels.graphicsMixerFrame, latestMixerMonitorFrame)
  }
}

function toNodeBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function pushNativeMixerOverlayFrame(
  target: 'preview' | 'program',
  frame: GraphicsPreviewFrame
): boolean {
  return addon.pushGraphicsOverlayFrame(target, toNodeBuffer(frame.data), frame.width, frame.height)
}

function syncNativeMixerOverlays(): void {
  nativeMixerOverlaySync.sync()
}

function scheduleNativeMixerOverlaySync(): void {
  nativeMixerOverlaySync.schedule()
}

function disposeNativeMixerOverlaySync(): void {
  nativeMixerOverlaySync.dispose()
}

function isHtmlSceneBackedItem(item: GraphicsItem): boolean {
  return HTML_SCENE_RENDERER_ENABLED && item.template.manifest.format === 'html'
}

function getHtmlGraphicsSceneSize(target: HtmlGraphicsSceneTarget): {
  width: number
  height: number
} {
  return htmlGraphicsSceneManager.getSceneSize(target)
}

function getHtmlGraphicsScene(target: HtmlGraphicsSceneTarget): HtmlGraphicsSceneState {
  return htmlGraphicsSceneManager.getScene(target)
}

async function executeHtmlSceneScript<T>(
  target: HtmlGraphicsSceneTarget,
  script: string
): Promise<T> {
  return htmlGraphicsSceneManager.executeScript(target, script)
}

function recordHtmlScenePaint(
  target: HtmlGraphicsSceneTarget,
  dirtyBounds: GraphicsFrameBounds | null,
  frameWidth: number,
  frameHeight: number,
  context: HtmlGraphicsScenePaintTraceContext
): void {
  const scene = getHtmlGraphicsScene(target)
  const now = Date.now()
  let intervalMs = 0

  if (scene.lastPaintTimestamp > 0) {
    intervalMs = now - scene.lastPaintTimestamp
    scene.paintReportMaxIntervalMs = Math.max(scene.paintReportMaxIntervalMs, intervalMs)
    if (intervalMs > GRAPHICS_PAINT_SLOW_FRAME_MS) {
      scene.paintReportSlowFrames += 1
    }
  }

  scene.lastPaintTimestamp = now
  scene.paintReportCount += 1
  const dirtyCoverage = measureDirtyCoverage(dirtyBounds, frameWidth, frameHeight)

  traceHtmlScenePaintSpike(
    target,
    dirtyBounds,
    dirtyCoverage,
    frameWidth,
    frameHeight,
    intervalMs,
    context
  )

  if (now - scene.lastPaintReportTimestamp >= GRAPHICS_PAINT_DIAGNOSTIC_INTERVAL_MS) {
    const elapsedMs = Math.max(1, now - scene.lastPaintReportTimestamp)
    const fps = (scene.paintReportCount * 1000) / elapsedMs
    const dirtyCoveragePercent = Math.round(dirtyCoverage * 100)
    const sceneLabel = target === 'preview' ? 'PVW' : target === 'program' ? 'PGM' : 'STACK'
    console.log(
      `[GraphicsScenePaint] ${sceneLabel} paint=${fps.toFixed(
        1
      )}fps maxInterval=${scene.paintReportMaxIntervalMs}ms slow>${GRAPHICS_PAINT_SLOW_FRAME_MS}ms=${scene.paintReportSlowFrames} dirty=${dirtyCoveragePercent}% raster=${frameWidth}x${frameHeight}`
    )
    scene.lastPaintReportTimestamp = now
    scene.paintReportCount = 0
    scene.paintReportSlowFrames = 0
    scene.paintReportMaxIntervalMs = 0
  }
}

function handleHtmlGraphicsScenePaint(
  target: HtmlGraphicsSceneTarget,
  dirty: GraphicsDirtyRect,
  image: NativeImage
): void {
  const scene = getHtmlGraphicsScene(target)
  const sceneSize = getHtmlGraphicsSceneSize(target)
  const capturedFrame = captureGraphicsPaintFrame(image, dirty, {
    captureWidth: sceneSize.width,
    captureHeight: sceneSize.height,
    targetWidth: sceneSize.width,
    targetHeight: sceneSize.height,
    usefulWidth: graphicsPreviewOutputConfig.width,
    usefulHeight: graphicsPreviewOutputConfig.height
  })
  const {
    bitmap,
    frameWidth,
    frameHeight,
    rawImageWidth,
    rawImageHeight,
    captureScaleFactor,
    dirtyBounds
  } = capturedFrame
  const transparentPixelCount = makeOpaqueBlackBackgroundTransparent(
    bitmap,
    frameWidth,
    frameHeight
  )

  recordHtmlScenePaint(target, dirtyBounds, frameWidth, frameHeight, {
    rawImageWidth,
    rawImageHeight,
    captureScaleFactor,
    normalized: capturedFrame.normalized,
    transparentPixelCount
  })

  const alphaBounds = computeAlphaBounds(bitmap, frameWidth, frameHeight)
  if (isFullFrameBounds(alphaBounds, frameWidth, frameHeight)) {
    console.warn(
      `[GraphicsScenePaint] ${target === 'preview' ? 'PVW' : target === 'program' ? 'PGM' : 'STACK'} conserva alpha full-frame tras key negro (${transparentPixelCount} px limpiados, raster=${frameWidth}x${frameHeight})`
    )
    if (target !== 'stack') {
      scene.latestFrame = createTransparentFrame(frameWidth, frameHeight)
      invalidateOverlayCompositeCache()
      scheduleNativeMixerOverlaySync()
      scheduleMixerMonitorFrameEmit()
      return
    }
  }
  scene.latestFrame = {
    width: frameWidth,
    height: frameHeight,
    data: unpremultiplyBgraFrame(bitmap, frameWidth, frameHeight, alphaBounds),
    alphaBounds
  }

  invalidateOverlayCompositeCache()
  scheduleNativeMixerOverlaySync()
  scheduleMixerMonitorFrameEmit()
}

function getHtmlGraphicsSceneFrame(
  target: HtmlGraphicsSceneTarget,
  targetWidth: number,
  targetHeight: number
): GraphicsPreviewFrame | null {
  return htmlGraphicsSceneManager.getFrame(target, targetWidth, targetHeight)
}

function getVisibleHtmlSceneItems(target: GraphicsOverlayTarget): GraphicsItem[] {
  return graphicsItems.filter(
    (item) =>
      isHtmlSceneBackedItem(item) &&
      item.isVisible &&
      item.overlayTargets[target] &&
      item.previewReady &&
      !item.awaitingFreshVisibleFrame
  )
}

function isHtmlSceneTargetActive(target: GraphicsOverlayTarget): boolean {
  return getVisibleHtmlSceneItems(target).length > 0
}

function isNativeMixerOverlayTargetActive(target: 'preview' | 'program'): boolean {
  return (
    isHtmlSceneTargetActive(target) ||
    graphicsItems.some(
      (item) =>
        !isHtmlSceneBackedItem(item) &&
        item.isVisible &&
        item.overlayTargets[target] &&
        item.previewReady &&
        !item.awaitingFreshVisibleFrame
    )
  )
}

function hasAnyNativeMixerOverlayTargetActive(): boolean {
  return (
    isGraphicsOutputActive &&
    (isNativeMixerOverlayTargetActive('preview') || isNativeMixerOverlayTargetActive('program'))
  )
}

function refreshLatestMixerMonitorFrame(): void {
  const stackPreviewFrame = getGraphicsStackPreviewFrameSnapshot(
    MIXER_MONITOR_GRAPHICS_WIDTH,
    MIXER_MONITOR_GRAPHICS_HEIGHT
  )

  latestMixerMonitorFrame =
    stackPreviewFrame ??
    createBlankPreviewFrame(MIXER_MONITOR_GRAPHICS_WIDTH, MIXER_MONITOR_GRAPHICS_HEIGHT)
}

function scheduleMixerMonitorFrameEmit(): void {
  const now = Date.now()
  const elapsedSinceLastEmit = now - lastMixerMonitorEmitTimestamp
  const emitIntervalMs = Math.round(1000 / MIXER_MONITOR_GRAPHICS_FPS)

  if (elapsedSinceLastEmit >= emitIntervalMs) {
    if (pendingMixerMonitorEmitTimer) {
      clearTimeout(pendingMixerMonitorEmitTimer)
      pendingMixerMonitorEmitTimer = null
    }

    lastMixerMonitorEmitTimestamp = now
    refreshLatestMixerMonitorFrame()
    emitMixerMonitorFrameToRenderer()
    return
  }

  if (pendingMixerMonitorEmitTimer) {
    return
  }

  pendingMixerMonitorEmitTimer = setTimeout(() => {
    pendingMixerMonitorEmitTimer = null
    lastMixerMonitorEmitTimestamp = Date.now()
    refreshLatestMixerMonitorFrame()
    emitMixerMonitorFrameToRenderer()
  }, emitIntervalMs - elapsedSinceLastEmit)
}

function handleNativeTickerFrame(itemId: string, frame: NativeTickerFrame): void {
  const item = findGraphicsItem(itemId)
  if (!item) {
    return
  }

  recordGraphicsItemPaint(item, frame.dirtyBounds ?? frame.alphaBounds, frame.width, frame.height)
  updateGraphicsItemFrame(itemId, frame.pixels, frame.width, frame.height, frame.alphaBounds)
}

function isGraphicsItemConsumedByActiveOutput(item: GraphicsItem): boolean {
  return (
    isGraphicsOutputActive &&
    item.isVisible &&
    (item.overlayTargets.preview || item.overlayTargets.program)
  )
}

function isGraphicsItemConsumedByStackPreview(item: GraphicsItem): boolean {
  return graphicsItems.includes(item) && (item.itemId === selectedGraphicsItemId || item.isVisible)
}

function getGraphicsItemOverlayTargetList(item: GraphicsItem): GraphicsOverlayTarget[] {
  return (['preview', 'program'] as const).filter((target) => item.overlayTargets[target])
}

function resolveGraphicsItemFrameRate(item: GraphicsItem): number {
  if (isGraphicsItemConsumedByActiveOutput(item)) {
    return VISIBLE_GRAPHICS_FPS
  }

  if (graphicsPreviewOutputConfig.enabled) {
    return graphicsPreviewOutputConfig.maxFps
  }

  if (isGraphicsItemConsumedByStackPreview(item)) {
    return MIXER_MONITOR_GRAPHICS_FPS
  }

  return BACKGROUND_GRAPHICS_FPS
}

function resolveGraphicsItemAnimationFps(item: GraphicsItem): number {
  if (isGraphicsItemConsumedByActiveOutput(item)) {
    return VISIBLE_GRAPHICS_FPS
  }

  if (graphicsPreviewOutputConfig.enabled) {
    return graphicsPreviewOutputConfig.maxFps
  }

  if (isGraphicsItemConsumedByStackPreview(item)) {
    return MIXER_MONITOR_GRAPHICS_FPS
  }

  return 0
}

function resolveGraphicsItemRenderSize(): { width: number; height: number } {
  const candidates = [
    {
      width: NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
      height: NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT
    }
  ]

  if (graphicsPreviewOutputConfig.enabled) {
    candidates.push({
      width: graphicsPreviewOutputConfig.width,
      height: graphicsPreviewOutputConfig.height
    })
  }

  return candidates.reduce((largest, current) =>
    current.width * current.height > largest.width * largest.height ? current : largest
  )
}

function resolveGraphicsItemRenderZoomFactor(
  item: GraphicsItem,
  renderWidth: number,
  renderHeight: number
): number {
  const nominalWidth = Math.max(1, item.template.manifest.resolution.width)
  const nominalHeight = Math.max(1, item.template.manifest.resolution.height)

  return Math.max(0.01, Math.min(renderWidth / nominalWidth, renderHeight / nominalHeight))
}

function syncGraphicsItemRenderConfig(item: GraphicsItem): void {
  if (item.renderer.isDisposed()) {
    return
  }

  const nextRenderSize = resolveGraphicsItemRenderSize()
  const nextZoomFactor = resolveGraphicsItemRenderZoomFactor(
    item,
    nextRenderSize.width,
    nextRenderSize.height
  )

  if (
    nextRenderSize.width === item.renderWidth &&
    nextRenderSize.height === item.renderHeight &&
    nextZoomFactor === item.renderZoomFactor
  ) {
    return
  }

  item.renderer.setRenderConfig(nextRenderSize.width, nextRenderSize.height, nextZoomFactor)
  item.renderWidth = nextRenderSize.width
  item.renderHeight = nextRenderSize.height
  item.renderZoomFactor = nextZoomFactor
  item.scaledFrameCache = new Map()

  console.info(
    `[GraphicsRender] ${item.template.manifest.name}: render=${nextRenderSize.width}x${nextRenderSize.height} zoom=${nextZoomFactor.toFixed(3)}`
  )

  if (item.isVisible && !isHtmlSceneBackedItem(item)) {
    // Al cambiar el raster de una plantilla visible, los paints antiguos ya no
    // tienen coordenadas fiables para el mixer. Mantenemos el overlay bloqueado
    // hasta recibir un paint nuevo de Chromium en vez de reutilizar el buffer
    // previo del modo reposo.
    markGraphicsItemAwaitingFreshFrame(item)
    invalidateOverlayCompositeCache()
    scheduleNativeMixerOverlaySync()
  } else if (item.isVisible) {
    invalidateOverlayCompositeCache()
    scheduleNativeMixerOverlaySync()
  }
}

function syncAllGraphicsItemRenderConfigs(): void {
  for (const item of graphicsItems) {
    syncGraphicsItemRenderConfig(item)
  }
}

function syncGraphicsItemFrameRate(item: GraphicsItem): void {
  if (item.renderer.isDisposed()) {
    return
  }

  const nextFrameRate = resolveGraphicsItemFrameRate(item)
  if (nextFrameRate === item.targetFrameRate) {
    return
  }

  item.renderer.setFrameRate(nextFrameRate)
  item.targetFrameRate = nextFrameRate
}

function refreshGraphicsStackSelectionRuntime(): void {
  for (const item of graphicsItems) {
    syncGraphicsItemFrameRate(item)
  }

  void syncAllTemplateRuntimeStates()
    .then(() => {
      recomputeCompositePreviewFrame()
      syncNativeMixerOverlays()
    })
    .catch((error) => {
      console.error('Error sincronizando la previsualizacion del stack de grafismo:', error)
    })
}

async function enqueueGraphicsVisibilityOperation<T>(operation: () => Promise<T>): Promise<T> {
  const previousOperation = graphicsVisibilityOperationChain
  let releaseCurrentOperation: () => void = () => {}

  graphicsVisibilityOperationChain = new Promise<void>((resolve) => {
    releaseCurrentOperation = resolve
  })

  await previousOperation.catch(() => undefined)

  try {
    return await operation()
  } finally {
    releaseCurrentOperation()
  }
}

function syncAllGraphicsItemFrameRates(): void {
  for (const item of graphicsItems) {
    syncGraphicsItemFrameRate(item)
  }
}

function schedulePreviewFrameEmit(): void {
  if (!graphicsPreviewOutputConfig.enabled) {
    return
  }

  const now = Date.now()
  const elapsedSinceLastEmit = now - lastPreviewEmitTimestamp
  const previewEmitIntervalMs = Math.round(1000 / graphicsPreviewOutputConfig.maxFps)

  if (elapsedSinceLastEmit >= previewEmitIntervalMs) {
    if (pendingPreviewEmitTimer) {
      clearTimeout(pendingPreviewEmitTimer)
      pendingPreviewEmitTimer = null
    }

    lastPreviewEmitTimestamp = now
    emitPreviewFrameToRenderer()
    return
  }

  if (pendingPreviewEmitTimer) {
    return
  }

  pendingPreviewEmitTimer = setTimeout(() => {
    pendingPreviewEmitTimer = null
    lastPreviewEmitTimestamp = Date.now()
    emitPreviewFrameToRenderer()
  }, previewEmitIntervalMs - elapsedSinceLastEmit)
}

function schedulePreviewFrameRecompute(): void {
  if (!graphicsPreviewOutputConfig.enabled) {
    return
  }

  const now = Date.now()
  const elapsedSinceLastRecompute = now - lastPreviewRecomputeTimestamp
  const previewRecomputeIntervalMs = Math.round(1000 / graphicsPreviewOutputConfig.maxFps)

  if (elapsedSinceLastRecompute >= previewRecomputeIntervalMs) {
    if (pendingPreviewRecomputeTimer) {
      clearTimeout(pendingPreviewRecomputeTimer)
      pendingPreviewRecomputeTimer = null
    }

    lastPreviewRecomputeTimestamp = now
    recomputeCompositePreviewFrame()
    return
  }

  if (pendingPreviewRecomputeTimer) {
    return
  }

  pendingPreviewRecomputeTimer = setTimeout(() => {
    pendingPreviewRecomputeTimer = null
    lastPreviewRecomputeTimestamp = Date.now()
    recomputeCompositePreviewFrame()
  }, previewRecomputeIntervalMs - elapsedSinceLastRecompute)
}

function invalidateOverlayCompositeCache(): void {
  overlayCompositeCache = new Map()
  overlayCompositeRevision += 1
}

function forceFullFramePaintsDuringAnimation(item: GraphicsItem): void {
  item.forceFullFramePaintsRemaining = Math.max(
    item.forceFullFramePaintsRemaining,
    ANIMATION_FULL_FRAME_PAINTS
  )
}

function markGraphicsItemAwaitingFreshFrame(
  item: GraphicsItem,
  options: { requireTransparentFrameBeforeUnlock?: boolean } = {}
): void {
  item.awaitingFreshVisibleFrame = true
  item.requireTransparentFrameBeforeUnlock = Boolean(options.requireTransparentFrameBeforeUnlock)
}

function unlockFreshVisibleFrameIfReady(item: GraphicsItem): boolean {
  if (!item.awaitingFreshVisibleFrame || !item.latestRenderedFrame) {
    return false
  }

  if (item.requireTransparentFrameBeforeUnlock && item.latestRenderedFrame.alphaBounds) {
    return false
  }

  item.awaitingFreshVisibleFrame = false
  item.requireTransparentFrameBeforeUnlock = false
  return true
}

function getGraphicsStackPreviewFrameSnapshot(
  width: number,
  height: number
): GraphicsPreviewFrame | null {
  return composeGraphicsStackPreviewFrame({
    items: graphicsItems,
    width,
    height,
    isHtmlSceneBackedItem,
    getHtmlGraphicsSceneFrame
  })
}

function recomputeCompositePreviewFrame(): void {
  if (!graphicsPreviewOutputConfig.enabled) {
    latestPreviewFrame = createBlankPreviewFrame(
      graphicsPreviewOutputConfig.width,
      graphicsPreviewOutputConfig.height
    )
    return
  }

  const previewFrame = getGraphicsStackPreviewFrameSnapshot(
    graphicsPreviewOutputConfig.width,
    graphicsPreviewOutputConfig.height
  )

  latestPreviewFrame =
    previewFrame ??
    createBlankPreviewFrame(graphicsPreviewOutputConfig.width, graphicsPreviewOutputConfig.height)
  schedulePreviewFrameEmit()
}

async function syncTemplateRuntimeStateToRenderer(item: GraphicsItem): Promise<void> {
  const runtimeState: GraphicsRendererRuntimeState = {
    isVisible: item.isVisible,
    previewActive: graphicsPreviewOutputConfig.enabled,
    stackPreviewActive: isGraphicsItemConsumedByStackPreview(item),
    outputActive: isGraphicsItemConsumedByActiveOutput(item),
    animationFps: resolveGraphicsItemAnimationFps(item)
  }

  await item.renderer.setRuntimeState(runtimeState)
}

async function syncAllTemplateRuntimeStates(): Promise<void> {
  await Promise.all(graphicsItems.map((item) => syncTemplateRuntimeStateToRenderer(item)))
}

async function waitForRendererAnimationFrames(
  item: GraphicsItem,
  frameCount: number
): Promise<void> {
  const window = item.renderer.getWindow()
  if (!window || window.isDestroyed() || frameCount <= 0) {
    return
  }

  const frameCountLiteral = JSON.stringify(Math.max(1, Math.min(frameCount, 4)))
  await window.webContents.executeJavaScript(
    `
      new Promise((resolve) => {
        let remaining = ${frameCountLiteral};
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve(true);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    `,
    true
  )
}

async function waitForFreshGraphicsFrameUnlock(
  item: GraphicsItem,
  timeoutMs: number
): Promise<boolean> {
  if (!item.awaitingFreshVisibleFrame) {
    return true
  }

  const startedAt = Date.now()

  return new Promise((resolve) => {
    const poll = (): void => {
      const currentItem = findGraphicsItem(item.itemId)
      if (!currentItem) {
        resolve(false)
        return
      }

      if (!currentItem.awaitingFreshVisibleFrame) {
        resolve(true)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false)
        return
      }

      setTimeout(poll, 8)
    }

    poll()
  })
}

function updateGraphicsItemFrame(
  itemId: string,
  pixels: Uint8Array,
  width: number,
  height: number,
  alphaBounds: GraphicsFrameBounds | null
): void {
  const item = findGraphicsItem(itemId)
  if (!item) {
    return
  }

  if (alphaBounds && Date.now() < item.dropNonTransparentPaintsUntil) {
    return
  }

  if (alphaBounds && item.awaitingFreshVisibleFrame && item.requireTransparentFrameBeforeUnlock) {
    return
  }

  item.latestRenderedFrame = createRasterFrame(pixels, width, height, alphaBounds)
  item.scaledFrameCache = new Map()
  item.previewReady = true
  const becameReadyForOutput = unlockFreshVisibleFrameIfReady(item)

  if (item.isVisible) {
    invalidateOverlayCompositeCache()
  }

  if (isGraphicsOutputActive) {
    scheduleNativeMixerOverlaySync()
  }

  if (graphicsPreviewOutputConfig.enabled) {
    schedulePreviewFrameRecompute()
  }

  if (becameReadyForOutput) {
    scheduleNativeMixerOverlaySync()
  }
}

function resolveGraphicsCaptureUsefulSize(): { width: number; height: number } {
  return {
    width: graphicsPreviewOutputConfig.width,
    height: graphicsPreviewOutputConfig.height
  }
}

function handleGraphicsItemWindowClosed(itemId: string): void {
  const index = findGraphicsItemIndex(itemId)
  if (index === -1) {
    return
  }

  graphicsItems.splice(index, 1)

  if (selectedGraphicsItemId === itemId) {
    selectedGraphicsItemId = graphicsItems[index]?.itemId ?? graphicsItems.at(-1)?.itemId ?? null
  }

  invalidateOverlayCompositeCache()
  recomputeCompositePreviewFrame()
}

function createGraphicsItemRenderer(
  itemId: string,
  template: LoadedGraphicsTemplate,
  initialValues: Record<string, string>
): GraphicsItemRenderer {
  if (template.manifest.format === 'native') {
    return createNativeGraphicsItemRenderer(
      itemId,
      template as LoadedGraphicsTemplate & { manifest: ParsedNativeTickerTemplateManifest },
      initialValues,
      handleNativeTickerFrame
    )
  }

  if (template.manifest.format !== 'html') {
    throw new Error('En esta iteración solo se soportan plantillas HTML y native ticker-v1')
  }

  if (HTML_SCENE_RENDERER_ENABLED) {
    return createHtmlSceneGraphicsItemRendererFromFactory(
      itemId,
      template as LoadedGraphicsTemplate & { manifest: ParsedWindowTemplateManifest },
      {
        resolveRenderSize: resolveGraphicsItemRenderSize,
        getScene: getHtmlGraphicsScene,
        getExistingScene: (target) => htmlGraphicsSceneManager.getExistingScene(target),
        executeScript: executeHtmlSceneScript,
        findItem: findGraphicsItem,
        isStackPreviewVisible: isGraphicsItemConsumedByStackPreview,
        getOverlayTargetList: getGraphicsItemOverlayTargetList
      }
    )
  }

  return createHtmlGraphicsItemRendererFromFactory(
    itemId,
    template as LoadedGraphicsTemplate & { manifest: ParsedWindowTemplateManifest },
    {
      resolveRenderSize: resolveGraphicsItemRenderSize,
      resolveUsefulCaptureSize: resolveGraphicsCaptureUsefulSize,
      findItem: findGraphicsItem,
      recordItemPaint: recordGraphicsItemPaint,
      updateItemFrame: updateGraphicsItemFrame,
      onWindowClosed: handleGraphicsItemWindowClosed
    }
  )
}

async function syncTemplateFieldsToRenderer(item: GraphicsItem): Promise<void> {
  for (const [fieldId, value] of Object.entries(item.currentValues)) {
    await item.renderer.updateField(fieldId, value)
  }
}

async function syncTemplatePlacementToRenderer(item: GraphicsItem): Promise<void> {
  await item.renderer.setPlacement(item.placement)
}

function updateLatestPreviewFrameForCurrentOutput(): void {
  latestPreviewFrame = createBlankPreviewFrame(
    graphicsPreviewOutputConfig.width,
    graphicsPreviewOutputConfig.height
  )
}

function requireGraphicsItem(itemId: string): GraphicsItem {
  const item = findGraphicsItem(itemId)

  if (!item) {
    throw new Error(`No existe el grafismo ${itemId}`)
  }

  return item
}

function removeGraphicsItemFromStack(itemId: string, closeWindow: boolean): void {
  const index = findGraphicsItemIndex(itemId)
  if (index === -1) {
    return
  }

  const previousSelectedItemId = selectedGraphicsItemId
  const [item] = graphicsItems.splice(index, 1)

  if (selectedGraphicsItemId === itemId) {
    selectedGraphicsItemId = graphicsItems[index]?.itemId ?? graphicsItems.at(-1)?.itemId ?? null
  }

  invalidateOverlayCompositeCache()
  recomputeCompositePreviewFrame()
  syncNativeMixerOverlays()

  if (closeWindow) {
    item.renderer.dispose()
  }

  if (previousSelectedItemId !== selectedGraphicsItemId) {
    refreshGraphicsStackSelectionRuntime()
  }
}

export function listGraphicsTemplates(): GraphicsTemplateSummary[] {
  return discoverTemplates().map(({ manifest, directoryPath }) =>
    buildTemplateSummary(manifest, directoryPath)
  )
}

export async function addGraphicsTemplate(templateId: string): Promise<GraphicsAddTemplateResult> {
  const template = discoverTemplates().find((entry) => entry.manifest.id === templateId)

  if (!template) {
    throw new Error(`No existe la plantilla de grafismo ${templateId}`)
  }

  const itemId = nextGraphicsItemId()
  const currentValues = Object.fromEntries(
    template.manifest.fields.map((field) => [field.id, field.defaultValue])
  )
  const initialPlacement = graphicsPlacementStore.getPlacement(
    template.manifest.id,
    template.manifest.resolution
  )
  const item = createGraphicsItemState({
    itemId,
    template,
    renderer: createGraphicsItemRenderer(itemId, template, currentValues),
    currentValues,
    placement: initialPlacement
  })

  graphicsItems.push(item)
  selectedGraphicsItemId = itemId

  try {
    await item.renderer.load()
    syncGraphicsItemRenderConfig(item)
    syncGraphicsItemFrameRate(item)
    await syncTemplateFieldsToRenderer(item)
    await syncTemplatePlacementToRenderer(item)
    await syncTemplateRuntimeStateToRenderer(item)
    refreshGraphicsStackSelectionRuntime()
    await item.renderer.preparePreview()
    if (isHtmlSceneBackedItem(item)) {
      item.previewReady = true
      item.awaitingFreshVisibleFrame = false
      item.requireTransparentFrameBeforeUnlock = false
    }
    await waitForRendererAnimationFrames(item, 2)
    syncNativeMixerOverlays()
  } catch (error) {
    removeGraphicsItemFromStack(itemId, true)
    throw error
  }

  return {
    item: serializeGraphicsItem(item),
    state: getGraphicsState()
  }
}

export function selectGraphicsItem(itemId: string): GraphicsState {
  requireGraphicsItem(itemId)
  selectedGraphicsItemId = itemId
  refreshGraphicsStackSelectionRuntime()
  return getGraphicsState()
}

export async function removeGraphicsItem(itemId: string): Promise<GraphicsState> {
  requireGraphicsItem(itemId)
  removeGraphicsItemFromStack(itemId, true)
  return getGraphicsState()
}

export async function updateGraphicsField(
  itemId: string,
  fieldId: string,
  value: string
): Promise<GraphicsState> {
  const item = requireGraphicsItem(itemId)
  const fieldDefinition = item.template.manifest.fields.find((field) => field.id === fieldId)

  if (!fieldDefinition) {
    throw new Error(`La plantilla ${item.template.manifest.id} no define el campo ${fieldId}`)
  }

  item.currentValues[fieldId] = value
  await item.renderer.updateField(fieldId, value)

  return getGraphicsState()
}

export async function setGraphicsPlacement(
  itemId: string,
  nextPlacement: GraphicsPlacement
): Promise<GraphicsState> {
  const item = requireGraphicsItem(itemId)
  item.placement = clampPlacement(nextPlacement, item.template.manifest.resolution)
  graphicsPlacementStore.persistPlacement(item.template.manifest.id, item.placement)
  await syncTemplatePlacementToRenderer(item)
  return getGraphicsState()
}

export function setGraphicsOverlayTargets(
  itemId: string,
  nextTargets: GraphicsOverlayTargets
): GraphicsState {
  const item = requireGraphicsItem(itemId)
  item.overlayTargets = sanitizeOverlayTargets(nextTargets)
  syncGraphicsItemRenderConfig(item)
  invalidateOverlayCompositeCache()
  if (isHtmlSceneBackedItem(item)) {
    void syncTemplateRuntimeStateToRenderer(item)
      .then(() => {
        syncNativeMixerOverlays()
      })
      .catch((error) => {
        console.error('Error sincronizando targets de escena HTML:', error)
      })
  } else {
    syncNativeMixerOverlays()
  }
  return getGraphicsState()
}

export async function showGraphicsItem(itemId: string): Promise<GraphicsState> {
  return enqueueGraphicsVisibilityOperation(async () => {
    const item = requireGraphicsItem(itemId)
    const wasVisible = item.isVisible

    if (!wasVisible) {
      if (isHtmlSceneBackedItem(item)) {
        item.isVisible = true
        item.latestRenderedFrame = null
        item.previewReady = true
        item.awaitingFreshVisibleFrame = false
        item.requireTransparentFrameBeforeUnlock = false
        item.scaledFrameCache = new Map()
        item.dropNonTransparentPaintsUntil = 0
        invalidateOverlayCompositeCache()
        syncGraphicsItemRenderConfig(item)
        syncGraphicsItemFrameRate(item)
        // En la escena agregada preparamos la plantilla antes de hacer visible
        // el slot. Esto evita que Chromium pinte durante un frame el estado
        // final anterior justo al arrancar la animacion de entrada.
        await item.renderer.prepareIn()
        await syncTemplateRuntimeStateToRenderer(item)
        scheduleNativeMixerOverlaySync()
        invalidateOverlayCompositeCache()
        syncNativeMixerOverlays()
      } else {
        item.isVisible = true
        item.latestRenderedFrame = null
        item.previewReady = false
        item.scaledFrameCache = new Map()
        item.dropNonTransparentPaintsUntil = 0
        forceFullFramePaintsDuringAnimation(item)
        invalidateOverlayCompositeCache()
        syncGraphicsItemRenderConfig(item)
        syncGraphicsItemFrameRate(item)
        await syncTemplateRuntimeStateToRenderer(item)
        markGraphicsItemAwaitingFreshFrame(item, { requireTransparentFrameBeforeUnlock: true })
        await item.renderer.prepareIn()
        scheduleNativeMixerOverlaySync()
        // Primero dejamos que Chromium pinte el estado pre-enter y lo empujamos al
        // mixer. Asi el appsrc/compositor ya estan armados con un frame transparente
        // antes de arrancar la animacion real; si no, el primer frame visible puede
        // llegar cuando la animacion ya va avanzada.
        await waitForRendererAnimationFrames(item, 2)
        const receivedTransparentFrame = await waitForFreshGraphicsFrameUnlock(item, 180)
        if (!receivedTransparentFrame && item.awaitingFreshVisibleFrame) {
          updateGraphicsItemFrame(
            item.itemId,
            new Uint8Array(item.renderWidth * item.renderHeight * 4),
            item.renderWidth,
            item.renderHeight,
            null
          )
        }

        item.dropNonTransparentPaintsUntil = Date.now() + STALE_VISIBLE_PAINT_DROP_MS
        invalidateOverlayCompositeCache()
        syncNativeMixerOverlays()
      }
    }

    try {
      await item.renderer.animateIn()
    } catch (error) {
      if (!wasVisible) {
        item.isVisible = false
        invalidateOverlayCompositeCache()
      }

      throw error
    }

    return getGraphicsState()
  })
}

export async function hideGraphicsItem(itemId: string): Promise<GraphicsState> {
  return enqueueGraphicsVisibilityOperation(async () => {
    const item = requireGraphicsItem(itemId)
    if (!isHtmlSceneBackedItem(item)) {
      forceFullFramePaintsDuringAnimation(item)
    }
    await item.renderer.animateOut()
    item.isVisible = false
    item.awaitingFreshVisibleFrame = false
    item.requireTransparentFrameBeforeUnlock = false
    item.dropNonTransparentPaintsUntil = 0
    invalidateOverlayCompositeCache()
    await syncTemplateRuntimeStateToRenderer(item)
    if (!isHtmlSceneBackedItem(item)) {
      await item.renderer.preparePreview()
      await waitForRendererAnimationFrames(item, 2)
    }
    syncGraphicsItemRenderConfig(item)
    syncGraphicsItemFrameRate(item)
    syncNativeMixerOverlays()
    return getGraphicsState()
  })
}

export function getGraphicsState(): GraphicsState {
  return {
    selectedItemId: selectedGraphicsItemId,
    items: graphicsItems.map(serializeGraphicsItem),
    previewReady: graphicsItems.some((item) => item.previewReady),
    visibleItemCount: graphicsItems.filter((item) => item.isVisible).length,
    diagnostics: buildGraphicsDiagnostics(graphicsItems, selectedGraphicsItemId)
  }
}

export function getGraphicsPreviewFrame(): GraphicsPreviewFrame {
  return clonePreviewFrame(latestPreviewFrame)
}

export function getGraphicsMixerFrame(): GraphicsPreviewFrame {
  return clonePreviewFrame(latestMixerMonitorFrame)
}

export async function setGraphicsPreviewOutput(
  nextConfig: GraphicsPreviewOutputConfig
): Promise<void> {
  const sanitizedConfig = sanitizeGraphicsPreviewOutputConfig(nextConfig)
  const previousEnabled = graphicsPreviewOutputConfig.enabled
  const hasChanged =
    sanitizedConfig.enabled !== graphicsPreviewOutputConfig.enabled ||
    sanitizedConfig.width !== graphicsPreviewOutputConfig.width ||
    sanitizedConfig.height !== graphicsPreviewOutputConfig.height ||
    sanitizedConfig.maxFps !== graphicsPreviewOutputConfig.maxFps

  if (!hasChanged) {
    return
  }

  graphicsPreviewOutputConfig = sanitizedConfig
  lastPreviewEmitTimestamp = 0

  if (pendingPreviewEmitTimer) {
    clearTimeout(pendingPreviewEmitTimer)
    pendingPreviewEmitTimer = null
  }

  if (pendingPreviewRecomputeTimer) {
    clearTimeout(pendingPreviewRecomputeTimer)
    pendingPreviewRecomputeTimer = null
  }

  lastPreviewRecomputeTimestamp = 0

  await syncAllTemplateRuntimeStates()
  syncAllGraphicsItemRenderConfigs()
  syncAllGraphicsItemFrameRates()

  if (!graphicsPreviewOutputConfig.enabled) {
    updateLatestPreviewFrameForCurrentOutput()

    if (previousEnabled) {
      emitPreviewFrameToRenderer()
    }

    return
  }

  recomputeCompositePreviewFrame()
}

export function setGraphicsOutputActive(nextValue: boolean): void {
  if (isGraphicsOutputActive === nextValue) {
    return
  }

  isGraphicsOutputActive = nextValue
  syncAllGraphicsItemRenderConfigs()
  syncAllGraphicsItemFrameRates()
  syncNativeMixerOverlays()
  void syncAllTemplateRuntimeStates().catch((error) => {
    console.error('Error sincronizando el estado runtime de grafismo:', error)
  })
}

export function getGraphicsPreviewFrameSnapshot(): GraphicsPreviewFrame {
  return latestPreviewFrame
}

export function getGraphicsOverlayFrameSnapshot(
  target: 'preview' | 'program',
  targetWidth: number,
  targetHeight: number
): GraphicsPreviewFrame | null {
  const cacheKey = createOverlayCompositeCacheKey(target, targetWidth, targetHeight)
  const cachedFrame = overlayCompositeCache.get(cacheKey)
  if (cachedFrame) {
    return cachedFrame
  }

  const frame = composeGraphicsOverlayFrame({
    items: graphicsItems,
    target,
    targetWidth,
    targetHeight,
    isHtmlSceneBackedItem,
    isHtmlSceneTargetActive,
    getHtmlGraphicsSceneFrame
  })

  if (frame) {
    overlayCompositeCache.set(cacheKey, frame)
  }

  return frame
}

export function isGraphicsOverlayEnabled(target: 'preview' | 'program'): boolean {
  return graphicsItems.some(
    (item) => item.isVisible && item.overlayTargets[target] && !item.awaitingFreshVisibleFrame
  )
}

export function disposeGraphicsService(): void {
  const renderers = graphicsItems.map((item) => item.renderer)

  graphicsItems = []
  selectedGraphicsItemId = null
  graphicsPreviewOutputConfig = createDefaultGraphicsPreviewOutputConfig()
  latestPreviewFrame = createBlankPreviewFrame(
    graphicsPreviewOutputConfig.width,
    graphicsPreviewOutputConfig.height
  )
  latestMixerMonitorFrame = createBlankPreviewFrame(
    MIXER_MONITOR_GRAPHICS_WIDTH,
    MIXER_MONITOR_GRAPHICS_HEIGHT
  )
  overlayCompositeCache = new Map()
  lastPreviewEmitTimestamp = 0
  lastPreviewRecomputeTimestamp = 0
  lastMixerMonitorEmitTimestamp = 0
  isGraphicsOutputActive = false
  syncNativeMixerOverlays()

  if (pendingPreviewEmitTimer) {
    clearTimeout(pendingPreviewEmitTimer)
    pendingPreviewEmitTimer = null
  }

  if (pendingPreviewRecomputeTimer) {
    clearTimeout(pendingPreviewRecomputeTimer)
    pendingPreviewRecomputeTimer = null
  }

  if (pendingMixerMonitorEmitTimer) {
    clearTimeout(pendingMixerMonitorEmitTimer)
    pendingMixerMonitorEmitTimer = null
  }

  disposeNativeMixerOverlaySync()

  for (const renderer of renderers) {
    renderer.dispose()
  }

  htmlGraphicsSceneManager.closeAll()
}
