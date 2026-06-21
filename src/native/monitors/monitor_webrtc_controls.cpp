#include "monitor_webrtc_controls.h"

namespace {

MonitorWebRtcControlsContext g_context;

GstElement* current_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

Napi::Value unavailable_endpoint(const Napi::CallbackInfo& info)
{
  Napi::Error::New(info.Env(), "Endpoint WebRTC de monitor no inicializado")
    .ThrowAsJavaScriptException();
  return info.Env().Undefined();
}

Napi::Value start_endpoint(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint* endpoint)
{
  if (!endpoint) {
    return unavailable_endpoint(info);
  }
  return start_monitor_webrtc_endpoint(info, current_pipeline(), *endpoint);
}

Napi::Value add_ice_candidate(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint* endpoint)
{
  if (!endpoint) {
    return unavailable_endpoint(info);
  }
  return add_monitor_webrtc_ice_candidate(info, *endpoint);
}

Napi::Value stop_endpoint(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint* endpoint)
{
  if (!endpoint) {
    return unavailable_endpoint(info);
  }
  return stop_monitor_webrtc_endpoint(info, *endpoint);
}

} // namespace

void set_monitor_webrtc_controls_context(const MonitorWebRtcControlsContext& context)
{
  g_context = context;
}

Napi::Value start_preview_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return start_endpoint(info, g_context.previewEndpoint);
}

Napi::Value add_preview_monitor_ice_candidate_control(const Napi::CallbackInfo& info)
{
  return add_ice_candidate(info, g_context.previewEndpoint);
}

Napi::Value stop_preview_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return stop_endpoint(info, g_context.previewEndpoint);
}

Napi::Value start_program_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return start_endpoint(info, g_context.programEndpoint);
}

Napi::Value add_program_monitor_ice_candidate_control(const Napi::CallbackInfo& info)
{
  return add_ice_candidate(info, g_context.programEndpoint);
}

Napi::Value stop_program_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return stop_endpoint(info, g_context.programEndpoint);
}

Napi::Value start_combined_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return start_endpoint(info, g_context.combinedEndpoint);
}

Napi::Value add_combined_monitor_ice_candidate_control(const Napi::CallbackInfo& info)
{
  return add_ice_candidate(info, g_context.combinedEndpoint);
}

Napi::Value stop_combined_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return stop_endpoint(info, g_context.combinedEndpoint);
}

Napi::Value start_multiview_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return start_endpoint(info, g_context.multiviewEndpoint);
}

Napi::Value add_multiview_monitor_ice_candidate_control(const Napi::CallbackInfo& info)
{
  return add_ice_candidate(info, g_context.multiviewEndpoint);
}

Napi::Value stop_multiview_monitor_webrtc_control(const Napi::CallbackInfo& info)
{
  return stop_endpoint(info, g_context.multiviewEndpoint);
}
