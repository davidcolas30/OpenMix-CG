#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>

#include "graphics_overlay_frame.h"
#include "recording_eos.h"

using RecordingSourceValveRouter =
  std::function<void(bool enabled, int firstSource, int secondSource)>;
using RecordingSteadyLayoutApplier = std::function<void()>;

struct RecordingControlsContext {
  std::mutex* mixerMutex = nullptr;
  GstElement** pipeline = nullptr;
  GstElement** pgmRecordingCompositor = nullptr;
  GstElement** pgmRecordingTee = nullptr;
  GstElement** pgmRecordingValve = nullptr;

  GstElement** nativeRecordingBin = nullptr;
  GstElement** nativeRecordingAudioDelay = nullptr;
  GstElement** nativeRecordingAudioSource = nullptr;
  GstElement** nativeRecordingAudioMuxQueue = nullptr;
  GstElement** nativeRecordingFileSink = nullptr;
  GstPad** nativeRecordingTeePad = nullptr;
  GstPad** nativeRecordingAudioMuxerSinkPad = nullptr;
  RecordingEosTracker* eosTracker = nullptr;

  bool* programRecordingEnabled = nullptr;
  bool* nativeProgramRecordingActive = nullptr;
  bool* recordingAudioEnabled = nullptr;
  bool* graphicsOverlayBranchesEnabled = nullptr;
  std::atomic<bool>* recordingProgramOverlayActive = nullptr;
  std::atomic<uint64_t>* recordingTimelineGeneration = nullptr;
  GraphicsOverlayLatestFrame* graphicsProgramFrame = nullptr;
  std::string* recordingAudioSourceName = nullptr;
  int* recordingAudioDelayMs = nullptr;
  int* programSource = nullptr;

  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  int recordingAudioRate = 48000;
  int recordingAudioChannels = 1;
  int recordingAudioBitrate = 128000;
  int minRecordingAudioDelayMs = -2000;
  int maxRecordingAudioDelayMs = 5000;

  RecordingSourceValveRouter setRecordingSourceValvesForSources;
  RecordingSteadyLayoutApplier applyRecordingSteadyProgramLayoutLocked;
};

void set_recording_controls_context(const RecordingControlsContext& context);

GstElement* set_recording_compositor_sleeping_locked(bool shouldSleep);
GstElement* set_recording_inputs_enabled_locked(bool enabled);
void destroy_native_recording_branch_locked(bool sendEos);

Napi::Value set_program_recording_enabled(const Napi::CallbackInfo& info);
Napi::Value start_program_recording(const Napi::CallbackInfo& info);
Napi::Value stop_program_recording(const Napi::CallbackInfo& info);
Napi::Value set_recording_audio_delay_ms(const Napi::CallbackInfo& info);
Napi::Value get_recording_audio_state(const Napi::CallbackInfo& info);
