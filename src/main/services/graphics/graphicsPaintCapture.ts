import type { NativeImage } from 'electron'
import type { GraphicsFrameBounds } from '../../../shared/ipc/graphics-contracts'
import {
  projectAlphaBoundsToTarget,
  scaleDirtyRectToFrame,
  type GraphicsDirtyRect
} from './graphicsFrameUtils'

export interface GraphicsPaintCaptureOptions {
  captureWidth: number
  captureHeight: number
  targetWidth: number
  targetHeight: number
  usefulWidth: number
  usefulHeight: number
}

export interface GraphicsPaintCapture {
  bitmap: Buffer
  frameWidth: number
  frameHeight: number
  rawImageWidth: number
  rawImageHeight: number
  captureScaleFactor: number
  normalized: boolean
  dirtyBounds: GraphicsFrameBounds | null
}

function resolveCaptureScaleFactor(
  availableScaleFactors: number[],
  nominalWidth: number,
  nominalHeight: number,
  usefulWidth: number,
  usefulHeight: number
): number {
  const normalizedFactors = availableScaleFactors
    .filter((factor) => Number.isFinite(factor) && factor > 0)
    .sort((left, right) => left - right)

  if (normalizedFactors.length === 0) {
    return 1
  }

  // No conviene capturar a 2x si el raster nominal de la plantilla ya supera
  // la preview mas grande que consume el renderer. Ese sobrecoste dispara CPU
  // durante animaciones aunque el operador no gane nitidez real en 1280x720.
  const minimumUsefulFactor = Math.max(
    1,
    usefulWidth / Math.max(1, nominalWidth),
    usefulHeight / Math.max(1, nominalHeight)
  )

  if (minimumUsefulFactor <= 1) {
    return 1
  }

  const preferredFactor = normalizedFactors.find((factor) => factor >= minimumUsefulFactor)

  return preferredFactor ?? normalizedFactors[normalizedFactors.length - 1]
}

export function captureGraphicsPaintFrame(
  image: NativeImage,
  dirty: GraphicsDirtyRect,
  options: GraphicsPaintCaptureOptions
): GraphicsPaintCapture {
  const captureScaleFactor = resolveCaptureScaleFactor(
    image.getScaleFactors(),
    options.captureWidth,
    options.captureHeight,
    options.usefulWidth,
    options.usefulHeight
  )
  const { width: rawImageWidth, height: rawImageHeight } = image.getSize(captureScaleFactor)
  const shouldNormalizeRaster =
    rawImageWidth !== options.targetWidth || rawImageHeight !== options.targetHeight
  const normalizedImage = shouldNormalizeRaster
    ? image.resize({
        width: options.targetWidth,
        height: options.targetHeight,
        quality: 'good'
      })
    : image
  const bitmap = shouldNormalizeRaster
    ? normalizedImage.toBitmap()
    : image.toBitmap({ scaleFactor: captureScaleFactor })
  const rawDirtyBounds = scaleDirtyRectToFrame(
    dirty,
    captureScaleFactor,
    rawImageWidth,
    rawImageHeight
  )
  const dirtyBounds = shouldNormalizeRaster
    ? projectAlphaBoundsToTarget(
        rawDirtyBounds,
        rawImageWidth,
        rawImageHeight,
        options.targetWidth,
        options.targetHeight
      )
    : rawDirtyBounds

  return {
    bitmap,
    frameWidth: options.targetWidth,
    frameHeight: options.targetHeight,
    rawImageWidth,
    rawImageHeight,
    captureScaleFactor,
    normalized: shouldNormalizeRaster,
    dirtyBounds
  }
}
