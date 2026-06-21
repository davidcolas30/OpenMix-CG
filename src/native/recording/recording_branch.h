#pragma once

#include <gst/gst.h>
#include <atomic>
#include <cstdint>
#include <string>

struct NativeRecordingBranch {
  GstElement* bin = nullptr;
  GstElement* encoder = nullptr;
  GstElement* audioDelay = nullptr;
  GstElement* audioSource = nullptr;
  GstElement* audioMuxQueue = nullptr;
  GstPad* audioMuxerSinkPad = nullptr;
  GstElement* fileSink = nullptr;
  std::string encoderName;
  std::string audioEncoderName;
  std::string audioSourceName;
  bool audioEnabled = false;
};

struct NativeRecordingBranchConfig {
  std::string filePath;
  std::string container;
  std::string videoPreset;
  int qualityCrf = 23;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  bool audioEnabled = false;
  std::string audioSourceName;
  int audioDelayMs = 0;
  int audioRate = 48000;
  int audioChannels = 1;
  int audioBitrate = 128000;
  const std::atomic<uint64_t>* recordingTimelineGeneration = nullptr;
};

NativeRecordingBranch create_native_recording_branch(
  const NativeRecordingBranchConfig& config);

GstElement* set_recording_compositor_sleeping(
  GstElement* compositor,
  bool shouldSleep);
void sync_recording_compositor_state(GstElement* compositor);
