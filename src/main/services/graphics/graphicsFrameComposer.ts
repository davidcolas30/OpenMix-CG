import type {
  GraphicsFrameBounds,
  GraphicsPreviewFrame
} from '../../../shared/ipc/graphics-contracts'
import {
  blendOverlayLayers,
  createTransparentFrame,
  mergeAlphaBounds,
  scaleBgraFrame
} from './graphicsFrameUtils'
import type { GraphicsItem } from './graphicsServiceTypes'

function createScaledCacheKey(width: number, height: number): string {
  return `${width}x${height}`
}

function getGraphicsItemFrame(
  item: GraphicsItem,
  targetWidth: number,
  targetHeight: number
): GraphicsPreviewFrame | null {
  if (!item.latestRenderedFrame) {
    return null
  }

  const cacheKey = createScaledCacheKey(targetWidth, targetHeight)
  const cachedFrame = item.scaledFrameCache.get(cacheKey)
  if (cachedFrame) {
    return cachedFrame
  }

  if (
    item.latestRenderedFrame.width === targetWidth &&
    item.latestRenderedFrame.height === targetHeight
  ) {
    const exactFrame = {
      width: targetWidth,
      height: targetHeight,
      data: item.latestRenderedFrame.data,
      alphaBounds: item.latestRenderedFrame.alphaBounds
    }

    item.scaledFrameCache.set(cacheKey, exactFrame)
    return exactFrame
  }

  const scaledResult = scaleBgraFrame(
    item.latestRenderedFrame.data,
    item.latestRenderedFrame.width,
    item.latestRenderedFrame.height,
    targetWidth,
    targetHeight,
    item.latestRenderedFrame.alphaBounds
  )

  const scaledFrame = {
    width: targetWidth,
    height: targetHeight,
    data: scaledResult.pixels,
    alphaBounds: scaledResult.alphaBounds
  }

  item.scaledFrameCache.set(cacheKey, scaledFrame)

  return scaledFrame
}

export function composeGraphicsItemsFrame(
  items: GraphicsItem[],
  width: number,
  height: number
): GraphicsPreviewFrame | null {
  if (items.length === 0) {
    return null
  }

  if (items.length === 1) {
    return getGraphicsItemFrame(items[0], width, height)
  }

  const composedFrame = createTransparentFrame(width, height)
  let hasContribution = false
  let alphaBounds: GraphicsFrameBounds | null = null

  for (const item of items) {
    const itemFrame = getGraphicsItemFrame(item, width, height)
    if (!itemFrame) {
      continue
    }

    hasContribution =
      blendOverlayLayers(
        composedFrame.data,
        itemFrame.data,
        width,
        itemFrame.alphaBounds ?? null
      ) || hasContribution
    alphaBounds = mergeAlphaBounds(alphaBounds, itemFrame.alphaBounds ?? null)
  }

  if (!hasContribution) {
    return null
  }

  composedFrame.alphaBounds = alphaBounds
  return composedFrame
}
