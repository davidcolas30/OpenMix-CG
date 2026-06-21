#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <mutex>

struct LocalVideoSource;

using LocalVideoSourceMatcher =
  std::function<bool(int sourceIndex, int firstSource, int secondSource)>;
using LocalVideoSourceActivitySetter =
  std::function<void(int sourceIndex, bool active)>;
using LocalVideoSlotFallbackSetter =
  std::function<void(int sourceIndex)>;
using LocalVideoCompositorUpdater =
  std::function<void()>;
using LocalVideoRunningTimeProvider = GstClockTime (*)();

struct LocalVideoControlsContext {
  std::mutex* mixerMutex = nullptr;
  GstElement** pipeline = nullptr;
  LocalVideoSource** sources = nullptr;
  std::atomic<uint64_t>* instanceCounter = nullptr;
  int firstSourceIndex = 1;
  int sourceCount = 4;
  int* monitorWidth = nullptr;
  int* monitorHeight = nullptr;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  guint recordingRawQueueBuffers = 8;
  bool* programRecordingEnabled = nullptr;
  int* programSource = nullptr;
  GstElement** webrtcSelectors = nullptr;
  GstElement** webrtcRecordingSelectors = nullptr;
  LocalVideoRunningTimeProvider getRunningTime = nullptr;
  LocalVideoSourceMatcher sourceMatchesRecordingKeepWarmSelection;
  LocalVideoSourceActivitySetter setSourceActive;
  LocalVideoSlotFallbackSetter setSlotToFallback;
  LocalVideoCompositorUpdater updateCompositorAlphas;
};

void set_local_video_controls_context(const LocalVideoControlsContext& context);

Napi::Value load_local_video_source(const Napi::CallbackInfo& info);
Napi::Value clear_local_video_source(const Napi::CallbackInfo& info);
Napi::Value restart_local_video_source(const Napi::CallbackInfo& info);
Napi::Value set_local_video_paused(const Napi::CallbackInfo& info);
Napi::Value set_local_video_loop(const Napi::CallbackInfo& info);

bool clear_local_video_source_locked(int sourceIndex);
bool restart_local_video_source_locked(int sourceIndex);
bool set_local_video_paused_locked(int sourceIndex, bool paused);
bool set_local_video_loop_locked(int sourceIndex, bool loopEnabled);
void clear_all_local_video_sources_locked();
