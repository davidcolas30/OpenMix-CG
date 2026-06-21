#pragma once

#include <napi.h>
#include <gst/gst.h>
#include <gst/sdp/sdp.h>

struct MonitorWebRtcEndpoint {
  MonitorWebRtcEndpoint() = default;

  MonitorWebRtcEndpoint(
    const char* label,
    const char* startSignature,
    const char* unavailableMessage,
    const char* sdpCreateErrorMessage,
    const char* invalidSdpErrorMessage,
    const char* answerResourceName,
    const char* iceResourceName,
    GstElement** webrtcbin,
    GstElement** outputValve,
    GstElement** h264Pay,
    GstElement** firstInputValve = nullptr,
    GstElement** secondInputValve = nullptr,
    bool requireOfferSetReply = false);

  const char* label = "";
  const char* startSignature = "";
  const char* unavailableMessage = "";
  const char* sdpCreateErrorMessage = "";
  const char* invalidSdpErrorMessage = "";
  const char* answerResourceName = "";
  const char* iceResourceName = "";
  GstElement** webrtcbin = nullptr;
  GstElement** outputValve = nullptr;
  GstElement** h264Pay = nullptr;
  GstElement** inputValves[2] = { nullptr, nullptr };
  bool requireOfferSetReply = false;

  Napi::ThreadSafeFunction answerCallback;
  Napi::ThreadSafeFunction iceCallback;
  bool callbacksReady = false;
  bool signalsConnected = false;
};

Napi::Value start_monitor_webrtc_endpoint(
  const Napi::CallbackInfo& info,
  GstElement* pipeline,
  MonitorWebRtcEndpoint& endpoint);
Napi::Value add_monitor_webrtc_ice_candidate(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint& endpoint);
Napi::Value stop_monitor_webrtc_endpoint(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint& endpoint);
void release_monitor_webrtc_endpoint_callbacks(MonitorWebRtcEndpoint& endpoint);
void reset_monitor_webrtc_endpoint_after_pipeline_destroy(MonitorWebRtcEndpoint& endpoint);
