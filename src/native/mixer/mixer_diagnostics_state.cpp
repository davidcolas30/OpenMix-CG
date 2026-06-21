#include "mixer_diagnostics_state.h"

namespace {

constexpr int kMaxSources = 4;

StreamDiagnostics g_pgmDiagnostics = { "PGM", 0, 0, 0, {} };
StreamDiagnostics g_pvwDiagnostics = { "PVW", 0, 0, 0, {} };

NativeMonitorDiagnostics g_pgmNativeMonitorDiagnostics = {
  "PGM",
  0,
  1000000,
  0,
  0,
  {},
  {}
};
NativeMonitorDiagnostics g_pvwNativeMonitorDiagnostics = {
  "PVW",
  0,
  1000000,
  0,
  0,
  {},
  {}
};
NativeMonitorDiagnostics g_pgmCompositorDiagnostics = {
  "PGM compositor",
  0,
  1000000,
  0,
  0,
  {},
  {}
};
NativeMonitorDiagnostics g_pvwCompositorDiagnostics = {
  "PVW compositor",
  0,
  1000000,
  0,
  0,
  {},
  {}
};
NativeMonitorDiagnostics g_pgmMonitorSourceDiagnostics[kMaxSources] = {
  { "PGM source 0", 0, 1000000, 0, 0, {}, {} },
  { "PGM source 1", 0, 1000000, 0, 0, {}, {} },
  { "PGM source 2", 0, 1000000, 0, 0, {}, {} },
  { "PGM source 3", 0, 1000000, 0, 0, {}, {} }
};
NativeMonitorDiagnostics g_pvwMonitorSourceDiagnostics[kMaxSources] = {
  { "PVW source 0", 0, 1000000, 0, 0, {}, {} },
  { "PVW source 1", 0, 1000000, 0, 0, {}, {} },
  { "PVW source 2", 0, 1000000, 0, 0, {}, {} },
  { "PVW source 3", 0, 1000000, 0, 0, {}, {} }
};
NativeMonitorDiagnostics g_webrtcRtpDiagnostics[kMaxSources] = {
  { "WebRTC RTP 0", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC RTP 1", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC RTP 2", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC RTP 3", 0, 1000000, 0, 0, {}, {} }
};
NativeMonitorDiagnostics g_webrtcEncodedDiagnostics[kMaxSources] = {
  { "WebRTC encoded 0", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC encoded 1", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC encoded 2", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC encoded 3", 0, 1000000, 0, 0, {}, {} }
};
NativeMonitorDiagnostics g_webrtcDecodedDiagnostics[kMaxSources] = {
  { "WebRTC decoded 0", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC decoded 1", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC decoded 2", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC decoded 3", 0, 1000000, 0, 0, {}, {} }
};
NativeMonitorDiagnostics g_webrtcMonitorOutDiagnostics[kMaxSources] = {
  { "WebRTC monitor out 0", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC monitor out 1", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC monitor out 2", 0, 1000000, 0, 0, {}, {} },
  { "WebRTC monitor out 3", 0, 1000000, 0, 0, {}, {} }
};
RtpTimelineDiagnostics g_webrtcRtpTimelineDiagnostics[kMaxSources] = {
  { "WebRTC RTP timeline 0", 90000, false, 0, 0, 0, 0, 0, 0, 0.0, 0, {}, {}, {} },
  { "WebRTC RTP timeline 1", 90000, false, 0, 0, 0, 0, 0, 0, 0.0, 0, {}, {}, {} },
  { "WebRTC RTP timeline 2", 90000, false, 0, 0, 0, 0, 0, 0, 0.0, 0, {}, {}, {} },
  { "WebRTC RTP timeline 3", 90000, false, 0, 0, 0, 0, 0, 0, 0.0, 0, {}, {}, {} }
};

std::chrono::steady_clock::time_point g_lastPgmMonitorFrameTime = {};
std::chrono::steady_clock::time_point g_lastPvwMonitorFrameTime = {};
std::atomic<bool> g_multiviewSourceActive[kMaxSources] = {};
MultiviewOverlayState g_multiviewOverlayState = {};

} // namespace

void configure_mixer_diagnostics_state(const MixerDiagnosticsStateContext& context)
{
  g_multiviewOverlayState.sourceCount = context.sourceCount;
  g_multiviewOverlayState.columns = context.multiviewColumns;
  g_multiviewOverlayState.gutter = context.multiviewGutter;
  g_multiviewOverlayState.slotWidth = context.multiviewSlotWidth;
  g_multiviewOverlayState.slotHeight = context.multiviewSlotHeight;
  g_multiviewOverlayState.sourceNames = context.sourceNames;
  g_multiviewOverlayState.programSource = context.programSource;
  g_multiviewOverlayState.previewSource = context.previewSource;
  g_multiviewOverlayState.hudEnabled = context.multiviewHudEnabled;
  g_multiviewOverlayState.staticBarsEnabled =
    context.multiviewStaticBarsOverlayEnabled;
  g_multiviewOverlayState.barsCacheEnabled = context.multiviewBarsCacheEnabled;
}

StreamDiagnostics* mixer_pgm_stream_diagnostics()
{
  return &g_pgmDiagnostics;
}

StreamDiagnostics* mixer_pvw_stream_diagnostics()
{
  return &g_pvwDiagnostics;
}

NativeMonitorDiagnostics* mixer_pgm_native_monitor_diagnostics()
{
  return &g_pgmNativeMonitorDiagnostics;
}

NativeMonitorDiagnostics* mixer_pvw_native_monitor_diagnostics()
{
  return &g_pvwNativeMonitorDiagnostics;
}

NativeMonitorDiagnostics* mixer_pgm_compositor_diagnostics()
{
  return &g_pgmCompositorDiagnostics;
}

NativeMonitorDiagnostics* mixer_pvw_compositor_diagnostics()
{
  return &g_pvwCompositorDiagnostics;
}

NativeMonitorDiagnostics* mixer_pgm_monitor_source_diagnostics()
{
  return g_pgmMonitorSourceDiagnostics;
}

NativeMonitorDiagnostics* mixer_pvw_monitor_source_diagnostics()
{
  return g_pvwMonitorSourceDiagnostics;
}

NativeMonitorDiagnostics* mixer_webrtc_rtp_diagnostics()
{
  return g_webrtcRtpDiagnostics;
}

NativeMonitorDiagnostics* mixer_webrtc_encoded_diagnostics()
{
  return g_webrtcEncodedDiagnostics;
}

NativeMonitorDiagnostics* mixer_webrtc_decoded_diagnostics()
{
  return g_webrtcDecodedDiagnostics;
}

NativeMonitorDiagnostics* mixer_webrtc_monitor_out_diagnostics()
{
  return g_webrtcMonitorOutDiagnostics;
}

RtpTimelineDiagnostics* mixer_webrtc_rtp_timeline_diagnostics()
{
  return g_webrtcRtpTimelineDiagnostics;
}

std::chrono::steady_clock::time_point* mixer_last_pgm_monitor_frame_time()
{
  return &g_lastPgmMonitorFrameTime;
}

std::chrono::steady_clock::time_point* mixer_last_pvw_monitor_frame_time()
{
  return &g_lastPvwMonitorFrameTime;
}

std::atomic<bool>* mixer_multiview_source_active()
{
  return g_multiviewSourceActive;
}

MultiviewOverlayState* mixer_multiview_overlay_state()
{
  return &g_multiviewOverlayState;
}
