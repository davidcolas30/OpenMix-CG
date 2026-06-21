#pragma once

#include "graphics_overlay_frame.h"

#include <gst/gst.h>
#include <atomic>
#include <mutex>

struct RecordingGraphicsOverlayProbeContext {
  std::atomic<bool>* overlayActive = nullptr;
  std::mutex* stateMutex = nullptr;
  bool* programRecordingEnabled = nullptr;
  bool* graphicsOverlayBranchesEnabled = nullptr;
  GraphicsOverlayLatestFrame* programFrame = nullptr;
  int outputWidth = 1920;
  int outputHeight = 1080;
};

void add_recording_program_overlay_probe(
  GstElement* tee,
  RecordingGraphicsOverlayProbeContext* context);
