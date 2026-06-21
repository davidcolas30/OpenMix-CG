#pragma once

namespace openmix::mixer_runtime_config {

void configure_graphics_overlay_raster();
void configure_graphics_overlay_pump_mode();
void configure_graphics_overlay_branches_mode();

void configure_monitor_frame_intervals();
void configure_realtime_diagnostic_logs_mode();
void configure_native_monitor_sink_sync_mode();
void configure_monitor_ipc_mode();
void configure_monitor_input_mode();
void configure_thumbnail_mode();
void configure_combined_monitor_mode();
void configure_monitor_compositors_mode();
void configure_monitor_callbacks_mode();
void configure_monitor_renderer_mode();
void configure_monitor_compositor_backend_mode();
void configure_monitor_compositor_format_mode();
void configure_native_monitor_windows_mode();
void configure_monitor_gl_zero_copy_mode();

void configure_multiview_mode();
void configure_multiview_hud_mode();
void configure_multiview_active_slots_mode();
void configure_multiview_bars_mode();
void configure_multiview_bars_cache_mode();
void configure_multiview_source_fps();

void configure_stutter_trace_mode();
void configure_h264_keyframe_trace_mode();
void configure_rtp_timeline_trace_mode();
void configure_webrtc_monitor_branch_mode();
void configure_webrtc_decode_branch_mode();
void configure_webrtc_rtp_direct_sink_mode();
void configure_webrtc_standalone_rx_mode();
void configure_webrtc_receive_latency();
void configure_webrtc_rtp_queue_limits();
void configure_webrtc_jitterbuffer_mode();
void configure_webrtc_rx_stats_mode();
void configure_webrtc_monitor_normalize_mode();
void configure_sync_buffer_mode();
void configure_pli_reserve_thread_mode();

void configure_local_video_prewarm_mode();
void configure_recording_audio_mode();

} // namespace openmix::mixer_runtime_config
