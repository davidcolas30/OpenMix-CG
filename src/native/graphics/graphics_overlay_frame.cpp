#include "graphics_overlay_frame.h"

#include <algorithm>

std::shared_ptr<std::vector<uint8_t>> create_transparent_bgra_frame(
  int width,
  int height)
{
  if (width <= 0 || height <= 0) {
    return std::make_shared<std::vector<uint8_t>>();
  }

  const size_t frameSize =
    static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  return std::make_shared<std::vector<uint8_t>>(frameSize, 0);
}

BgraAlphaBounds find_bgra_alpha_bounds(
  const uint8_t* pixels,
  int width,
  int height,
  size_t byteSize)
{
  BgraAlphaBounds bounds;
  if (!pixels || width <= 0 || height <= 0) {
    return bounds;
  }

  const size_t expectedSize =
    static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  if (byteSize < expectedSize) {
    return bounds;
  }

  int minX = width;
  int minY = height;
  int maxX = -1;
  int maxY = -1;
  for (int y = 0; y < height; y++) {
    const size_t rowOffset = static_cast<size_t>(y) * static_cast<size_t>(width) * 4;
    for (int x = 0; x < width; x++) {
      const uint8_t alpha = pixels[rowOffset + static_cast<size_t>(x) * 4 + 3];
      if (alpha == 0) {
        continue;
      }
      minX = std::min(minX, x);
      minY = std::min(minY, y);
      maxX = std::max(maxX, x);
      maxY = std::max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return bounds;
  }

  bounds.minX = minX;
  bounds.minY = minY;
  bounds.maxX = maxX;
  bounds.maxY = maxY;
  bounds.valid = true;
  return bounds;
}

bool blend_scaled_bgra_overlay(
  uint8_t* dstPixels,
  size_t dstByteSize,
  int dstWidth,
  int dstHeight,
  const uint8_t* srcPixels,
  size_t srcByteSize,
  int srcWidth,
  int srcHeight,
  const BgraAlphaBounds& srcBounds)
{
  if (!dstPixels || !srcPixels || dstWidth <= 0 || dstHeight <= 0 ||
      srcWidth <= 0 || srcHeight <= 0 || !srcBounds.valid) {
    return false;
  }

  const size_t dstExpectedSize =
    static_cast<size_t>(dstWidth) * static_cast<size_t>(dstHeight) * 4;
  const size_t srcExpectedSize =
    static_cast<size_t>(srcWidth) * static_cast<size_t>(srcHeight) * 4;
  if (dstByteSize < dstExpectedSize || srcByteSize < srcExpectedSize) {
    return false;
  }

  const int dstMinX = std::max(0, (srcBounds.minX * dstWidth) / srcWidth);
  const int dstMinY = std::max(0, (srcBounds.minY * dstHeight) / srcHeight);
  const int dstMaxX = std::min(
    dstWidth - 1,
    (((srcBounds.maxX + 1) * dstWidth) + srcWidth - 1) / srcWidth);
  const int dstMaxY = std::min(
    dstHeight - 1,
    (((srcBounds.maxY + 1) * dstHeight) + srcHeight - 1) / srcHeight);

  for (int y = dstMinY; y <= dstMaxY; y++) {
    const int srcY = std::min(srcHeight - 1, (y * srcHeight) / dstHeight);
    for (int x = dstMinX; x <= dstMaxX; x++) {
      const int srcX = std::min(srcWidth - 1, (x * srcWidth) / dstWidth);
      const size_t srcOffset =
        (static_cast<size_t>(srcY) * static_cast<size_t>(srcWidth) +
         static_cast<size_t>(srcX)) * 4;
      const uint8_t alpha = srcPixels[srcOffset + 3];
      if (alpha == 0) {
        continue;
      }

      const size_t dstOffset =
        (static_cast<size_t>(y) * static_cast<size_t>(dstWidth) +
         static_cast<size_t>(x)) * 4;
      uint8_t* dst = dstPixels + dstOffset;
      const uint8_t* src = srcPixels + srcOffset;
      const uint16_t invAlpha = static_cast<uint16_t>(255 - alpha);
      dst[0] = static_cast<uint8_t>(
        (static_cast<uint16_t>(src[0]) * alpha +
         static_cast<uint16_t>(dst[0]) * invAlpha + 127) / 255);
      dst[1] = static_cast<uint8_t>(
        (static_cast<uint16_t>(src[1]) * alpha +
         static_cast<uint16_t>(dst[1]) * invAlpha + 127) / 255);
      dst[2] = static_cast<uint8_t>(
        (static_cast<uint16_t>(src[2]) * alpha +
         static_cast<uint16_t>(dst[2]) * invAlpha + 127) / 255);
      dst[3] = 255;
    }
  }

  return true;
}
