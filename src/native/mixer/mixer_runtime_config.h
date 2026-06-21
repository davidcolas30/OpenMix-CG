#pragma once

#include "monitor_frame_bridge.h"

#include <string>

enum WebRTCH264DecoderMode {
  WEBRTC_H264_DECODER_AUTO,
  WEBRTC_H264_DECODER_HARDWARE,
  WEBRTC_H264_DECODER_SOFTWARE
};

enum MultiviewBarsMode {
  MULTIVIEW_BARS_LIVE,
  MULTIVIEW_BARS_STATIC,
  MULTIVIEW_BARS_OFF
};

enum GraphicsOverlayPumpMode {
  GRAPHICS_OVERLAY_PUMP_OFF,
  GRAPHICS_OVERLAY_PUMP_ACTIVE,
  GRAPHICS_OVERLAY_PUMP_ALWAYS
};

enum MonitorInputMode {
  MONITOR_INPUTS_BOTH,
  MONITOR_INPUTS_NONE
};

enum MonitorRendererMode {
  MONITOR_RENDERER_COMPOSITOR,
  MONITOR_RENDERER_SELECTOR,
  MONITOR_RENDERER_AB_COMPOSITOR
};

enum MonitorCompositorBackend {
  MONITOR_COMPOSITOR_BACKEND_CPU,
  MONITOR_COMPOSITOR_BACKEND_GL
};

enum MonitorCompositorFormatMode {
  MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420,
  MONITOR_COMPOSITOR_FORMAT_BGRA,
  MONITOR_COMPOSITOR_FORMAT_I420,
  MONITOR_COMPOSITOR_FORMAT_I420_BASE_BGRA_GRAPHICS
};

enum WebRTCMonitorNormalizeMode {
  WEBRTC_MONITOR_NORMALIZE_PRE_SELECTOR,
  WEBRTC_MONITOR_NORMALIZE_DEFERRED
};

extern int g_graphicsOverlayWidth;
extern int g_graphicsOverlayHeight;
extern int g_monitorActiveIntervalMs;
extern int g_monitorIdleIntervalMs;
extern int g_monitorActiveFps;
extern int g_monitorIdleFps;
extern int g_webrtcReceiveLatencyMs;
extern int g_webrtcRtpQueueBuffers;
extern int g_webrtcRtpQueueTimeMs;
extern std::string g_webrtcJitterBufferMode;
extern int g_webrtcJitterBufferModeValue;
extern bool g_webrtcRxStatsEnabled;
extern bool g_webrtcRtpDirectSinkEnabled;
extern int g_webrtcRxStatsIntervalMs;
extern bool g_syncBufferEnabled;
extern bool g_syncBufferStatsEnabled;
extern bool g_syncBufferNtpEnabled;
extern bool g_syncBufferNtpApplyEnabled;
extern bool g_syncBufferRetimerEnabled;
extern bool g_syncBufferClockGateEnabled;
extern bool g_recordingAudioEnabled;
extern int g_syncBufferLatencyMs;
extern int g_syncBufferMaxBuffers;
extern int g_syncBufferMaxTimeMs;
extern int g_syncBufferNtpMaxDelayMs;
extern int g_syncBufferNtpMinStepMs;
extern int g_syncBufferNtpAdjustIntervalMs;
extern int g_syncBufferNtpMaxStepMs;
extern int g_syncBufferMinPeers;
extern int g_recordingAudioDelayMs;
extern std::string g_recordingAudioSourceName;
extern GraphicsOverlayPumpMode g_graphicsOverlayPumpMode;
extern bool g_graphicsOverlayBranchesEnabled;
extern MonitorIpcMode g_monitorIpcMode;
extern MonitorInputMode g_monitorInputMode;
extern bool g_thumbnailsEnabled;
extern bool g_multiviewEnabled;
extern bool g_multiviewHudEnabled;
extern bool g_multiviewActiveSlotsEnabled;
extern MultiviewBarsMode g_multiviewBarsMode;
extern bool g_multiviewStaticBarsOverlayEnabled;
extern bool g_multiviewBarsCacheEnabled;
extern int g_multiviewSourceFps;
extern bool g_combinedMonitorEnabled;
extern bool g_webrtcMonitorBranchEnabled;
extern bool g_webrtcDecodeBranchEnabled;
extern bool g_webrtcStandaloneRxEnabled;
extern bool g_monitorCompositorsEnabled;
extern bool g_monitorCallbacksEnabled;
extern bool g_nativeMonitorWindowsEnabled;
extern bool g_nativeMonitorSinkSyncEnabled;
extern bool g_realtimeDiagnosticLogsEnabled;
extern bool g_pliReserveThreadEnabled;
extern bool g_localVideoPrewarmEnabled;
extern bool g_stutterTraceEnabled;
extern bool g_h264KeyframeTraceEnabled;
extern bool g_rtpTimelineTraceEnabled;
extern bool g_rtpTimelineSummaryEnabled;
extern const char* g_nativeMonitorSinkFactory;
extern MonitorRendererMode g_monitorRendererMode;
extern MonitorCompositorBackend g_monitorCompositorBackend;
extern bool g_monitorGlZeroCopyEnabled;
extern MonitorCompositorFormatMode g_monitorCompositorFormatMode;
extern WebRTCMonitorNormalizeMode g_webrtcMonitorNormalizeMode;

bool is_ab_compositor_monitor_renderer();
bool uses_selector_monitor_inputs();
bool uses_gl_monitor_compositor_backend();
void resolve_webrtc_jitterbuffer_mode_from_env();
WebRTCH264DecoderMode get_webrtc_h264_decoder_mode();
const char* get_webrtc_h264_decoder_mode_label(WebRTCH264DecoderMode mode);
void configure_mixer_runtime_from_env();
