#pragma once

#include "monitor_diagnostics.h"
#include "monitor_frame_bridge.h"

#include <array>
#include <chrono>
#include <gst/gst.h>

constexpr int kMixerPipelineDiagnosticsMaxSources = 4;

struct MixerPipelineDiagnosticsConfig {
  int sourceCount = 0;
};

struct MixerPipelineDiagnosticsState {
  StreamDiagnostics* pgmDiagnostics = nullptr;
  StreamDiagnostics* pvwDiagnostics = nullptr;
  NativeMonitorDiagnostics* pgmNativeMonitorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pvwNativeMonitorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pgmCompositorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pvwCompositorDiagnostics = nullptr;
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    pgmMonitorSourceDiagnostics = {};
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    pvwMonitorSourceDiagnostics = {};
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    webrtcRtpDiagnostics = {};
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    webrtcEncodedDiagnostics = {};
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    webrtcDecodedDiagnostics = {};
  std::array<NativeMonitorDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    webrtcMonitorOutDiagnostics = {};
  std::array<RtpTimelineDiagnostics*, kMixerPipelineDiagnosticsMaxSources>
    webrtcRtpTimelineDiagnostics = {};
  std::chrono::steady_clock::time_point* lastPgmMonitorFrameTime = nullptr;
  std::chrono::steady_clock::time_point* lastPvwMonitorFrameTime = nullptr;
};

struct MixerPipelineDiagnosticsElements {
  GstElement* pgmNativeMonitorSink = nullptr;
  GstElement* pvwNativeMonitorSink = nullptr;
  GstElement* pgmCompositor = nullptr;
  GstElement* pvwCompositor = nullptr;
  std::array<GstElement*, kMixerPipelineDiagnosticsMaxSources> pgmMonitorSourceValves = {};
  std::array<GstElement*, kMixerPipelineDiagnosticsMaxSources> pvwMonitorSourceValves = {};
};

void reset_mixer_pipeline_diagnostics(
  const MixerPipelineDiagnosticsConfig& config,
  MixerPipelineDiagnosticsState& state);

void attach_mixer_pipeline_diagnostics_probes(
  const MixerPipelineDiagnosticsConfig& config,
  const MixerPipelineDiagnosticsElements& elements,
  MixerPipelineDiagnosticsState& state);
