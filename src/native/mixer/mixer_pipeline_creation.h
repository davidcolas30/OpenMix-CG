#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <chrono>
#include <functional>
#include <mutex>

#include "graphics_overlay_runtime.h"
#include "mixer_pipeline_callbacks.h"
#include "mixer_pipeline_js_callbacks.h"
#include "mixer_runtime_config.h"
#include "recording_overlay.h"

using MixerPipelineGraphicsRuntimeProvider =
  std::function<GraphicsOverlayRuntimeContext()>;
using MixerPipelineVoidCallback = std::function<void()>;
using MixerPipelineCompositorSleepSetter = std::function<void(bool shouldSleep)>;

struct MixerPipelineCreationContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 0;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int multiviewColumns = 0;
  int multiviewGutter = 0;
  int multiviewSlotWidth = 0;
  int multiviewSlotHeight = 0;

  std::mutex* mixerMutex = nullptr;
  GstElement** pipeline = nullptr;

  int* monitorWidth = nullptr;
  int* monitorHeight = nullptr;
  int* webrtcBridgeWidth = nullptr;
  int* webrtcBridgeHeight = nullptr;

  bool* monitorCallbacksEnabled = nullptr;
  MonitorIpcMode* monitorIpcMode = nullptr;
  MonitorRendererMode* monitorRendererMode = nullptr;
  bool* monitorGlZeroCopyEnabled = nullptr;
  MonitorCompositorBackend* monitorCompositorBackend = nullptr;
  MonitorCompositorFormatMode* monitorCompositorFormatMode = nullptr;
  bool* nativeMonitorWindowsEnabled = nullptr;
  bool* nativeMonitorSinkSyncEnabled = nullptr;
  const char** nativeMonitorSinkFactory = nullptr;
  bool* multiviewHudEnabled = nullptr;
  MultiviewBarsMode* multiviewBarsMode = nullptr;
  int* multiviewSourceFps = nullptr;
  bool* thumbnailsEnabled = nullptr;
  bool* graphicsOverlayBranchesEnabled = nullptr;
  MonitorInputMode* monitorInputMode = nullptr;
  bool* monitorCompositorsEnabled = nullptr;
  bool* combinedMonitorEnabled = nullptr;
  bool* multiviewEnabled = nullptr;

  GstElement** pgmCompositor = nullptr;
  GstElement** pgmRecordingCompositor = nullptr;
  GstElement** pvwCompositor = nullptr;
  GstElement** multiviewCompositor = nullptr;
  GstElement** combinedMonitorCompositor = nullptr;
  GstElement** pgmMonitorSelector = nullptr;
  GstElement** pvwMonitorSelector = nullptr;
  GstElement** pgmAbTransitionSelector = nullptr;
  GstElement** pgmRecordingTee = nullptr;

  GstPad** pgmPads = nullptr;
  GstPad** pgmRecordingPads = nullptr;
  GstPad** pvwPads = nullptr;
  GstPad** graphicsPgmPad = nullptr;
  GstPad** graphicsPvwPad = nullptr;
  GstPad** pgmAbPrimaryPad = nullptr;
  GstPad** pgmAbSecondaryPad = nullptr;
  GstPad** pvwAbPrimaryPad = nullptr;

  int* programSource = nullptr;
  int* previewSource = nullptr;
  std::atomic<int>* programSourceForOverlay = nullptr;
  std::atomic<int>* previewSourceForOverlay = nullptr;
  bool* programRecordingEnabled = nullptr;
  std::atomic<int>* syncBufferDecodedPeerCount = nullptr;
  std::chrono::steady_clock::time_point* lastThumbTime = nullptr;

  RecordingGraphicsOverlayProbeContext* recordingOverlayProbeContext = nullptr;
  MixerPipelineJsCallbackTargets callbackTargets;

  MixerPipelineGraphicsRuntimeProvider makeGraphicsRuntimeContext;
  MixerPipelineVoidCallback resetMultiviewSourceActivity;
  MixerPipelineVoidCallback updateCompositorAlphas;
  MixerPipelineVoidCallback resetSyncBufferNtpAlignmentState;
  MixerPipelineCompositorSleepSetter setRecordingCompositorSleeping;
  MixerPipelineCompositorSleepSetter setMonitorCompositorsSleeping;
};

void set_mixer_pipeline_creation_context(
  const MixerPipelineCreationContext& context);

Napi::Value create_mixer_pipeline_control(const Napi::CallbackInfo& info);
