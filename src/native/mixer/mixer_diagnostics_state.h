#pragma once

#include <atomic>
#include <chrono>

#include "monitor_diagnostics.h"
#include "monitor_frame_bridge.h"
#include "multiview_overlay.h"

struct MixerDiagnosticsStateContext {
  int sourceCount = 0;
  int multiviewColumns = 0;
  int multiviewGutter = 0;
  int multiviewSlotWidth = 0;
  int multiviewSlotHeight = 0;
  const char* const* sourceNames = nullptr;
  const std::atomic<int>* programSource = nullptr;
  const std::atomic<int>* previewSource = nullptr;
  const bool* multiviewHudEnabled = nullptr;
  const bool* multiviewStaticBarsOverlayEnabled = nullptr;
  const bool* multiviewBarsCacheEnabled = nullptr;
};

void configure_mixer_diagnostics_state(const MixerDiagnosticsStateContext& context);

StreamDiagnostics* mixer_pgm_stream_diagnostics();
StreamDiagnostics* mixer_pvw_stream_diagnostics();

NativeMonitorDiagnostics* mixer_pgm_native_monitor_diagnostics();
NativeMonitorDiagnostics* mixer_pvw_native_monitor_diagnostics();
NativeMonitorDiagnostics* mixer_pgm_compositor_diagnostics();
NativeMonitorDiagnostics* mixer_pvw_compositor_diagnostics();
NativeMonitorDiagnostics* mixer_pgm_monitor_source_diagnostics();
NativeMonitorDiagnostics* mixer_pvw_monitor_source_diagnostics();
NativeMonitorDiagnostics* mixer_webrtc_rtp_diagnostics();
NativeMonitorDiagnostics* mixer_webrtc_encoded_diagnostics();
NativeMonitorDiagnostics* mixer_webrtc_decoded_diagnostics();
NativeMonitorDiagnostics* mixer_webrtc_monitor_out_diagnostics();
RtpTimelineDiagnostics* mixer_webrtc_rtp_timeline_diagnostics();

std::chrono::steady_clock::time_point* mixer_last_pgm_monitor_frame_time();
std::chrono::steady_clock::time_point* mixer_last_pvw_monitor_frame_time();
std::atomic<bool>* mixer_multiview_source_active();
MultiviewOverlayState* mixer_multiview_overlay_state();
