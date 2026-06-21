#include "gstreamer_addon_exports.h"

#include "graphics_overlay_controls.h"
#include "graphics_overlay_frame.h"
#include "local_video_controls.h"
#include "mixer_control_actions.h"
#include "mixer_pipeline_creation.h"
#include "mixer_pipeline_lifecycle.h"
#include "monitor_webrtc_controls.h"
#include "native_monitor_controls.h"
#include "recording_controls.h"
#include "webrtc_peer_controls.h"

Napi::Object register_gstreamer_addon_exports(
  Napi::Env env,
  Napi::Object exports,
  Napi::Function initializeFunction)
{
  exports.Set("initialize", initializeFunction);
  exports.Set("createMixerPipeline",
    Napi::Function::New(env, create_mixer_pipeline_control));
  exports.Set("startPipeline",
    Napi::Function::New(env, start_pipeline_control));
  exports.Set("stopPipeline",
    Napi::Function::New(env, stop_pipeline_control));
  exports.Set("destroyPipeline",
    Napi::Function::New(env, destroy_pipeline_control));
  exports.Set("setProgramSource",
    Napi::Function::New(env, set_program_source_control));
  exports.Set("setPreviewSource",
    Napi::Function::New(env, set_preview_source_control));
  exports.Set("cut",
    Napi::Function::New(env, cut_control));
  exports.Set("autoTransition",
    Napi::Function::New(env, auto_transition_control));
  exports.Set("getMixerState",
    Napi::Function::New(env, get_mixer_state_control));

  exports.Set("loadLocalVideoSource",
    Napi::Function::New(env, load_local_video_source));
  exports.Set("clearLocalVideoSource",
    Napi::Function::New(env, clear_local_video_source));
  exports.Set("restartLocalVideoSource",
    Napi::Function::New(env, restart_local_video_source));
  exports.Set("setLocalVideoPaused",
    Napi::Function::New(env, set_local_video_paused));
  exports.Set("setLocalVideoLoop",
    Napi::Function::New(env, set_local_video_loop));

  exports.Set("setProgramRecordingEnabled",
    Napi::Function::New(env, set_program_recording_enabled));
  exports.Set("startProgramRecording",
    Napi::Function::New(env, start_program_recording));
  exports.Set("stopProgramRecording",
    Napi::Function::New(env, stop_program_recording));
  exports.Set("setRecordingAudioDelayMs",
    Napi::Function::New(env, set_recording_audio_delay_ms));
  exports.Set("getRecordingAudioState",
    Napi::Function::New(env, get_recording_audio_state));

  exports.Set("pushGraphicsOverlayFrame",
    Napi::Function::New(env, push_graphics_overlay_frame));
  exports.Set("setGraphicsOverlayEnabled",
    Napi::Function::New(env, set_graphics_overlay_enabled_control));

  exports.Set("setNativeMonitorWindowHandle",
    Napi::Function::New(env, set_native_monitor_window_handle));
  exports.Set("setNativeMonitorVisible",
    Napi::Function::New(env, set_native_monitor_visible));

  exports.Set("createWebRTCPeer",
    Napi::Function::New(env, create_webrtc_peer_control));
  exports.Set("setRemoteOffer",
    Napi::Function::New(env, set_webrtc_remote_offer_control));
  exports.Set("addRemoteIceCandidate",
    Napi::Function::New(env, add_webrtc_remote_ice_candidate_control));
  exports.Set("removeWebRTCPeer",
    Napi::Function::New(env, remove_webrtc_peer_control));

  exports.Set("startPreviewMonitorWebRTC",
    Napi::Function::New(env, start_preview_monitor_webrtc_control));
  exports.Set("addPreviewMonitorIceCandidate",
    Napi::Function::New(env, add_preview_monitor_ice_candidate_control));
  exports.Set("stopPreviewMonitorWebRTC",
    Napi::Function::New(env, stop_preview_monitor_webrtc_control));
  exports.Set("startProgramMonitorWebRTC",
    Napi::Function::New(env, start_program_monitor_webrtc_control));
  exports.Set("addProgramMonitorIceCandidate",
    Napi::Function::New(env, add_program_monitor_ice_candidate_control));
  exports.Set("stopProgramMonitorWebRTC",
    Napi::Function::New(env, stop_program_monitor_webrtc_control));
  exports.Set("startCombinedMonitorWebRTC",
    Napi::Function::New(env, start_combined_monitor_webrtc_control));
  exports.Set("addCombinedMonitorIceCandidate",
    Napi::Function::New(env, add_combined_monitor_ice_candidate_control));
  exports.Set("stopCombinedMonitorWebRTC",
    Napi::Function::New(env, stop_combined_monitor_webrtc_control));
  exports.Set("startMultiviewMonitorWebRTC",
    Napi::Function::New(env, start_multiview_monitor_webrtc_control));
  exports.Set("addMultiviewMonitorIceCandidate",
    Napi::Function::New(env, add_multiview_monitor_ice_candidate_control));
  exports.Set("stopMultiviewMonitorWebRTC",
    Napi::Function::New(env, stop_multiview_monitor_webrtc_control));

  return exports;
}
