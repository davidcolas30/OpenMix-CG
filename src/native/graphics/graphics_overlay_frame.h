#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

struct BgraAlphaBounds {
  int minX = 0;
  int minY = 0;
  int maxX = 0;
  int maxY = 0;
  bool valid = false;
};

struct GraphicsOverlayLatestFrame {
  std::shared_ptr<std::vector<uint8_t>> data;
  int width = 0;
  int height = 0;
  int alphaMinX = 0;
  int alphaMinY = 0;
  int alphaMaxX = 0;
  int alphaMaxY = 0;
  bool hasFrame = false;
  bool enabled = false;
  bool hasAlphaBounds = false;
};

std::shared_ptr<std::vector<uint8_t>> create_transparent_bgra_frame(
  int width,
  int height);

BgraAlphaBounds find_bgra_alpha_bounds(
  const uint8_t* pixels,
  int width,
  int height,
  size_t byteSize);

bool blend_scaled_bgra_overlay(
  uint8_t* dstPixels,
  size_t dstByteSize,
  int dstWidth,
  int dstHeight,
  const uint8_t* srcPixels,
  size_t srcByteSize,
  int srcWidth,
  int srcHeight,
  const BgraAlphaBounds& srcBounds);
