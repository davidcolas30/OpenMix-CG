#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>

#include "monitor_diagnostics.h"
#include "webrtc_peer.h"

struct WebRtcPeerLifecycleContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 1;
  bool standaloneRxEnabled = false;
  bool pliReserveThreadEnabled = false;
  int receiveLatencyMs = 200;
  bool rxStatsEnabled = false;
  int rxStatsIntervalMs = 1000;

  GstElement** pipeline = nullptr;
  GstElement** webrtcSelectors = nullptr;
  GstElement** webrtcRecordingSelectors = nullptr;
  RtpTimelineDiagnostics* rtpTimelineDiagnostics = nullptr;

  std::map<std::string, WebRTCPeer*>* peers = nullptr;
  std::mutex* peersMutex = nullptr;
  std::atomic<int>* activePeerCount = nullptr;
  std::atomic<bool>* rxStatsRunning = nullptr;
  std::thread* rxStatsThread = nullptr;

  std::function<void(int sourceIndex, bool active)> setSourceActive;
  std::function<void(int sourceIndex)> setSlotToFallback;
  std::function<void(WebRTCPeer* peer)> unmarkDecodedPeer;
};

Napi::Value create_webrtc_peer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context);

Napi::Value set_webrtc_remote_offer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context);

Napi::Value add_webrtc_remote_ice_candidate(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context);

Napi::Value remove_webrtc_peer(
  const Napi::CallbackInfo& info,
  const WebRtcPeerLifecycleContext& context);
