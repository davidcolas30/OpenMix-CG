#pragma once

#include "graphics_overlay_frame.h"
#include "mixer_runtime_config.h"

#include <gst/gst.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

enum GraphicsOverlayTarget {
  GRAPHICS_TARGET_PROGRAM,
  GRAPHICS_TARGET_PREVIEW
};

struct GraphicsOverlayRuntimeContext {
  bool branchesEnabled = false;
  bool programRecordingEnabled = false;
  bool nativeProgramRecordingActive = false;
  GraphicsOverlayPumpMode pumpMode = GRAPHICS_OVERLAY_PUMP_OFF;
  int overlayWidth = 0;
  int overlayHeight = 0;
  int frameRateNum = 30;
  int frameRateDen = 1;
  GstElement* pipeline = nullptr;
  GstElement* programAppsrc = nullptr;
  GstElement* previewAppsrc = nullptr;
  GstPad* programPad = nullptr;
  GstPad* previewPad = nullptr;
  GraphicsOverlayLatestFrame* programFrame = nullptr;
  GraphicsOverlayLatestFrame* previewFrame = nullptr;
  std::mutex* mutex = nullptr;
  std::atomic<bool>* mediaPlaneActive = nullptr;
  std::atomic<bool>* recordingProgramOverlayActive = nullptr;
  std::atomic<bool>* pumpRunning = nullptr;
  std::thread* pumpThread = nullptr;
};

bool parse_graphics_overlay_target_name(
  const std::string& targetName,
  GraphicsOverlayTarget& outTarget);

GstElement* graphics_overlay_appsrc_for_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target);

GraphicsOverlayLatestFrame& graphics_overlay_latest_frame_for_target(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target);

void update_graphics_overlay_alpha_bounds(GraphicsOverlayLatestFrame& frame);

void prime_graphics_overlay_frame(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target);
void reset_and_prime_graphics_overlay_frames(
  const GraphicsOverlayRuntimeContext& context);
void configure_graphics_overlay_appsrc_caps(
  const GraphicsOverlayRuntimeContext& context);

void set_graphics_overlay_enabled(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target,
  bool enabled);

bool store_graphics_overlay_frame(
  const GraphicsOverlayRuntimeContext& context,
  GraphicsOverlayTarget target,
  std::shared_ptr<std::vector<uint8_t>> frameData,
  int width,
  int height);

void seed_graphics_overlay_inputs(
  const GraphicsOverlayRuntimeContext& context);

void start_graphics_overlay_pump(
  const GraphicsOverlayRuntimeContext& context);

bool request_graphics_overlay_pump_stop(
  const GraphicsOverlayRuntimeContext& context);

bool graphics_overlay_pump_can_stop_when_inactive(
  const GraphicsOverlayRuntimeContext& context);

void join_graphics_overlay_pump_after_unlock(
  const GraphicsOverlayRuntimeContext& context);

void stop_graphics_overlay_pump(
  const GraphicsOverlayRuntimeContext& context);
