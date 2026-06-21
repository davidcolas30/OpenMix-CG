#pragma once

#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>

#include "monitor_diagnostics.h"
#include "webrtc_h264_branch.h"
#include "webrtc_peer.h"
#include "webrtc_peer_lifecycle.h"

struct LocalVideoSource;

using WebRtcRuntimeSourceActivitySetter =
  std::function<void(int sourceIndex, bool active)>;
using WebRtcRuntimeSlotFallbackSetter =
  std::function<void(int sourceIndex)>;
using WebRtcRuntimeDecodedPeerUnmarker =
  std::function<void(WebRTCPeer* peer)>;
using WebRtcRuntimeSourceMatcher =
  std::function<bool(int sourceIndex, int firstSource, int secondSource)>;
using WebRtcRuntimeBranchLinker =
  std::function<bool(WebRTCPeer* peer, GstElement* monitorOutQueue, GstElement* recordingOutQueue)>;

struct WebRtcRuntimeControlsContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 1;
  int* monitorWidth = nullptr;
  int* monitorHeight = nullptr;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  guint recordingRawQueueBuffers = 8;

  bool standaloneRxEnabled = false;
  bool pliReserveThreadEnabled = false;
  int receiveLatencyMs = 200;
  bool rxStatsEnabled = false;
  int rxStatsIntervalMs = 1000;

  int syncBufferLatencyMs = 0;
  int webrtcRtpQueueBuffers = 0;
  int webrtcRtpQueueTimeMs = 0;
  int* programSource = nullptr;
  bool syncBufferEnabled = false;
  bool webrtcDecodeBranchEnabled = true;
  bool webrtcMonitorBranchEnabled = true;
  bool* programRecordingEnabled = nullptr;
  bool stutterTraceEnabled = false;
  bool h264KeyframeTraceEnabled = false;
  WebRTCMonitorNormalizeMode monitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_DEFERRED;

  GstElement** pipeline = nullptr;
  GstElement** webrtcSelectors = nullptr;
  GstElement** webrtcRecordingSelectors = nullptr;
  NativeMonitorDiagnostics* webrtcRtpDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcEncodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcDecodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcMonitorOutDiagnostics = nullptr;
  RtpTimelineDiagnostics* webrtcRtpTimelineDiagnostics = nullptr;

  std::map<std::string, WebRTCPeer*>* peers = nullptr;
  std::mutex* peersMutex = nullptr;
  std::atomic<int>* activePeerCount = nullptr;
  std::atomic<bool>* rxStatsRunning = nullptr;
  std::thread* rxStatsThread = nullptr;
  LocalVideoSource** localVideoSources = nullptr;

  GstPadProbeCallback h264ParseSrcProbe = nullptr;
  WebRtcRuntimeSourceActivitySetter setSourceActive;
  WebRtcRuntimeSlotFallbackSetter setSlotToFallback;
  WebRtcRuntimeDecodedPeerUnmarker unmarkDecodedPeer;
  WebRtcRuntimeSourceMatcher sourceMatchesRecordingKeepWarmSelection;
  WebRtcRuntimeBranchLinker linkBranchesToMixerSelectors;
};

void set_webrtc_runtime_controls_context(
  const WebRtcRuntimeControlsContext& context);

WebRtcPeerLifecycleContext make_webrtc_runtime_peer_lifecycle_context();
WebRtcH264BranchContext make_webrtc_runtime_h264_branch_context();

void configure_webrtc_peer_controls_from_runtime();

void set_webrtc_runtime_recording_branches_for_sources(
  bool enabled,
  int firstSource,
  int secondSource = -1);
