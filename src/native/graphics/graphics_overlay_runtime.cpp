#include "graphics_overlay_runtime.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>

#include <gst/app/gstappsrc.h>

bool parse_graphics_overlay_target_name(
  const std::string& targetName,
  GraphicsOverlayTarget& outTarget)
{
  if (targetName == "program") {
    outTarget = GRAPHICS_TARGET_PROGRAM;
    return true;
  }

  if (targetName == "preview") {
    outTarget = GRAPHICS_TARGET_PREVIEW;
    return true;
  }

  return false;
}

GstElement* graphics_overlay_appsrc_for_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target)
{
  return target == GRAPHICS_TARGET_PROGRAM
    ? context.programAppsrc
    : context.previewAppsrc;
}

static GstPad* graphics_overlay_pad_for_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target)
{
  return target == GRAPHICS_TARGET_PROGRAM
    ? context.programPad
    : context.previewPad;
}

GraphicsOverlayLatestFrame& graphics_overlay_latest_frame_for_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target)
{
  return target == GRAPHICS_TARGET_PROGRAM
    ? *context.programFrame
    : *context.previewFrame;
}

static std::shared_ptr<std::vector<uint8_t>> create_transparent_graphics_overlay_frame(
  const GraphicsOverlayRuntimeContext& context)
{
  return create_transparent_bgra_frame(context.overlayWidth, context.overlayHeight);
}

void update_graphics_overlay_alpha_bounds(GraphicsOverlayLatestFrame& frame)
{
  frame.hasAlphaBounds = false;
  frame.alphaMinX = 0;
  frame.alphaMinY = 0;
  frame.alphaMaxX = 0;
  frame.alphaMaxY = 0;

  if (!frame.data || frame.data->empty() || frame.width <= 0 || frame.height <= 0) {
    return;
  }

  const BgraAlphaBounds bounds = find_bgra_alpha_bounds(
    frame.data->data(),
    frame.width,
    frame.height,
    frame.data->size());
  if (!bounds.valid) {
    return;
  }

  frame.alphaMinX = bounds.minX;
  frame.alphaMinY = bounds.minY;
  frame.alphaMaxX = bounds.maxX;
  frame.alphaMaxY = bounds.maxY;
  frame.hasAlphaBounds = true;
}

void prime_graphics_overlay_frame(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target)
{
  GraphicsOverlayLatestFrame& latestFrame =
    graphics_overlay_latest_frame_for_target(context, target);
  latestFrame.data = create_transparent_graphics_overlay_frame(context);
  latestFrame.width = context.overlayWidth;
  latestFrame.height = context.overlayHeight;
  latestFrame.hasFrame = true;
  update_graphics_overlay_alpha_bounds(latestFrame);
}

void reset_and_prime_graphics_overlay_frames(
  const GraphicsOverlayRuntimeContext& context)
{
  if (context.programFrame) {
    *context.programFrame = GraphicsOverlayLatestFrame{};
    prime_graphics_overlay_frame(context, GRAPHICS_TARGET_PROGRAM);
  }
  if (context.previewFrame) {
    *context.previewFrame = GraphicsOverlayLatestFrame{};
    prime_graphics_overlay_frame(context, GRAPHICS_TARGET_PREVIEW);
  }
}

void configure_graphics_overlay_appsrc_caps(
  const GraphicsOverlayRuntimeContext& context)
{
  GstCaps* graphicsCaps = gst_caps_new_simple(
    "video/x-raw",
    "format", G_TYPE_STRING, "BGRA",
    "width", G_TYPE_INT, context.overlayWidth,
    "height", G_TYPE_INT, context.overlayHeight,
    "framerate", GST_TYPE_FRACTION, context.frameRateNum, context.frameRateDen,
    "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
    NULL
  );
  if (context.programAppsrc) {
    g_object_set(context.programAppsrc, "caps", graphicsCaps, NULL);
  }
  if (context.previewAppsrc) {
    g_object_set(context.previewAppsrc, "caps", graphicsCaps, NULL);
  }
  gst_caps_unref(graphicsCaps);
}

void set_graphics_overlay_enabled(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target,
  bool enabled)
{
  if (!context.branchesEnabled) {
    graphics_overlay_latest_frame_for_target(context, target).enabled = false;
    if (target == GRAPHICS_TARGET_PROGRAM && context.recordingProgramOverlayActive) {
      context.recordingProgramOverlayActive->store(false, std::memory_order_relaxed);
    }
    return;
  }

  graphics_overlay_latest_frame_for_target(context, target).enabled = enabled;
  if (target == GRAPHICS_TARGET_PROGRAM && context.recordingProgramOverlayActive) {
    context.recordingProgramOverlayActive->store(
      context.programRecordingEnabled &&
        context.nativeProgramRecordingActive &&
        enabled,
      std::memory_order_relaxed);
  }

  GstPad* overlayPad = graphics_overlay_pad_for_target(context, target);
  if (overlayPad) {
    g_object_set(overlayPad, "alpha", enabled ? 1.0 : 0.0, NULL);
  }
}

static bool push_graphics_overlay_buffer_to_appsrc(
  const GraphicsOverlayRuntimeContext& context,
  GstElement* overlayAppsrc,
  const uint8_t* data,
  size_t expectedSize,
  bool logErrors)
{
  if (!overlayAppsrc || !data || expectedSize == 0) {
    return false;
  }

  GstBuffer* buffer = gst_buffer_new_allocate(NULL, expectedSize, NULL);
  if (!buffer) {
    if (logErrors) {
      fprintf(stderr, "[Graphics Overlay] No se pudo reservar GstBuffer\n");
    }
    return false;
  }

  GstMapInfo map;
  if (!gst_buffer_map(buffer, &map, GST_MAP_WRITE)) {
    gst_buffer_unref(buffer);
    if (logErrors) {
      fprintf(stderr, "[Graphics Overlay] No se pudo mapear GstBuffer\n");
    }
    return false;
  }

  memcpy(map.data, data, expectedSize);
  gst_buffer_unmap(buffer, &map);

  GST_BUFFER_DURATION(buffer) = gst_util_uint64_scale_int(
    GST_SECOND,
    context.frameRateDen,
    context.frameRateNum);

  GstFlowReturn pushRet = gst_app_src_push_buffer(GST_APP_SRC(overlayAppsrc), buffer);
  if (pushRet != GST_FLOW_OK) {
    if (logErrors) {
      fprintf(stderr, "[Graphics Overlay] Error empujando frame nativo (%d)\n", pushRet);
    }
    return false;
  }

  return true;
}

bool store_graphics_overlay_frame(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target,
  std::shared_ptr<std::vector<uint8_t>> frameData,
  int width,
  int height)
{
  if (!context.branchesEnabled ||
      !context.pipeline ||
      !graphics_overlay_appsrc_for_target(context, target) ||
      !frameData) {
    return false;
  }

  GraphicsOverlayLatestFrame& latestFrame =
    graphics_overlay_latest_frame_for_target(context, target);
  latestFrame.data = std::move(frameData);
  latestFrame.width = width;
  latestFrame.height = height;
  latestFrame.hasFrame = true;
  update_graphics_overlay_alpha_bounds(latestFrame);
  return true;
}

static void push_graphics_overlay_cached_frame_locked(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target,
  bool logErrors)
{
  if (!context.branchesEnabled) {
    return;
  }

  GstElement* overlayAppsrc = graphics_overlay_appsrc_for_target(context, target);
  GraphicsOverlayLatestFrame& latestFrame =
    graphics_overlay_latest_frame_for_target(context, target);
  if (!overlayAppsrc || !latestFrame.hasFrame || !latestFrame.data || latestFrame.data->empty()) {
    return;
  }

  push_graphics_overlay_buffer_to_appsrc(
    context,
    overlayAppsrc,
    latestFrame.data->data(),
    latestFrame.data->size(),
    logErrors);
}

void seed_graphics_overlay_inputs(
  const GraphicsOverlayRuntimeContext& context)
{
  if (!context.branchesEnabled) {
    return;
  }

  // Los appsrc de grafismo estan conectados a los compositores aunque no haya
  // ningun rotulo visible. Si no entregan nunca un buffer, GstAggregator puede
  // esperar periodicamente a esa entrada muda. Empujamos un frame transparente
  // inicial: compositor conserva el ultimo buffer y lo repite sin coste JS.
  if (context.programFrame && !context.programFrame->hasFrame) {
    prime_graphics_overlay_frame(context, GRAPHICS_TARGET_PROGRAM);
  }
  if (context.previewFrame && !context.previewFrame->hasFrame) {
    prime_graphics_overlay_frame(context, GRAPHICS_TARGET_PREVIEW);
  }

  push_graphics_overlay_cached_frame_locked(context, GRAPHICS_TARGET_PROGRAM, false);
  push_graphics_overlay_cached_frame_locked(context, GRAPHICS_TARGET_PREVIEW, false);
}

static void pump_graphics_overlay_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target)
{
  if (!context.branchesEnabled || !context.mutex || !context.mediaPlaneActive) {
    return;
  }

  GstElement* overlayAppsrc = nullptr;
  std::shared_ptr<std::vector<uint8_t>> frameData;

  {
    std::lock_guard<std::mutex> lock(*context.mutex);
    if (!context.pipeline || !context.mediaPlaneActive->load()) {
      return;
    }

    GraphicsOverlayLatestFrame& latestFrame =
      graphics_overlay_latest_frame_for_target(context, target);
    if (context.pumpMode == GRAPHICS_OVERLAY_PUMP_ACTIVE && !latestFrame.enabled) {
      return;
    }

    if (!latestFrame.hasFrame || !latestFrame.data || latestFrame.data->empty()) {
      return;
    }

    overlayAppsrc = graphics_overlay_appsrc_for_target(context, target);
    if (!overlayAppsrc) {
      return;
    }

    gst_object_ref(overlayAppsrc);
    frameData = latestFrame.data;
  }

  push_graphics_overlay_buffer_to_appsrc(
    context,
    overlayAppsrc,
    frameData->data(),
    frameData->size(),
    false);
  gst_object_unref(overlayAppsrc);
}

static void graphics_overlay_pump_loop(GraphicsOverlayRuntimeContext context)
{
  const auto frameInterval = std::chrono::milliseconds(
    std::max(1, 1000 / context.frameRateNum));

  while (context.pumpRunning && context.pumpRunning->load()) {
    const auto startedAt = std::chrono::steady_clock::now();

    pump_graphics_overlay_target(context, GRAPHICS_TARGET_PREVIEW);
    pump_graphics_overlay_target(context, GRAPHICS_TARGET_PROGRAM);

    const auto elapsed = std::chrono::steady_clock::now() - startedAt;
    if (elapsed < frameInterval) {
      std::this_thread::sleep_for(frameInterval - elapsed);
    }
  }
}

void start_graphics_overlay_pump(
  const GraphicsOverlayRuntimeContext& context)
{
  if (!context.branchesEnabled ||
      context.pumpMode == GRAPHICS_OVERLAY_PUMP_OFF ||
      !context.pumpRunning ||
      !context.pumpThread) {
    return;
  }

  if (context.pumpMode == GRAPHICS_OVERLAY_PUMP_ACTIVE &&
      context.programFrame &&
      context.previewFrame &&
      !context.programFrame->enabled &&
      !context.previewFrame->enabled) {
    return;
  }

  if (context.pumpRunning->load()) {
    return;
  }

  context.pumpRunning->store(true);
  *context.pumpThread = std::thread(graphics_overlay_pump_loop, context);
}

bool request_graphics_overlay_pump_stop(
  const GraphicsOverlayRuntimeContext& context)
{
  return context.pumpRunning && context.pumpRunning->exchange(false);
}

bool graphics_overlay_pump_can_stop_when_inactive(
  const GraphicsOverlayRuntimeContext& context)
{
  return context.pumpMode == GRAPHICS_OVERLAY_PUMP_ACTIVE &&
    context.programFrame &&
    context.previewFrame &&
    !context.programFrame->enabled &&
    !context.previewFrame->enabled;
}

void join_graphics_overlay_pump_after_unlock(
  const GraphicsOverlayRuntimeContext& context)
{
  if (context.pumpThread && context.pumpThread->joinable()) {
    context.pumpThread->join();
  }
}

void stop_graphics_overlay_pump(
  const GraphicsOverlayRuntimeContext& context)
{
  if (!request_graphics_overlay_pump_stop(context)) {
    return;
  }

  join_graphics_overlay_pump_after_unlock(context);
}
