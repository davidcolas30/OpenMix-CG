#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <mutex>
#include <vector>

#include "graphics_overlay_frame.h"
#include "mixer_pipeline_cleanup.h"
#include "monitor_webrtc_endpoint.h"

using MixerPipelineLifecycleCallback = std::function<void()>;
using MixerPipelineCleanupRefsProvider = std::function<MixerPipelineCleanupRefs()>;

struct MixerPipelineLifecycleContext {
  std::mutex* mixerMutex = nullptr;
  GstElement** pipeline = nullptr;
  std::vector<GstElement**> compositorRefs;
  std::vector<Napi::ThreadSafeFunction*> threadSafeFunctions;
  std::vector<MonitorWebRtcEndpoint*> monitorWebRtcEndpoints;

  bool* programRecordingEnabled = nullptr;
  bool* nativeProgramRecordingActive = nullptr;
  bool* transitionInProgress = nullptr;
  std::atomic<int>* activeWebrtcPeerCount = nullptr;
  std::atomic<int>* syncBufferDecodedPeerCount = nullptr;
  std::atomic<bool>* mediaPlaneActive = nullptr;
  GraphicsOverlayLatestFrame* graphicsProgramFrame = nullptr;
  GraphicsOverlayLatestFrame* graphicsPreviewFrame = nullptr;

  MixerPipelineLifecycleCallback cancelTransitionLocked;
  MixerPipelineLifecycleCallback stopGraphicsOverlayPump;
  MixerPipelineLifecycleCallback seedGraphicsOverlayInputs;
  MixerPipelineCleanupRefsProvider makeCleanupRefs;
};

void set_mixer_pipeline_lifecycle_context(
  const MixerPipelineLifecycleContext& context);

Napi::Value start_pipeline_control(const Napi::CallbackInfo& info);
Napi::Value stop_pipeline_control(const Napi::CallbackInfo& info);
Napi::Value destroy_pipeline_control(const Napi::CallbackInfo& info);
