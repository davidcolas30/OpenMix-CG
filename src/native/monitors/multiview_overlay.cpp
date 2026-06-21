#include "multiview_overlay.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

static void draw_multiview_label(
  cairo_t* cr,
  int x,
  int y,
  int width,
  int height,
  const char* text,
  bool isProgram,
  bool isPreview)
{
  const double red = isProgram ? 0.94 : isPreview ? 0.13 : 0.58;
  const double green = isProgram ? 0.27 : isPreview ? 0.77 : 0.66;
  const double blue = isProgram ? 0.27 : isPreview ? 0.37 : 0.78;
  const double alpha = (isProgram || isPreview) ? 0.96 : 0.58;

  cairo_save(cr);
  cairo_set_line_width(cr, isProgram || isPreview ? 4.0 : 2.5);
  cairo_set_source_rgba(cr, red, green, blue, alpha);
  cairo_rectangle(cr, x + 1.5, y + 1.5, width - 3.0, height - 3.0);
  cairo_stroke(cr);

  cairo_select_font_face(cr, "Menlo", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_BOLD);
  cairo_set_font_size(cr, 17.0);
  cairo_text_extents_t extents;
  cairo_text_extents(cr, text, &extents);
  const double paddingX = 8.0;
  const double paddingY = 5.0;
  const double boxWidth = std::min<double>(width - 12.0, extents.width + paddingX * 2.0);
  const double boxHeight = extents.height + paddingY * 2.0;
  const double boxX = x + 8.0;
  const double boxY = y + height - boxHeight - 8.0;

  cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.66);
  cairo_rectangle(cr, boxX, boxY, boxWidth, boxHeight);
  cairo_fill(cr);

  cairo_set_source_rgba(cr, red, green, blue, 0.95);
  cairo_rectangle(cr, boxX, boxY, 4.0, boxHeight);
  cairo_fill(cr);

  cairo_set_source_rgba(cr, 0.96, 0.98, 1.0, 0.96);
  cairo_move_to(cr, boxX + paddingX + 3.0, boxY + paddingY + extents.height);
  cairo_show_text(cr, text);
  cairo_restore(cr);
}

static void paint_multiview_static_bars_pattern(
  cairo_t* cr,
  int x,
  int y,
  int width,
  int height)
{
  /*
   * Estas barras son deliberadamente un dibujo de overlay, no un videotestsrc.
   * El slot sigue siendo reconocible como fuente SMPTE, pero no se mantiene una
   * rama live escalando y convirtiendo 1080p solo para rellenar la multiview.
   */
  const double topHeight = std::round(height * 0.68);
  const double bottomY = y + topHeight;
  const double bottomHeight = height - topHeight;
  const double topColors[][3] = {
    { 0.78, 0.78, 0.78 },
    { 0.78, 0.78, 0.08 },
    { 0.08, 0.78, 0.78 },
    { 0.08, 0.78, 0.08 },
    { 0.78, 0.08, 0.78 },
    { 0.78, 0.08, 0.08 },
    { 0.08, 0.08, 0.78 }
  };
  const double bottomColors[][3] = {
    { 0.08, 0.08, 0.78 },
    { 0.02, 0.02, 0.02 },
    { 0.78, 0.08, 0.78 },
    { 0.02, 0.02, 0.02 },
    { 0.08, 0.78, 0.78 },
    { 0.02, 0.02, 0.02 },
    { 0.78, 0.78, 0.78 }
  };
  const int barCount = 7;
  const double barWidth = static_cast<double>(width) / barCount;

  cairo_save(cr);
  cairo_rectangle(cr, x, y, width, height);
  cairo_clip(cr);

  for (int i = 0; i < barCount; i++) {
    cairo_set_source_rgb(cr, topColors[i][0], topColors[i][1], topColors[i][2]);
    cairo_rectangle(cr, x + i * barWidth, y, std::ceil(barWidth), topHeight);
    cairo_fill(cr);
  }

  for (int i = 0; i < barCount; i++) {
    cairo_set_source_rgb(cr, bottomColors[i][0], bottomColors[i][1], bottomColors[i][2]);
    cairo_rectangle(cr, x + i * barWidth, bottomY, std::ceil(barWidth), bottomHeight);
    cairo_fill(cr);
  }

  cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.22);
  cairo_rectangle(cr, x, y, width, height);
  cairo_stroke(cr);
  cairo_restore(cr);
}

void release_multiview_static_bars_cache(MultiviewOverlayState& state)
{
  if (state.staticBarsSurface) {
    cairo_surface_destroy(state.staticBarsSurface);
    state.staticBarsSurface = nullptr;
  }

  state.staticBarsSurfaceWidth = 0;
  state.staticBarsSurfaceHeight = 0;
}

static cairo_surface_t* create_multiview_static_bars_surface(int width, int height)
{
  cairo_surface_t* surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, width, height);
  if (!surface || cairo_surface_status(surface) != CAIRO_STATUS_SUCCESS) {
    if (surface) {
      cairo_surface_destroy(surface);
    }
    return nullptr;
  }

  cairo_t* surfaceCr = cairo_create(surface);
  if (!surfaceCr || cairo_status(surfaceCr) != CAIRO_STATUS_SUCCESS) {
    if (surfaceCr) {
      cairo_destroy(surfaceCr);
    }
    cairo_surface_destroy(surface);
    return nullptr;
  }

  paint_multiview_static_bars_pattern(surfaceCr, 0, 0, width, height);
  cairo_destroy(surfaceCr);
  cairo_surface_flush(surface);
  return surface;
}

static void draw_multiview_static_bars(
  cairo_t* cr,
  MultiviewOverlayState& state,
  int x,
  int y,
  int width,
  int height)
{
  if (!state.barsCacheEnabled || !*state.barsCacheEnabled) {
    paint_multiview_static_bars_pattern(cr, x, y, width, height);
    return;
  }

  if (!state.staticBarsSurface ||
      state.staticBarsSurfaceWidth != width ||
      state.staticBarsSurfaceHeight != height) {
    release_multiview_static_bars_cache(state);
    state.staticBarsSurface = create_multiview_static_bars_surface(width, height);
    state.staticBarsSurfaceWidth = state.staticBarsSurface ? width : 0;
    state.staticBarsSurfaceHeight = state.staticBarsSurface ? height : 0;
  }

  if (!state.staticBarsSurface) {
    paint_multiview_static_bars_pattern(cr, x, y, width, height);
    return;
  }

  cairo_save(cr);
  cairo_rectangle(cr, x, y, width, height);
  cairo_clip(cr);
  cairo_set_source_surface(cr, state.staticBarsSurface, x, y);
  cairo_paint(cr);
  cairo_restore(cr);
}

/**
 * HUD dibujado dentro de la multiview nativa.
 *
 * Las superficies nativas viven en ventanas hijas de Electron y quedan por
 * encima del DOM; por eso los bordes/labels React no son una capa fiable para
 * esta vista. Dibujarlos aqui mantiene la identificacion de slots sin volver a
 * enviar la multiview por WebRTC ni por IPC de frames.
 */
void draw_multiview_overlay(
  GstElement* /*overlay*/,
  cairo_t* cr,
  guint64 /*timestamp*/,
  guint64 /*duration*/,
  gpointer userData)
{
  auto* state = static_cast<MultiviewOverlayState*>(userData);
  if (!state) {
    return;
  }

  if (state->staticBarsEnabled && *state->staticBarsEnabled) {
    draw_multiview_static_bars(
      cr,
      *state,
      state->gutter,
      state->gutter,
      state->slotWidth,
      state->slotHeight);
  }

  if (!state->hudEnabled || !*state->hudEnabled) {
    return;
  }

  const int programSource = state->programSource
    ? state->programSource->load(std::memory_order_relaxed)
    : 0;
  const int previewSource = state->previewSource
    ? state->previewSource->load(std::memory_order_relaxed)
    : 0;

  for (int i = 0; i < state->sourceCount; i++) {
    const int column = i % state->columns;
    const int row = i / state->columns;
    const int x = state->gutter + column * (state->slotWidth + state->gutter);
    const int y = state->gutter + row * (state->slotHeight + state->gutter);
    const bool isProgram = i == programSource;
    const bool isPreview = i == previewSource;

    const char* sourceName = state->sourceNames && state->sourceNames[i]
      ? state->sourceNames[i]
      : "Fuente";

    char label[96];
    if (isProgram && isPreview) {
      std::snprintf(label, sizeof(label), "%s  PGM/PVW", sourceName);
    } else if (isProgram) {
      std::snprintf(label, sizeof(label), "%s  PGM", sourceName);
    } else if (isPreview) {
      std::snprintf(label, sizeof(label), "%s  PVW", sourceName);
    } else {
      std::snprintf(label, sizeof(label), "%s", sourceName);
    }

    draw_multiview_label(
      cr,
      x,
      y,
      state->slotWidth,
      state->slotHeight,
      label,
      isProgram,
      isPreview);
  }
}
