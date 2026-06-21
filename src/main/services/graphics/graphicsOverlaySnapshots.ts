import type { GraphicsPreviewFrame } from '../../../shared/ipc/graphics-contracts'
import { composeGraphicsItemsFrame } from './graphicsFrameComposer'
import { blendOverlayLayers, clonePreviewFrame, mergeAlphaBounds } from './graphicsFrameUtils'
import type {
  GraphicsItem,
  GraphicsOverlayTarget,
  HtmlGraphicsSceneTarget
} from './graphicsServiceTypes'

type HtmlSceneFrameProvider = (
  target: HtmlGraphicsSceneTarget,
  targetWidth: number,
  targetHeight: number
) => GraphicsPreviewFrame | null

export function composeGraphicsStackPreviewFrame(options: {
  items: GraphicsItem[]
  width: number
  height: number
  isHtmlSceneBackedItem: (item: GraphicsItem) => boolean
  getHtmlGraphicsSceneFrame: HtmlSceneFrameProvider
}): GraphicsPreviewFrame | null {
  const { items, width, height, isHtmlSceneBackedItem, getHtmlGraphicsSceneFrame } = options
  const readyItems = items.filter(
    (item) => !isHtmlSceneBackedItem(item) && item.previewReady && !item.awaitingFreshVisibleFrame
  )

  const htmlPreviewFrame = getHtmlGraphicsSceneFrame('stack', width, height)
  const rasterPreviewFrame = composeGraphicsItemsFrame(readyItems, width, height)

  return composeHtmlAndRasterFrames({
    htmlFrame: htmlPreviewFrame,
    rasterFrame: rasterPreviewFrame,
    width
  })
}

export function composeGraphicsOverlayFrame(options: {
  items: GraphicsItem[]
  target: GraphicsOverlayTarget
  targetWidth: number
  targetHeight: number
  isHtmlSceneBackedItem: (item: GraphicsItem) => boolean
  isHtmlSceneTargetActive: (target: GraphicsOverlayTarget) => boolean
  getHtmlGraphicsSceneFrame: HtmlSceneFrameProvider
}): GraphicsPreviewFrame | null {
  const {
    items,
    target,
    targetWidth,
    targetHeight,
    isHtmlSceneBackedItem,
    isHtmlSceneTargetActive,
    getHtmlGraphicsSceneFrame
  } = options
  const visibleItems = items.filter(
    (item) =>
      !isHtmlSceneBackedItem(item) &&
      item.isVisible &&
      item.overlayTargets[target] &&
      item.previewReady &&
      !item.awaitingFreshVisibleFrame
  )
  const htmlSceneFrame = isHtmlSceneTargetActive(target)
    ? getHtmlGraphicsSceneFrame(target, targetWidth, targetHeight)
    : null
  const rasterFrame = composeGraphicsItemsFrame(visibleItems, targetWidth, targetHeight)

  return composeHtmlAndRasterFrames({
    htmlFrame: htmlSceneFrame,
    rasterFrame,
    width: targetWidth
  })
}

function composeHtmlAndRasterFrames(options: {
  htmlFrame: GraphicsPreviewFrame | null
  rasterFrame: GraphicsPreviewFrame | null
  width: number
}): GraphicsPreviewFrame | null {
  const { htmlFrame, rasterFrame, width } = options

  if (!htmlFrame) {
    return rasterFrame
  }

  if (!rasterFrame) {
    return htmlFrame
  }

  const composedFrame = clonePreviewFrame(htmlFrame)
  blendOverlayLayers(composedFrame.data, rasterFrame.data, width, rasterFrame.alphaBounds)
  composedFrame.alphaBounds = mergeAlphaBounds(
    htmlFrame.alphaBounds ?? null,
    rasterFrame.alphaBounds ?? null
  )
  return composedFrame
}
