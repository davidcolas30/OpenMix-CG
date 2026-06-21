#pragma once

#include <gst/gst.h>

#include <chrono>
#include <condition_variable>
#include <mutex>

struct RecordingEosTracker {
  std::mutex* mutex = nullptr;
  std::condition_variable* condition = nullptr;
  bool* filesinkEosSeen = nullptr;
};

void reset_recording_eos_tracker(RecordingEosTracker& tracker);
void add_recording_filesink_eos_probe(
  GstElement* fileSink,
  RecordingEosTracker& tracker);
bool wait_recording_filesink_eos(
  RecordingEosTracker& tracker,
  std::chrono::seconds timeout);

bool push_eos_from_source_pad(GstElement* element, const char* label);
bool send_eos_to_muxer_sink_pad(GstPad* sinkPad, const char* label);
void drop_future_source_pad_buffers(GstElement* element, const char* label);
void add_drop_recording_buffers_after_stop_probe(GstPad* pad);
