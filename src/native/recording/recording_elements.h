#pragma once

#include <gst/gst.h>
#include <string>

void configure_recording_videorate(GstElement* rate);

GstElement* make_h264_encoder(
  const std::string& videoPreset,
  int qualityCrf,
  int frameRateNum,
  std::string& selectedEncoderName);

GstElement* make_recording_muxer(
  const std::string& container,
  std::string& selectedMuxerName);

GstElement* make_recording_system_memory_bridge(const char* name);
std::string resolve_recording_audio_source_name();
int clamp_recording_audio_delay_ms(int requestedDelayMs, int minDelayMs, int maxDelayMs);

GstElement* make_recording_audio_encoder(
  std::string& selectedEncoderName,
  int audioBitrate);
