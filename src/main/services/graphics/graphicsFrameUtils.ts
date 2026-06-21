import type {
  GraphicsFrameBounds,
  GraphicsPreviewFrame
} from '../../../shared/ipc/graphics-contracts'

export interface GraphicsRasterFrame {
  width: number
  height: number
  data: Uint8Array
  alphaBounds: GraphicsFrameBounds | null
}

export interface GraphicsDirtyRect {
  x: number
  y: number
  width: number
  height: number
}

export function createBlankPreviewFrame(width: number, height: number): GraphicsPreviewFrame {
  return {
    width,
    height,
    data: new Uint8Array(width * height * 4),
    alphaBounds: null
  }
}

export function createTransparentFrame(width: number, height: number): GraphicsPreviewFrame {
  return {
    width,
    height,
    data: new Uint8Array(width * height * 4),
    alphaBounds: null
  }
}

export function clonePreviewFrame(frame: GraphicsPreviewFrame): GraphicsPreviewFrame {
  return {
    width: frame.width,
    height: frame.height,
    data: new Uint8Array(frame.data),
    alphaBounds: frame.alphaBounds ? { ...frame.alphaBounds } : null
  }
}

export function createRasterFrame(
  pixels: Uint8Array,
  width: number,
  height: number,
  alphaBounds: GraphicsFrameBounds | null
): GraphicsRasterFrame {
  return {
    width,
    height,
    data: pixels,
    alphaBounds
  }
}

export function sanitizeFrameBounds(
  bounds: GraphicsFrameBounds | null,
  frameWidth: number,
  frameHeight: number
): GraphicsFrameBounds | null {
  if (!bounds) {
    return null
  }

  const startX = Math.max(0, Math.min(frameWidth, Math.floor(bounds.x)))
  const startY = Math.max(0, Math.min(frameHeight, Math.floor(bounds.y)))
  const endX = Math.max(startX, Math.min(frameWidth, Math.ceil(bounds.x + bounds.width)))
  const endY = Math.max(startY, Math.min(frameHeight, Math.ceil(bounds.y + bounds.height)))

  if (startX >= endX || startY >= endY) {
    return null
  }

  return {
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY
  }
}

export function measureDirtyCoverage(
  dirtyBounds: GraphicsFrameBounds | null,
  frameWidth: number,
  frameHeight: number
): number {
  const frameArea = Math.max(1, frameWidth * frameHeight)
  if (!dirtyBounds) {
    return 1
  }

  const dirtyArea = Math.max(0, dirtyBounds.width) * Math.max(0, dirtyBounds.height)
  return Math.max(0, Math.min(1, dirtyArea / frameArea))
}

export function formatGraphicsFrameBounds(bounds: GraphicsFrameBounds | null): string {
  if (!bounds) {
    return 'full'
  }

  return `${Math.round(bounds.x)},${Math.round(bounds.y)} ${Math.round(bounds.width)}x${Math.round(
    bounds.height
  )}`
}

export function scaleDirtyRectToFrame(
  dirtyRect: GraphicsDirtyRect,
  scaleFactor: number,
  frameWidth: number,
  frameHeight: number
): GraphicsFrameBounds | null {
  return sanitizeFrameBounds(
    {
      x: dirtyRect.x * scaleFactor,
      y: dirtyRect.y * scaleFactor,
      width: dirtyRect.width * scaleFactor,
      height: dirtyRect.height * scaleFactor
    },
    frameWidth,
    frameHeight
  )
}

export function isFullFrameBounds(
  bounds: GraphicsFrameBounds | null,
  frameWidth: number,
  frameHeight: number
): boolean {
  return Boolean(
    bounds &&
      bounds.x === 0 &&
      bounds.y === 0 &&
      bounds.width === frameWidth &&
      bounds.height === frameHeight
  )
}

export function computeAlphaBoundsInRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  region: GraphicsFrameBounds | null
): GraphicsFrameBounds | null {
  const normalizedRegion = sanitizeFrameBounds(region, width, height)
  if (!normalizedRegion) {
    return null
  }

  let minX = normalizedRegion.x + normalizedRegion.width
  let minY = normalizedRegion.y + normalizedRegion.height
  let maxX = -1
  let maxY = -1
  const endX = normalizedRegion.x + normalizedRegion.width
  const endY = normalizedRegion.y + normalizedRegion.height

  for (let y = normalizedRegion.y; y < endY; y += 1) {
    let rowHasAlpha = false

    for (let x = normalizedRegion.x; x < endX; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3]
      if (alpha === 0) {
        continue
      }

      rowHasAlpha = true
      if (x < minX) {
        minX = x
      }

      if (x > maxX) {
        maxX = x
      }
    }

    if (rowHasAlpha) {
      if (y < minY) {
        minY = y
      }

      maxY = y
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

export function computeAlphaBounds(
  pixels: Uint8Array,
  width: number,
  height: number
): GraphicsFrameBounds | null {
  return computeAlphaBoundsInRegion(pixels, width, height, { x: 0, y: 0, width, height })
}

function sampleSceneCornerBackground(
  pixels: Uint8Array,
  width: number,
  height: number
): { blue: number; green: number; red: number } | null {
  const cornerCoordinates = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)]
  ] as const
  const opaqueCorners = cornerCoordinates
    .map(([x, y]) => {
      const index = (y * width + x) * 4
      return {
        blue: pixels[index],
        green: pixels[index + 1],
        red: pixels[index + 2],
        alpha: pixels[index + 3]
      }
    })
    .filter((corner) => corner.alpha >= 16)

  if (opaqueCorners.length < 3) {
    return null
  }

  const average = opaqueCorners.reduce(
    (accumulator, corner) => ({
      blue: accumulator.blue + corner.blue / opaqueCorners.length,
      green: accumulator.green + corner.green / opaqueCorners.length,
      red: accumulator.red + corner.red / opaqueCorners.length
    }),
    { blue: 0, green: 0, red: 0 }
  )
  const cornersAreUniform = opaqueCorners.every(
    (corner) =>
      Math.abs(corner.blue - average.blue) <= 10 &&
      Math.abs(corner.green - average.green) <= 10 &&
      Math.abs(corner.red - average.red) <= 10
  )

  if (!cornersAreUniform) {
    return null
  }

  return average
}

export function makeOpaqueBlackBackgroundTransparent(
  pixels: Uint8Array,
  width: number,
  height: number
): number {
  let transparentPixelCount = 0
  const cornerBackground = sampleSceneCornerBackground(pixels, width, height)

  for (let index = 0; index < pixels.length; index += 4) {
    // Electron entrega los bitmaps offscreen en BGRA. En la escena agregada
    // los iframes pueden aplanar el fondo transparente como negro opaco; esta
    // llave elimina el negro casi puro de fondo y conserva grafismos oscuros reales.
    const isAlmostBlack =
      pixels[index] <= 8 &&
      pixels[index + 1] <= 8 &&
      pixels[index + 2] <= 8 &&
      pixels[index + 3] >= 16
    const matchesCornerBackground =
      cornerBackground !== null &&
      pixels[index + 3] >= 16 &&
      Math.abs(pixels[index] - cornerBackground.blue) <= 10 &&
      Math.abs(pixels[index + 1] - cornerBackground.green) <= 10 &&
      Math.abs(pixels[index + 2] - cornerBackground.red) <= 10

    if (isAlmostBlack || matchesCornerBackground) {
      pixels[index] = 0
      pixels[index + 1] = 0
      pixels[index + 2] = 0
      pixels[index + 3] = 0
      transparentPixelCount += 1
    }
  }

  return transparentPixelCount
}

export function mergeAlphaBounds(
  currentBounds: GraphicsFrameBounds | null,
  nextBounds: GraphicsFrameBounds | null
): GraphicsFrameBounds | null {
  if (!currentBounds) {
    return nextBounds ? { ...nextBounds } : null
  }

  if (!nextBounds) {
    return currentBounds
  }

  const minX = Math.min(currentBounds.x, nextBounds.x)
  const minY = Math.min(currentBounds.y, nextBounds.y)
  const maxX = Math.max(
    currentBounds.x + currentBounds.width - 1,
    nextBounds.x + nextBounds.width - 1
  )
  const maxY = Math.max(
    currentBounds.y + currentBounds.height - 1,
    nextBounds.y + nextBounds.height - 1
  )

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

export function projectAlphaBoundsToTarget(
  sourceAlphaBounds: GraphicsFrameBounds | null,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): GraphicsFrameBounds | null {
  if (!sourceAlphaBounds) {
    return null
  }

  const startX = Math.max(
    0,
    Math.floor((sourceAlphaBounds.x * targetWidth) / Math.max(sourceWidth, 1))
  )
  const startY = Math.max(
    0,
    Math.floor((sourceAlphaBounds.y * targetHeight) / Math.max(sourceHeight, 1))
  )
  const endX = Math.min(
    targetWidth,
    Math.ceil(
      ((sourceAlphaBounds.x + sourceAlphaBounds.width) * targetWidth) / Math.max(sourceWidth, 1)
    )
  )
  const endY = Math.min(
    targetHeight,
    Math.ceil(
      ((sourceAlphaBounds.y + sourceAlphaBounds.height) * targetHeight) / Math.max(sourceHeight, 1)
    )
  )

  if (startX >= endX || startY >= endY) {
    return null
  }

  return {
    x: startX,
    y: startY,
    width: endX - startX,
    height: endY - startY
  }
}

export function scaleBgraFrame(
  sourcePixels: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  sourceAlphaBounds: GraphicsFrameBounds | null = null
): { pixels: Uint8Array; alphaBounds: GraphicsFrameBounds | null } {
  const targetAlphaBounds = projectAlphaBoundsToTarget(
    sourceAlphaBounds,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight
  )

  if (sourceWidth === targetWidth * 3 && sourceHeight === targetHeight * 3) {
    const scaledPixels = new Uint8Array(targetWidth * targetHeight * 4)
    const sourceStride = sourceWidth * 4
    const startY = targetAlphaBounds?.y ?? 0
    const endY = targetAlphaBounds ? targetAlphaBounds.y + targetAlphaBounds.height : targetHeight
    const startX = targetAlphaBounds?.x ?? 0
    const endX = targetAlphaBounds ? targetAlphaBounds.x + targetAlphaBounds.width : targetWidth

    for (let targetY = startY; targetY < endY; targetY += 1) {
      const sourceRow0 = targetY * 3 * sourceStride
      const sourceRow1 = sourceRow0 + sourceStride
      const sourceRow2 = sourceRow1 + sourceStride
      let targetOffset = (targetY * targetWidth + startX) * 4

      for (let targetX = startX; targetX < endX; targetX += 1) {
        const sourceColumn = targetX * 12
        const sourceOffset0 = sourceRow0 + sourceColumn
        const sourceOffset1 = sourceRow1 + sourceColumn
        const sourceOffset2 = sourceRow2 + sourceColumn

        for (let channel = 0; channel < 4; channel += 1) {
          const sum =
            sourcePixels[sourceOffset0 + channel] +
            sourcePixels[sourceOffset0 + 4 + channel] +
            sourcePixels[sourceOffset0 + 8 + channel] +
            sourcePixels[sourceOffset1 + channel] +
            sourcePixels[sourceOffset1 + 4 + channel] +
            sourcePixels[sourceOffset1 + 8 + channel] +
            sourcePixels[sourceOffset2 + channel] +
            sourcePixels[sourceOffset2 + 4 + channel] +
            sourcePixels[sourceOffset2 + 8 + channel]

          scaledPixels[targetOffset + channel] = Math.round(sum / 9)
        }

        targetOffset += 4
      }
    }

    return { pixels: scaledPixels, alphaBounds: targetAlphaBounds }
  }

  const scaledPixels = new Uint8Array(targetWidth * targetHeight * 4)
  const startY = targetAlphaBounds?.y ?? 0
  const endY = targetAlphaBounds ? targetAlphaBounds.y + targetAlphaBounds.height : targetHeight
  const startX = targetAlphaBounds?.x ?? 0
  const endX = targetAlphaBounds ? targetAlphaBounds.x + targetAlphaBounds.width : targetWidth

  for (let targetY = startY; targetY < endY; targetY += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor(((targetY + 0.5) * sourceHeight) / targetHeight)
    )

    for (let targetX = startX; targetX < endX; targetX += 1) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor(((targetX + 0.5) * sourceWidth) / targetWidth)
      )

      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
      const targetOffset = (targetY * targetWidth + targetX) * 4

      scaledPixels[targetOffset] = sourcePixels[sourceOffset]
      scaledPixels[targetOffset + 1] = sourcePixels[sourceOffset + 1]
      scaledPixels[targetOffset + 2] = sourcePixels[sourceOffset + 2]
      scaledPixels[targetOffset + 3] = sourcePixels[sourceOffset + 3]
    }
  }

  return { pixels: scaledPixels, alphaBounds: targetAlphaBounds }
}

export function unpremultiplyBgraFrame(
  pixels: Uint8Array,
  width: number,
  height: number,
  alphaBounds: GraphicsFrameBounds | null
): Uint8Array {
  return unpremultiplyBgraFrameRegion(pixels, width, height, alphaBounds)
}

export function unpremultiplyBgraFrameRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  region: GraphicsFrameBounds | null
): Uint8Array {
  const normalizedRegion = sanitizeFrameBounds(region, width, height)
  if (!normalizedRegion) {
    return pixels
  }

  const startX = normalizedRegion.x
  const startY = normalizedRegion.y
  const endX = normalizedRegion.x + normalizedRegion.width
  const endY = normalizedRegion.y + normalizedRegion.height

  for (let y = startY; y < endY; y += 1) {
    let index = (y * width + startX) * 4
    const rowEnd = (y * width + endX) * 4

    for (; index < rowEnd; index += 4) {
      const alpha = pixels[index + 3]

      if (alpha === 0 || alpha === 255) {
        continue
      }

      pixels[index] = Math.min(255, Math.round((pixels[index] * 255) / alpha))
      pixels[index + 1] = Math.min(255, Math.round((pixels[index + 1] * 255) / alpha))
      pixels[index + 2] = Math.min(255, Math.round((pixels[index + 2] * 255) / alpha))
    }
  }

  return pixels
}

export function patchRasterFrameRegion(
  targetPixels: Uint8Array,
  frameWidth: number,
  sourcePixels: Uint8Array,
  dirtyBounds: GraphicsFrameBounds
): void {
  const rowWidthInBytes = dirtyBounds.width * 4

  for (let y = dirtyBounds.y; y < dirtyBounds.y + dirtyBounds.height; y += 1) {
    const rowOffset = (y * frameWidth + dirtyBounds.x) * 4
    targetPixels.set(sourcePixels.subarray(rowOffset, rowOffset + rowWidthInBytes), rowOffset)
  }
}

export function blendOverlayLayers(
  basePixels: Uint8Array,
  overlayPixels: Uint8Array,
  frameWidth: number,
  alphaBounds: GraphicsFrameBounds | null = null
): boolean {
  let hasContribution = false

  const frameHeight = Math.floor(basePixels.length / 4 / Math.max(frameWidth, 1))
  const startX = alphaBounds ? Math.max(0, alphaBounds.x) : 0
  const startY = alphaBounds ? Math.max(0, alphaBounds.y) : 0
  const endX = alphaBounds ? Math.min(frameWidth, alphaBounds.x + alphaBounds.width) : frameWidth
  const endY = alphaBounds ? Math.min(frameHeight, alphaBounds.y + alphaBounds.height) : frameHeight

  if (startX >= endX || startY >= endY) {
    return false
  }

  for (let y = startY; y < endY; y += 1) {
    let index = (y * frameWidth + startX) * 4
    const rowEnd = (y * frameWidth + endX) * 4

    for (; index < rowEnd; index += 4) {
      const overlayAlpha = overlayPixels[index + 3] / 255
      if (overlayAlpha === 0) {
        continue
      }

      hasContribution = true

      const baseAlpha = basePixels[index + 3] / 255
      const outAlpha = overlayAlpha + baseAlpha * (1 - overlayAlpha)

      if (outAlpha === 0) {
        continue
      }

      basePixels[index] = Math.round(
        (overlayPixels[index] * overlayAlpha + basePixels[index] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha
      )
      basePixels[index + 1] = Math.round(
        (overlayPixels[index + 1] * overlayAlpha +
          basePixels[index + 1] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha
      )
      basePixels[index + 2] = Math.round(
        (overlayPixels[index + 2] * overlayAlpha +
          basePixels[index + 2] * baseAlpha * (1 - overlayAlpha)) /
          outAlpha
      )
      basePixels[index + 3] = Math.round(outAlpha * 255)
    }
  }

  return hasContribution
}
