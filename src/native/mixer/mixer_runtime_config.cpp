#include "mixer_runtime_config.h"

#include "mixer_runtime_config_defaults.h"
#include "mixer_runtime_config_internal.h"

#include <string>

namespace defaults = openmix::mixer_runtime_config_defaults;

int g_graphicsOverlayWidth = defaults::kDefaultGraphicsOverlayWidth;
int g_graphicsOverlayHeight = defaults::kDefaultGraphicsOverlayHeight;
int g_monitorActiveIntervalMs = 1000 / defaults::kDefaultMonitorActiveFps;
int g_monitorIdleIntervalMs = 1000 / defaults::kDefaultMonitorIdleFps;
int g_monitorActiveFps = defaults::kDefaultMonitorActiveFps;
int g_monitorIdleFps = defaults::kDefaultMonitorIdleFps;
int g_webrtcReceiveLatencyMs = defaults::kDefaultWebrtcReceiveLatencyMs;
int g_webrtcRtpQueueBuffers = defaults::kDefaultWebrtcRtpQueueBuffers;
int g_webrtcRtpQueueTimeMs = defaults::kDefaultWebrtcRtpQueueTimeMs;
std::string g_webrtcJitterBufferMode = "default";
int g_webrtcJitterBufferModeValue = -1;
bool g_webrtcRxStatsEnabled = false;
bool g_webrtcRtpDirectSinkEnabled = false;
int g_webrtcRxStatsIntervalMs = 1000;
bool g_syncBufferEnabled = true;
bool g_syncBufferStatsEnabled = false;
bool g_syncBufferNtpEnabled = true;
bool g_syncBufferNtpApplyEnabled = false;
bool g_syncBufferRetimerEnabled = true;
bool g_syncBufferClockGateEnabled = false;
bool g_recordingAudioEnabled = false;
int g_syncBufferLatencyMs = defaults::kDefaultSyncBufferLatencyMs;
int g_syncBufferMaxBuffers = defaults::kDefaultSyncBufferMaxBuffers;
int g_syncBufferMaxTimeMs = defaults::kDefaultSyncBufferMaxTimeMs;
int g_syncBufferNtpMaxDelayMs = defaults::kDefaultSyncBufferNtpMaxDelayMs;
int g_syncBufferNtpMinStepMs = defaults::kDefaultSyncBufferNtpMinStepMs;
int g_syncBufferNtpAdjustIntervalMs = defaults::kDefaultSyncBufferNtpAdjustIntervalMs;
int g_syncBufferNtpMaxStepMs = defaults::kDefaultSyncBufferNtpMaxStepMs;
int g_syncBufferMinPeers = defaults::kDefaultSyncBufferMinPeers;
int g_recordingAudioDelayMs = defaults::kDefaultRecordingAudioDelayMs;
std::string g_recordingAudioSourceName = "osxaudiosrc";
GraphicsOverlayPumpMode g_graphicsOverlayPumpMode = GRAPHICS_OVERLAY_PUMP_ACTIVE;
bool g_graphicsOverlayBranchesEnabled = true;
MonitorIpcMode g_monitorIpcMode = MONITOR_IPC_BOTH;
MonitorInputMode g_monitorInputMode = MONITOR_INPUTS_BOTH;
bool g_thumbnailsEnabled = true;
bool g_multiviewEnabled = true;
bool g_multiviewHudEnabled = true;
bool g_multiviewActiveSlotsEnabled = true;
MultiviewBarsMode g_multiviewBarsMode = MULTIVIEW_BARS_LIVE;
bool g_multiviewStaticBarsOverlayEnabled = false;
bool g_multiviewBarsCacheEnabled = false;
int g_multiviewSourceFps = 15;
bool g_combinedMonitorEnabled = false;
bool g_webrtcMonitorBranchEnabled = true;
bool g_webrtcDecodeBranchEnabled = true;
bool g_webrtcStandaloneRxEnabled = false;
bool g_monitorCompositorsEnabled = true;
bool g_monitorCallbacksEnabled = true;
bool g_nativeMonitorWindowsEnabled = false;
bool g_nativeMonitorSinkSyncEnabled = false;
bool g_realtimeDiagnosticLogsEnabled = true;
bool g_pliReserveThreadEnabled = false;
bool g_localVideoPrewarmEnabled = true;
bool g_stutterTraceEnabled = false;
bool g_h264KeyframeTraceEnabled = false;
bool g_rtpTimelineTraceEnabled = false;
bool g_rtpTimelineSummaryEnabled = false;
const char* g_nativeMonitorSinkFactory = "osxvideosink";
MonitorRendererMode g_monitorRendererMode = MONITOR_RENDERER_COMPOSITOR;
MonitorCompositorBackend g_monitorCompositorBackend = MONITOR_COMPOSITOR_BACKEND_CPU;
bool g_monitorGlZeroCopyEnabled = false;
MonitorCompositorFormatMode g_monitorCompositorFormatMode =
  MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420;
WebRTCMonitorNormalizeMode g_webrtcMonitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_DEFERRED;

bool is_ab_compositor_monitor_renderer()
{
  return g_monitorRendererMode == MONITOR_RENDERER_AB_COMPOSITOR;
}

bool uses_selector_monitor_inputs()
{
  return g_monitorRendererMode == MONITOR_RENDERER_SELECTOR ||
    g_monitorRendererMode == MONITOR_RENDERER_AB_COMPOSITOR;
}

bool uses_gl_monitor_compositor_backend()
{
  return g_monitorCompositorBackend == MONITOR_COMPOSITOR_BACKEND_GL;
}

void configure_mixer_runtime_from_env()
{
  namespace runtime_config = openmix::mixer_runtime_config;

  runtime_config::configure_monitor_frame_intervals();
  runtime_config::configure_realtime_diagnostic_logs_mode();
  runtime_config::configure_stutter_trace_mode();
  runtime_config::configure_h264_keyframe_trace_mode();
  runtime_config::configure_rtp_timeline_trace_mode();
  runtime_config::configure_native_monitor_sink_sync_mode();
  runtime_config::configure_graphics_overlay_raster();
  runtime_config::configure_graphics_overlay_pump_mode();
  runtime_config::configure_graphics_overlay_branches_mode();
  runtime_config::configure_monitor_ipc_mode();
  runtime_config::configure_monitor_input_mode();
  runtime_config::configure_thumbnail_mode();
  runtime_config::configure_multiview_mode();
  runtime_config::configure_multiview_hud_mode();
  runtime_config::configure_multiview_active_slots_mode();
  runtime_config::configure_multiview_bars_mode();
  runtime_config::configure_multiview_bars_cache_mode();
  runtime_config::configure_multiview_source_fps();
  runtime_config::configure_combined_monitor_mode();
  runtime_config::configure_webrtc_monitor_branch_mode();
  runtime_config::configure_webrtc_decode_branch_mode();
  runtime_config::configure_webrtc_rtp_direct_sink_mode();
  runtime_config::configure_webrtc_standalone_rx_mode();
  runtime_config::configure_webrtc_receive_latency();
  runtime_config::configure_webrtc_rtp_queue_limits();
  runtime_config::configure_webrtc_jitterbuffer_mode();
  runtime_config::configure_webrtc_rx_stats_mode();
  runtime_config::configure_webrtc_monitor_normalize_mode();
  runtime_config::configure_sync_buffer_mode();
  runtime_config::configure_recording_audio_mode();
  runtime_config::configure_monitor_compositors_mode();
  runtime_config::configure_monitor_callbacks_mode();
  runtime_config::configure_pli_reserve_thread_mode();
  runtime_config::configure_local_video_prewarm_mode();
  runtime_config::configure_monitor_renderer_mode();
  runtime_config::configure_monitor_compositor_backend_mode();
  runtime_config::configure_monitor_compositor_format_mode();
  runtime_config::configure_native_monitor_windows_mode();
  runtime_config::configure_monitor_gl_zero_copy_mode();
}
