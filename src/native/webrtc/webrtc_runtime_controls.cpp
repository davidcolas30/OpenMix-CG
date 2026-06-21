#include "webrtc_runtime_controls.h"

#include "local_video_source.h"
#include "webrtc_peer_controls.h"

namespace {

WebRtcRuntimeControlsContext g_context;

int current_int(const int* value, int fallback = 0)
{
  return value ? *value : fallback;
}

bool current_bool(const bool* value, bool fallback = false)
{
  return value ? *value : fallback;
}

} // namespace

void set_webrtc_runtime_controls_context(
  const WebRtcRuntimeControlsContext& context)
{
  g_context = context;
}

WebRtcPeerLifecycleContext make_webrtc_runtime_peer_lifecycle_context()
{
  WebRtcPeerLifecycleContext context;
  context.sourceCount = g_context.sourceCount;
  context.firstWebrtcSourceIndex = g_context.firstWebrtcSourceIndex;
  context.standaloneRxEnabled = g_context.standaloneRxEnabled;
  context.pliReserveThreadEnabled = g_context.pliReserveThreadEnabled;
  context.receiveLatencyMs = g_context.receiveLatencyMs;
  context.rxStatsEnabled = g_context.rxStatsEnabled;
  context.rxStatsIntervalMs = g_context.rxStatsIntervalMs;
  context.pipeline = g_context.pipeline;
  context.webrtcSelectors = g_context.webrtcSelectors;
  context.webrtcRecordingSelectors = g_context.webrtcRecordingSelectors;
  context.rtpTimelineDiagnostics = g_context.webrtcRtpTimelineDiagnostics;
  context.peers = g_context.peers;
  context.peersMutex = g_context.peersMutex;
  context.activePeerCount = g_context.activePeerCount;
  context.rxStatsRunning = g_context.rxStatsRunning;
  context.rxStatsThread = g_context.rxStatsThread;
  context.setSourceActive = g_context.setSourceActive;
  context.setSlotToFallback = g_context.setSlotToFallback;
  context.unmarkDecodedPeer = g_context.unmarkDecodedPeer;
  return context;
}

WebRtcH264BranchContext make_webrtc_runtime_h264_branch_context()
{
  WebRtcH264BranchContext context;
  context.sourceCount = g_context.sourceCount;
  context.monitorWidth = current_int(g_context.monitorWidth);
  context.monitorHeight = current_int(g_context.monitorHeight);
  context.internalWidth = g_context.internalWidth;
  context.internalHeight = g_context.internalHeight;
  context.frameRateNum = g_context.frameRateNum;
  context.frameRateDen = g_context.frameRateDen;
  context.recordingRawQueueBuffers = g_context.recordingRawQueueBuffers;
  context.syncBufferLatencyMs = g_context.syncBufferLatencyMs;
  context.webrtcRtpQueueBuffers = g_context.webrtcRtpQueueBuffers;
  context.webrtcRtpQueueTimeMs = g_context.webrtcRtpQueueTimeMs;
  context.programSource = current_int(g_context.programSource);
  context.syncBufferEnabled = g_context.syncBufferEnabled;
  context.webrtcDecodeBranchEnabled = g_context.webrtcDecodeBranchEnabled;
  context.webrtcMonitorBranchEnabled = g_context.webrtcMonitorBranchEnabled;
  context.programRecordingEnabled = current_bool(g_context.programRecordingEnabled);
  context.stutterTraceEnabled = g_context.stutterTraceEnabled;
  context.h264KeyframeTraceEnabled = g_context.h264KeyframeTraceEnabled;
  context.monitorNormalizeMode = g_context.monitorNormalizeMode;
  context.webrtcRtpDiagnostics = g_context.webrtcRtpDiagnostics;
  context.webrtcEncodedDiagnostics = g_context.webrtcEncodedDiagnostics;
  context.webrtcDecodedDiagnostics = g_context.webrtcDecodedDiagnostics;
  context.webrtcMonitorOutDiagnostics = g_context.webrtcMonitorOutDiagnostics;
  context.webrtcRtpTimelineDiagnostics = g_context.webrtcRtpTimelineDiagnostics;
  context.h264ParseSrcProbe = g_context.h264ParseSrcProbe;
  context.sourceMatchesRecordingKeepWarmSelection =
    g_context.sourceMatchesRecordingKeepWarmSelection;
  context.linkBranchesToMixerSelectors = g_context.linkBranchesToMixerSelectors;
  context.setSourceActive = g_context.setSourceActive;
  return context;
}

void configure_webrtc_peer_controls_from_runtime()
{
  set_webrtc_peer_controls_context(make_webrtc_runtime_peer_lifecycle_context());
}

void set_webrtc_runtime_recording_branches_for_sources(
  bool enabled,
  int firstSource,
  int secondSource)
{
  if (!g_context.peersMutex || !g_context.peers ||
      !g_context.sourceMatchesRecordingKeepWarmSelection) {
    return;
  }

  std::lock_guard<std::mutex> webrtcLock(*g_context.peersMutex);

  for (const auto& entry : *g_context.peers) {
    WebRTCPeer* peer = entry.second;
    if (peer && peer->recordingBranchValve) {
      const bool shouldKeepOpen =
        enabled &&
        g_context.sourceMatchesRecordingKeepWarmSelection(
          peer->mixerSourceIndex,
          firstSource,
          secondSource);
      g_object_set(peer->recordingBranchValve, "drop", shouldKeepOpen ? FALSE : TRUE, NULL);
    }
  }

  if (!g_context.localVideoSources) {
    return;
  }

  for (int i = g_context.firstWebrtcSourceIndex; i < g_context.sourceCount; i++) {
    LocalVideoSource* source = g_context.localVideoSources[i];
    if (source && source->recordingBranchValve) {
      const bool shouldKeepOpen =
        enabled &&
        g_context.sourceMatchesRecordingKeepWarmSelection(
          source->sourceIndex,
          firstSource,
          secondSource);
      g_object_set(source->recordingBranchValve, "drop", shouldKeepOpen ? FALSE : TRUE, NULL);
    }
  }
}
