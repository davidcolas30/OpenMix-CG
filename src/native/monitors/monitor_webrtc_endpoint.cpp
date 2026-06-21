#include "monitor_webrtc_endpoint.h"

#include "webrtc_utils.h"

#include <cstdio>
#include <string>

MonitorWebRtcEndpoint::MonitorWebRtcEndpoint(
  const char* endpointLabel,
  const char* endpointStartSignature,
  const char* endpointUnavailableMessage,
  const char* endpointSdpCreateErrorMessage,
  const char* endpointInvalidSdpErrorMessage,
  const char* endpointAnswerResourceName,
  const char* endpointIceResourceName,
  GstElement** endpointWebrtcbin,
  GstElement** endpointOutputValve,
  GstElement** endpointH264Pay,
  GstElement** firstInputValve,
  GstElement** secondInputValve,
  bool endpointRequireOfferSetReply)
  : label(endpointLabel),
    startSignature(endpointStartSignature),
    unavailableMessage(endpointUnavailableMessage),
    sdpCreateErrorMessage(endpointSdpCreateErrorMessage),
    invalidSdpErrorMessage(endpointInvalidSdpErrorMessage),
    answerResourceName(endpointAnswerResourceName),
    iceResourceName(endpointIceResourceName),
    webrtcbin(endpointWebrtcbin),
    outputValve(endpointOutputValve),
    h264Pay(endpointH264Pay),
    requireOfferSetReply(endpointRequireOfferSetReply)
{
  inputValves[0] = firstInputValve;
  inputValves[1] = secondInputValve;
}

static GstElement* endpoint_webrtcbin(MonitorWebRtcEndpoint& endpoint)
{
  return endpoint.webrtcbin ? *endpoint.webrtcbin : nullptr;
}

static GstElement* endpoint_output_valve(MonitorWebRtcEndpoint& endpoint)
{
  return endpoint.outputValve ? *endpoint.outputValve : nullptr;
}

static GstElement* endpoint_h264pay(MonitorWebRtcEndpoint& endpoint)
{
  return endpoint.h264Pay ? *endpoint.h264Pay : nullptr;
}

static GstElement* endpoint_input_valve(MonitorWebRtcEndpoint& endpoint, int index)
{
  if (index < 0 || index >= 2 || !endpoint.inputValves[index]) {
    return nullptr;
  }
  return *endpoint.inputValves[index];
}

static bool endpoint_is_available(GstElement* pipeline, MonitorWebRtcEndpoint& endpoint)
{
  if (!pipeline || !endpoint_webrtcbin(endpoint) || !endpoint_output_valve(endpoint)) {
    return false;
  }

  for (GstElement** inputValvePtr : endpoint.inputValves) {
    if (inputValvePtr && !*inputValvePtr) {
      return false;
    }
  }

  return true;
}

void release_monitor_webrtc_endpoint_callbacks(MonitorWebRtcEndpoint& endpoint)
{
  if (!endpoint.callbacksReady) {
    return;
  }

  endpoint.answerCallback.Release();
  endpoint.iceCallback.Release();
  endpoint.callbacksReady = false;
}

void reset_monitor_webrtc_endpoint_after_pipeline_destroy(MonitorWebRtcEndpoint& endpoint)
{
  release_monitor_webrtc_endpoint_callbacks(endpoint);
  endpoint.signalsConnected = false;
}

static void on_monitor_connection_state_notify(
  GObject* object, GParamSpec* /*pspec*/, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  GstWebRTCPeerConnectionState state = GST_WEBRTC_PEER_CONNECTION_STATE_NEW;
  g_object_get(object, "connection-state", &state, nullptr);
  printf("[MonitorWebRTC] Estado %s connection-state=%s\n",
    endpoint ? endpoint->label : "UNKNOWN",
    webrtc_connection_state_label(state));
}

static void on_monitor_ice_connection_state_notify(
  GObject* object, GParamSpec* /*pspec*/, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  GstWebRTCICEConnectionState state = GST_WEBRTC_ICE_CONNECTION_STATE_NEW;
  g_object_get(object, "ice-connection-state", &state, nullptr);
  printf("[MonitorWebRTC] Estado %s ice-connection-state=%s\n",
    endpoint ? endpoint->label : "UNKNOWN",
    webrtc_ice_state_label(state));
}

static void on_monitor_signaling_state_notify(
  GObject* object, GParamSpec* /*pspec*/, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  GstWebRTCSignalingState state = GST_WEBRTC_SIGNALING_STATE_STABLE;
  g_object_get(object, "signaling-state", &state, nullptr);
  printf("[MonitorWebRTC] Estado %s signaling-state=%s\n",
    endpoint ? endpoint->label : "UNKNOWN",
    webrtc_signaling_state_label(state));
}

static void on_monitor_answer_created(GstPromise* promise, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  if (!endpoint || !endpoint_webrtcbin(*endpoint) || !endpoint->callbacksReady) {
    gst_promise_unref(promise);
    return;
  }

  GstPromiseResult result = gst_promise_wait(promise);
  if (result != GST_PROMISE_RESULT_REPLIED) {
    fprintf(stderr, "[MonitorWebRTC] No se pudo crear SDP answer para %s (result=%d)\n",
      endpoint->label,
      static_cast<int>(result));
    gst_promise_unref(promise);
    return;
  }

  const GstStructure* reply = gst_promise_get_reply(promise);
  GstWebRTCSessionDescription* answer = nullptr;
  if (reply) {
    gst_structure_get(reply, "answer",
      GST_TYPE_WEBRTC_SESSION_DESCRIPTION, &answer, nullptr);
  }

  if (!answer) {
    fprintf(stderr, "[MonitorWebRTC] Promise sin answer para %s\n", endpoint->label);
    gst_promise_unref(promise);
    return;
  }

  g_signal_emit_by_name(endpoint_webrtcbin(*endpoint), "set-local-description", answer, nullptr);

  gchar* sdpText = gst_sdp_message_as_text(answer->sdp);
  std::string sdpStr(sdpText ? sdpText : "");
  g_free(sdpText);

  const std::string summaryLabel = std::string("Answer ") + endpoint->label;
  log_sdp_video_summary(summaryLabel.c_str(), sdpStr);

  endpoint->answerCallback.BlockingCall(
    [sdpStr](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object answerObj = Napi::Object::New(env);
      answerObj.Set("type", Napi::String::New(env, "answer"));
      answerObj.Set("sdp", Napi::String::New(env, sdpStr));
      jsCallback.Call({ answerObj });
    }
  );

  printf("[MonitorWebRTC] SDP answer %s enviada a Renderer\n", endpoint->label);

  gst_webrtc_session_description_free(answer);
  gst_promise_unref(promise);
}

static void on_monitor_offer_set(GstPromise* promise, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  GstPromiseResult result = gst_promise_wait(promise);
  gst_promise_unref(promise);

  if (!endpoint || !endpoint_webrtcbin(*endpoint)) {
    return;
  }

  if (result == GST_PROMISE_RESULT_INTERRUPTED) {
    fprintf(stderr, "[MonitorWebRTC] set-remote-description interrumpido para %s\n",
      endpoint->label);
    return;
  }

  if (endpoint->requireOfferSetReply && result != GST_PROMISE_RESULT_REPLIED) {
    fprintf(stderr, "[MonitorWebRTC] Error configurando offer %s (result=%d)\n",
      endpoint->label,
      static_cast<int>(result));
    return;
  }

  GstPromise* answerPromise = gst_promise_new_with_change_func(
    on_monitor_answer_created, endpoint, nullptr);
  g_signal_emit_by_name(endpoint_webrtcbin(*endpoint), "create-answer", nullptr, answerPromise);
}

static void on_monitor_ice_candidate(
  GstElement* /*webrtcbin*/, guint mlineindex, gchar* candidate, gpointer userData)
{
  auto* endpoint = static_cast<MonitorWebRtcEndpoint*>(userData);
  if (!endpoint || !endpoint->callbacksReady) {
    return;
  }

  std::string candidateStr(candidate ? candidate : "");
  guint idx = mlineindex;

  printf("[MonitorWebRTC] ICE local %s: mline=%u %s\n",
    endpoint->label, idx, candidateStr.c_str());

  endpoint->iceCallback.BlockingCall(
    [candidateStr, idx](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object candidateObj = Napi::Object::New(env);
      candidateObj.Set("candidate", Napi::String::New(env, candidateStr));
      candidateObj.Set("sdpMLineIndex", Napi::Number::New(env, idx));
      jsCallback.Call({ candidateObj });
    }
  );
}

static void connect_monitor_webrtc_signals(MonitorWebRtcEndpoint& endpoint)
{
  if (endpoint.signalsConnected) {
    return;
  }

  GstElement* webrtcbin = endpoint_webrtcbin(endpoint);
  if (!webrtcbin) {
    return;
  }

  g_signal_connect(webrtcbin, "on-ice-candidate",
    G_CALLBACK(on_monitor_ice_candidate), &endpoint);
  g_signal_connect(webrtcbin, "notify::connection-state",
    G_CALLBACK(on_monitor_connection_state_notify), &endpoint);
  g_signal_connect(webrtcbin, "notify::ice-connection-state",
    G_CALLBACK(on_monitor_ice_connection_state_notify), &endpoint);
  g_signal_connect(webrtcbin, "notify::signaling-state",
    G_CALLBACK(on_monitor_signaling_state_notify), &endpoint);
  endpoint.signalsConnected = true;
}

Napi::Value start_monitor_webrtc_endpoint(
  const Napi::CallbackInfo& info,
  GstElement* pipeline,
  MonitorWebRtcEndpoint& endpoint)
{
  Napi::Env env = info.Env();

  if (info.Length() < 3 ||
      !info[0].IsString() ||
      !info[1].IsFunction() ||
      !info[2].IsFunction()) {
    Napi::Error::New(env, endpoint.startSignature).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!endpoint_is_available(pipeline, endpoint)) {
    Napi::Error::New(env, endpoint.unavailableMessage).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  release_monitor_webrtc_endpoint_callbacks(endpoint);

  endpoint.answerCallback = Napi::ThreadSafeFunction::New(
    env, info[1].As<Napi::Function>(), endpoint.answerResourceName, 0, 1);
  endpoint.iceCallback = Napi::ThreadSafeFunction::New(
    env, info[2].As<Napi::Function>(), endpoint.iceResourceName, 0, 1);
  endpoint.callbacksReady = true;

  connect_monitor_webrtc_signals(endpoint);

  // El monitor combinado tiene entradas propias al atlas. Las abrimos antes
  // de la salida WebRTC para que el compositor empiece a producir contenido
  // únicamente cuando existe un consumidor local.
  for (int i = 0; i < 2; i++) {
    if (GstElement* inputValve = endpoint_input_valve(endpoint, i)) {
      g_object_set(inputValve, "drop", FALSE, nullptr);
    }
  }
  g_object_set(endpoint_output_valve(endpoint), "drop", FALSE, nullptr);

  const std::string sdpStr = info[0].As<Napi::String>().Utf8Value();
  GstSDPMessage* sdpMsg = nullptr;
  if (gst_sdp_message_new(&sdpMsg) != GST_SDP_OK) {
    Napi::Error::New(env, endpoint.sdpCreateErrorMessage).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GstSDPResult parseResult = gst_sdp_message_parse_buffer(
    reinterpret_cast<const guint8*>(sdpStr.c_str()),
    static_cast<guint>(sdpStr.size()),
    sdpMsg);
  if (parseResult != GST_SDP_OK) {
    gst_sdp_message_free(sdpMsg);
    Napi::Error::New(env, endpoint.invalidSdpErrorMessage).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const int h264PayloadType = find_h264_payload_type_in_offer(sdpMsg);
  GstElement* h264Pay = endpoint_h264pay(endpoint);
  if (h264PayloadType >= 0 && h264Pay) {
    g_object_set(h264Pay, "pt", h264PayloadType, nullptr);
    printf("[MonitorWebRTC] H264 PT ofertado por Renderer para %s: %d\n",
      endpoint.label, h264PayloadType);
  } else {
    printf("[MonitorWebRTC] Offer %s sin H264 compatible; se mantiene PT por defecto\n",
      endpoint.label);
  }

  const std::string summaryLabel = std::string("Offer ") + endpoint.label;
  log_sdp_video_summary(summaryLabel.c_str(), sdpStr);

  GstWebRTCSessionDescription* offer =
    gst_webrtc_session_description_new(GST_WEBRTC_SDP_TYPE_OFFER, sdpMsg);

  GstPromise* setDescPromise = gst_promise_new_with_change_func(
    on_monitor_offer_set, &endpoint, nullptr);
  g_signal_emit_by_name(
    endpoint_webrtcbin(endpoint),
    "set-remote-description",
    offer,
    setDescPromise);
  gst_webrtc_session_description_free(offer);

  printf("[MonitorWebRTC] Offer %s recibida desde Renderer; creando answer...\n",
    endpoint.label);
  return env.Undefined();
}

Napi::Value add_monitor_webrtc_ice_candidate(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint& endpoint)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
    std::string signature = "add";
    signature += endpoint.label;
    signature += "MonitorIceCandidate(sdpMLineIndex: number, candidate: string)";
    Napi::Error::New(env, signature).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GstElement* webrtcbin = endpoint_webrtcbin(endpoint);
  if (!webrtcbin) {
    return env.Undefined();
  }

  guint mlineindex = info[0].As<Napi::Number>().Uint32Value();
  std::string candidate = info[1].As<Napi::String>().Utf8Value();
  g_signal_emit_by_name(webrtcbin, "add-ice-candidate",
    mlineindex, candidate.c_str());

  return env.Undefined();
}

Napi::Value stop_monitor_webrtc_endpoint(
  const Napi::CallbackInfo& info,
  MonitorWebRtcEndpoint& endpoint)
{
  Napi::Env env = info.Env();

  if (GstElement* outputValve = endpoint_output_valve(endpoint)) {
    g_object_set(outputValve, "drop", TRUE, nullptr);
  }
  for (int i = 0; i < 2; i++) {
    if (GstElement* inputValve = endpoint_input_valve(endpoint, i)) {
      g_object_set(inputValve, "drop", TRUE, nullptr);
    }
  }

  release_monitor_webrtc_endpoint_callbacks(endpoint);

  return env.Undefined();
}
