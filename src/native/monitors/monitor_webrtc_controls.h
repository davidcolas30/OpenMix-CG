#pragma once

#include <napi.h>
#include <gst/gst.h>

#include "monitor_webrtc_endpoint.h"

struct MonitorWebRtcControlsContext {
  GstElement** pipeline = nullptr;
  MonitorWebRtcEndpoint* previewEndpoint = nullptr;
  MonitorWebRtcEndpoint* programEndpoint = nullptr;
  MonitorWebRtcEndpoint* combinedEndpoint = nullptr;
  MonitorWebRtcEndpoint* multiviewEndpoint = nullptr;
};

void set_monitor_webrtc_controls_context(const MonitorWebRtcControlsContext& context);

Napi::Value start_preview_monitor_webrtc_control(const Napi::CallbackInfo& info);
Napi::Value add_preview_monitor_ice_candidate_control(const Napi::CallbackInfo& info);
Napi::Value stop_preview_monitor_webrtc_control(const Napi::CallbackInfo& info);

Napi::Value start_program_monitor_webrtc_control(const Napi::CallbackInfo& info);
Napi::Value add_program_monitor_ice_candidate_control(const Napi::CallbackInfo& info);
Napi::Value stop_program_monitor_webrtc_control(const Napi::CallbackInfo& info);

Napi::Value start_combined_monitor_webrtc_control(const Napi::CallbackInfo& info);
Napi::Value add_combined_monitor_ice_candidate_control(const Napi::CallbackInfo& info);
Napi::Value stop_combined_monitor_webrtc_control(const Napi::CallbackInfo& info);

Napi::Value start_multiview_monitor_webrtc_control(const Napi::CallbackInfo& info);
Napi::Value add_multiview_monitor_ice_candidate_control(const Napi::CallbackInfo& info);
Napi::Value stop_multiview_monitor_webrtc_control(const Napi::CallbackInfo& info);
