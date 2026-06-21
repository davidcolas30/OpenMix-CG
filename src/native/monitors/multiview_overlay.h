#pragma once

#include <gst/gst.h>
#include <cairo.h>

#include <atomic>

struct MultiviewOverlayState {
  int sourceCount;
  int columns;
  int gutter;
  int slotWidth;
  int slotHeight;
  const char* const* sourceNames;
  const std::atomic<int>* programSource;
  const std::atomic<int>* previewSource;
  const bool* hudEnabled;
  const bool* staticBarsEnabled;
  const bool* barsCacheEnabled;
  cairo_surface_t* staticBarsSurface;
  int staticBarsSurfaceWidth;
  int staticBarsSurfaceHeight;
};

void release_multiview_static_bars_cache(MultiviewOverlayState& state);

void draw_multiview_overlay(
  GstElement* overlay,
  cairo_t* cr,
  guint64 timestamp,
  guint64 duration,
  gpointer userData);
