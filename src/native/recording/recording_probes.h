#pragma once

#include <gst/gst.h>
#include <atomic>
#include <cstdint>

void add_recording_retimer_probe(
  GstElement* element,
  const char* padName,
  GstClockTime defaultDuration,
  const std::atomic<uint64_t>* recordingTimelineGeneration,
  bool forceSequential = false,
  GstClockTime initialBasePts = GST_CLOCK_TIME_NONE,
  bool resetOnRecordingTimeline = false);

void add_recording_realtime_frame_gate_probe(
  GstElement* element,
  const char* padName,
  GstClockTime frameDuration,
  int frameRateNum);
