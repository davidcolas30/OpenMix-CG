#include "webrtc_peer_lifecycle.h"

#include <gst/sdp/sdp.h>
#include <gst/webrtc/webrtc.h>

#include <cstdio>
#include <utility>

#include "monitor_diagnostics.h"
#include "webrtc_jitterbuffer_hooks.h"
#include "webrtc_media_dispatch.h"
#include "webrtc_pli_reserve.h"
#include "webrtc_rx_stats.h"
#include "webrtc_signaling_callbacks.h"

namespace {

GstElement* current_pipeline(const WebRtcPeerLifecycleContext& context)
{
  return context.pipeline ? *context.pipeline : nullptr;
}

std::vector<WebRtcRxStatsSnapshot> collect_webrtc_rx_stats_snapshots(
  const WebRtcPeerLifecycleContext& context)
{
  std::vector<WebRtcRxStatsSnapshot> snapshots;
  if (!context.peers || !context.peersMutex) {
    return snapshots;
  }

  std::lock_guard<std::mutex> webrtcLock(*context.peersMutex);
  for (const auto& entry : *context.peers) {
    WebRTCPeer* peer = entry.second;
    if (!peer || peer->destroyed) {
      continue;
    }

    WebRtcRxStatsSnapshot snapshot;
    snapshot.peerId = peer->peerId;
    snapshot.mixerSourceIndex = peer->mixerSourceIndex;

    {
      std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
      for (GstElement* jitterBuffer : peer->rtpJitterBuffers) {
        if (jitterBuffer) {
          gst_object_ref(jitterBuffer);
          snapshot.jitterBuffers.push_back(jitterBuffer);
        }
      }
    }

    if (!snapshot.jitterBuffers.empty()) {
      snapshots.push_back(std::move(snapshot));
    }
  }
  return snapshots;
}

void start_webrtc_rx_stats_thread_if_needed(const WebRtcPeerLifecycleContext& context)
{
  if (!context.rxStatsRunning || !context.rxStatsThread) {
    return;
  }

  start_webrtc_rx_stats_thread(
    context.rxStatsEnabled,
    context.rxStatsIntervalMs,
    *context.rxStatsRunning,
    *context.rxStatsThread,
    [context]() {
      return collect_webrtc_rx_stats_snapshots(context);
    });
}

void stop_webrtc_rx_stats_thread_after_unlock(const WebRtcPeerLifecycleContext& context)
{
  if (context.rxStatsThread) {
    join_webrtc_rx_stats_thread_after_unlock(*context.rxStatsThread);
  }
}

void update_active_peer_count_locked(const WebRtcPeerLifecycleContext& context)
{
  if (context.activePeerCount && context.peers) {
    context.activePeerCount->store(static_cast<int>(context.peers->size()));
  }
}

bool mark_rx_stats_should_stop_if_no_peers_locked(const WebRtcPeerLifecycleContext& context)
{
  if (!context.peers || !context.rxStatsRunning) {
    return false;
  }

  const bool shouldStop = context.peers->empty() && context.rxStatsRunning->load();
  if (shouldStop) {
    *context.rxStatsRunning = false;
  }
  return shouldStop;
}

void release_peer_control_callbacks(WebRTCPeer* peer)
{
  if (!peer) {
    return;
  }
  peer->onAnswerTsfn.Release();
  peer->onIceCandidateTsfn.Release();
}

void remove_peer_from_registry_locked(
  const WebRtcPeerLifecycleContext& context,
  std::map<std::string, WebRTCPeer*>::iterator it)
{
  if (!context.peers) {
    return;
  }
  context.peers->erase(it);
  update_active_peer_count_locked(context);
}

} // namespace

Napi::Value create_webrtc_peer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context)
{
  Napi::Env env = info.Env();

  if (info.Length() < 4 ||
      !info[0].IsString() || !info[1].IsNumber() ||
      !info[2].IsFunction() || !info[3].IsFunction()) {
    Napi::Error::New(env,
      "createWebRTCPeer(peerId: string, sourceIndex: number, onAnswer: fn, onIceCandidate: fn)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string peerId = info[0].As<Napi::String>().Utf8Value();
  int mixerSourceIndex = info[1].As<Napi::Number>().Int32Value();

  if (mixerSourceIndex < context.firstWebrtcSourceIndex ||
      mixerSourceIndex >= context.sourceCount) {
    Napi::Error::New(env, "Índice de fuente WebRTC fuera de rango")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GstElement* pipeline = current_pipeline(context);
  if (!context.standaloneRxEnabled && !pipeline) {
    Napi::Error::New(env, "No hay mixer pipeline activo para recibir peers WebRTC")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!context.standaloneRxEnabled &&
      (!context.webrtcSelectors || !context.webrtcRecordingSelectors ||
       !context.webrtcSelectors[mixerSourceIndex] ||
       !context.webrtcRecordingSelectors[mixerSourceIndex])) {
    Napi::Error::New(env, "La fuente WebRTC solicitada no está disponible en el mixer")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!context.peers || !context.peersMutex) {
    Napi::Error::New(env, "Registro WebRTC no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*context.peersMutex);

  if (context.peers->count(peerId)) {
    Napi::Error::New(env, "Ya existe un peer con ID: " + peerId)
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  WebRTCPeer* peer = new WebRTCPeer();
  peer->peerId = peerId;
  peer->destroyed = false;
  peer->mixerSourceIndex = mixerSourceIndex;
  peer->standalonePipeline = context.standaloneRxEnabled;
  peer->mixerSelector = context.standaloneRxEnabled ? nullptr : context.webrtcSelectors[mixerSourceIndex];
  peer->mixerSelectorPad = nullptr;
  peer->mixerRecordingSelector = context.standaloneRxEnabled
    ? nullptr
    : context.webrtcRecordingSelectors[mixerSourceIndex];
  peer->mixerRecordingSelectorPad = nullptr;
  peer->recordingBranchValve = nullptr;
  peer->syncBufferQueue = nullptr;
  peer->syncBufferClock = nullptr;
  peer->syncBufferCountedAsDecodedPeer = false;
  peer->bridgeFrameCount = 0;
  peer->bridgeLastBufSize = 0;
  peer->bridgeDroppedCorruptCount = 0;
  peer->bridgeDiscontCount = 0;
  peer->bridgePushErrorCount = 0;
  peer->bridgeSamplesSinceLastReport = 0;
  peer->bridgePushedSinceLastReport = 0;
  peer->bridgeLastReportTime = std::chrono::steady_clock::now();
  peer->h264KeyframeTraceCount = 0;
  peer->h264LastKeyframeTraceTime = {};
  peer->syncBufferDiagnostics = SyncBufferDiagnosticsState{};
  peer->hasVideoTrack = false;

  if (context.rtpTimelineDiagnostics &&
      mixerSourceIndex >= 0 &&
      mixerSourceIndex < context.sourceCount) {
    reset_rtp_timeline_diagnostics(context.rtpTimelineDiagnostics[mixerSourceIndex]);
  }

  std::string pipelineName = "webrtc-" + peerId;
  if (context.standaloneRxEnabled) {
    peer->pipeline = gst_pipeline_new(pipelineName.c_str());
  } else {
    peer->pipeline = gst_bin_new(pipelineName.c_str());
    gst_bin_add(GST_BIN(pipeline), peer->pipeline);
  }

  peer->webrtcbin = gst_element_factory_make("webrtcbin", "recv");
  if (!peer->webrtcbin) {
    if (context.standaloneRxEnabled) {
      gst_object_unref(peer->pipeline);
    } else {
      gst_bin_remove(GST_BIN(pipeline), peer->pipeline);
    }
    delete peer;
    Napi::Error::New(env, "No se pudo crear webrtcbin. ¿Está instalado el plugin webrtc?")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_object_set(peer->webrtcbin,
    "stun-server", "stun://stun.l.google.com:19302",
    "latency", static_cast<guint>(context.receiveLatencyMs),
    NULL);

  gst_util_set_object_arg(G_OBJECT(peer->webrtcbin), "bundle-policy", "max-bundle");

  gst_bin_add(GST_BIN(peer->pipeline), peer->webrtcbin);

  g_signal_connect(peer->webrtcbin, "deep-element-added",
    G_CALLBACK(on_webrtc_deep_element_added), peer);
  g_signal_connect(peer->webrtcbin, "on-ice-candidate",
    G_CALLBACK(on_webrtc_ice_candidate), peer);
  g_signal_connect(peer->webrtcbin, "pad-added",
    G_CALLBACK(on_webrtc_pad_added), peer);

  peer->onAnswerTsfn = Napi::ThreadSafeFunction::New(
    env, info[2].As<Napi::Function>(), "WebRTCAnswer-" + peerId, 0, 1);
  peer->onIceCandidateTsfn = Napi::ThreadSafeFunction::New(
    env, info[3].As<Napi::Function>(), "WebRTCIce-" + peerId, 0, 1);

  if (peer->standalonePipeline) {
    gst_element_set_state(peer->pipeline, GST_STATE_PLAYING);
  } else {
    gst_element_sync_state_with_parent(peer->pipeline);
  }

  (*context.peers)[peerId] = peer;
  if (context.activePeerCount) {
    context.activePeerCount->fetch_add(1);
  }
  start_webrtc_rx_stats_thread_if_needed(context);
  start_webrtc_pli_reserve_thread_if_needed(context.pliReserveThreadEnabled);

  printf("[WebRTC] Peer %s creado y pipeline arrancado en %s fuente %d\n",
    peerId.c_str(),
    peer->standalonePipeline ? "standalone" : "mixer",
    mixerSourceIndex);
  return env.Undefined();
}

Napi::Value set_webrtc_remote_offer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::Error::New(env, "setRemoteOffer(peerId: string, sdpString: string)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string peerId = info[0].As<Napi::String>().Utf8Value();
  std::string sdpStr = info[1].As<Napi::String>().Utf8Value();

  if (!context.peers || !context.peersMutex) {
    Napi::Error::New(env, "Registro WebRTC no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*context.peersMutex);

  auto it = context.peers->find(peerId);
  if (it == context.peers->end()) {
    Napi::Error::New(env, "Peer no encontrado: " + peerId)
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  WebRTCPeer* peer = it->second;

  GstSDPMessage* sdpMsg;
  GstSDPResult sdpResult = gst_sdp_message_new(&sdpMsg);
  if (sdpResult != GST_SDP_OK) {
    Napi::Error::New(env, "No se pudo crear GstSDPMessage")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  sdpResult = gst_sdp_message_parse_buffer(
    (const guint8*)sdpStr.c_str(), (guint)sdpStr.size(), sdpMsg);
  if (sdpResult != GST_SDP_OK) {
    gst_sdp_message_free(sdpMsg);
    Napi::Error::New(env, "Error parseando SDP: formato inválido")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GstWebRTCSessionDescription* offer =
    gst_webrtc_session_description_new(GST_WEBRTC_SDP_TYPE_OFFER, sdpMsg);

  GstPromise* setDescPromise = gst_promise_new_with_change_func(
    on_offer_set, peer, NULL);
  g_signal_emit_by_name(peer->webrtcbin, "set-remote-description", offer, setDescPromise);

  gst_webrtc_session_description_free(offer);

  printf("[WebRTC] Remote offer enviada a webrtcbin para %s (esperando callback)...\n",
    peerId.c_str());

  return env.Undefined();
}

Napi::Value add_webrtc_remote_ice_candidate(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context)
{
  Napi::Env env = info.Env();

  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsString()) {
    Napi::Error::New(env,
      "addRemoteIceCandidate(peerId: string, sdpMLineIndex: number, candidate: string)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string peerId = info[0].As<Napi::String>().Utf8Value();
  guint mlineindex = info[1].As<Napi::Number>().Uint32Value();
  std::string candidate = info[2].As<Napi::String>().Utf8Value();

  if (!context.peers || !context.peersMutex) {
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*context.peersMutex);

  auto it = context.peers->find(peerId);
  if (it == context.peers->end()) {
    return env.Undefined();
  }

  WebRTCPeer* peer = it->second;
  g_signal_emit_by_name(peer->webrtcbin, "add-ice-candidate",
    mlineindex, candidate.c_str());

  return env.Undefined();
}

Napi::Value remove_webrtc_peer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context)
{
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::Error::New(env, "removeWebRTCPeer(peerId: string)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string peerId = info[0].As<Napi::String>().Utf8Value();

  if (!context.peers || !context.peersMutex) {
    return env.Undefined();
  }

  std::unique_lock<std::mutex> lock(*context.peersMutex);

  auto it = context.peers->find(peerId);
  if (it == context.peers->end()) {
    return env.Undefined();
  }

  WebRTCPeer* peer = it->second;
  peer->destroyed = true;
  if (context.setSourceActive) {
    context.setSourceActive(peer->mixerSourceIndex, false);
  }

  if (peer->standalonePipeline) {
    gst_element_set_state(peer->pipeline, GST_STATE_NULL);
    if (context.unmarkDecodedPeer) {
      context.unmarkDecodedPeer(peer);
    }
    log_peer_rtp_timeline_summaries(peer);
    release_peer_rtp_jitterbuffers(peer);
    release_peer_control_callbacks(peer);
    gst_object_unref(peer->pipeline);
    remove_peer_from_registry_locked(context, it);
    delete peer;
    const bool shouldJoinPliThread =
      mark_webrtc_pli_reserve_thread_should_stop_if(context.peers->empty());
    const bool shouldJoinRxStatsThread = mark_rx_stats_should_stop_if_no_peers_locked(context);
    lock.unlock();
    if (shouldJoinPliThread) {
      join_webrtc_pli_reserve_thread_after_unlock();
    }
    if (shouldJoinRxStatsThread) {
      stop_webrtc_rx_stats_thread_after_unlock(context);
    }
    printf("[WebRTC] Peer %s standalone eliminado y recursos liberados\n", peerId.c_str());
    return env.Undefined();
  }

  GstElement* pipeline = current_pipeline(context);
  if (!pipeline) {
    if (context.unmarkDecodedPeer) {
      context.unmarkDecodedPeer(peer);
    }
    log_peer_rtp_timeline_summaries(peer);
    release_peer_rtp_jitterbuffers(peer);
    release_peer_control_callbacks(peer);
    remove_peer_from_registry_locked(context, it);
    delete peer;
    const bool shouldJoinRxStatsThread = mark_rx_stats_should_stop_if_no_peers_locked(context);
    lock.unlock();
    if (shouldJoinRxStatsThread) {
      stop_webrtc_rx_stats_thread_after_unlock(context);
    }
    return env.Undefined();
  }

  if (context.setSlotToFallback) {
    context.setSlotToFallback(peer->mixerSourceIndex);
  }
  gst_element_set_state(peer->pipeline, GST_STATE_NULL);
  if (context.unmarkDecodedPeer) {
    context.unmarkDecodedPeer(peer);
  }
  log_peer_rtp_timeline_summaries(peer);

  GstPad* ghostSrcPad = gst_element_get_static_pad(peer->pipeline, "monitor_video_src");
  if (ghostSrcPad) {
    if (peer->mixerSelectorPad) {
      gst_pad_unlink(ghostSrcPad, peer->mixerSelectorPad);
    }
    gst_object_unref(ghostSrcPad);
  }

  GstPad* recordingGhostSrcPad = gst_element_get_static_pad(peer->pipeline, "recording_video_src");
  if (recordingGhostSrcPad) {
    if (peer->mixerRecordingSelectorPad) {
      gst_pad_unlink(recordingGhostSrcPad, peer->mixerRecordingSelectorPad);
    }
    gst_object_unref(recordingGhostSrcPad);
  }

  if (peer->mixerSelectorPad && peer->mixerSelector) {
    gst_element_release_request_pad(peer->mixerSelector, peer->mixerSelectorPad);
    gst_object_unref(peer->mixerSelectorPad);
    peer->mixerSelectorPad = nullptr;
  }

  if (peer->mixerRecordingSelectorPad && peer->mixerRecordingSelector) {
    gst_element_release_request_pad(peer->mixerRecordingSelector, peer->mixerRecordingSelectorPad);
    gst_object_unref(peer->mixerRecordingSelectorPad);
    peer->mixerRecordingSelectorPad = nullptr;
  }

  release_peer_rtp_jitterbuffers(peer);
  release_peer_control_callbacks(peer);

  if (pipeline) {
    gst_bin_remove(GST_BIN(pipeline), peer->pipeline);
  }

  remove_peer_from_registry_locked(context, it);
  delete peer;

  const bool shouldJoinPliThread =
    mark_webrtc_pli_reserve_thread_should_stop_if(context.peers->empty());
  const bool shouldJoinRxStatsThread = mark_rx_stats_should_stop_if_no_peers_locked(context);

  lock.unlock();

  if (shouldJoinPliThread) {
    join_webrtc_pli_reserve_thread_after_unlock();
  }
  if (shouldJoinRxStatsThread) {
    stop_webrtc_rx_stats_thread_after_unlock(context);
  }

  printf("[WebRTC] Peer %s eliminado y recursos liberados\n", peerId.c_str());
  return env.Undefined();
}
