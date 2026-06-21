#pragma once

#include <gst/gst.h>

#include <functional>

#include "mixer_runtime_config.h"
#include "monitor_diagnostics.h"
#include "webrtc_peer.h"

using WebRtcSourceMatcher =
  std::function<bool(int sourceIndex, int firstSource, int secondSource)>;
using WebRtcBranchLinker =
  std::function<bool(WebRTCPeer* peer, GstElement* monitorOutQueue, GstElement* recordingOutQueue)>;
using WebRtcSourceActivitySetter =
  std::function<void(int sourceIndex, bool active)>;

struct WebRtcH264BranchContext {
  int sourceCount = 0;
  int monitorWidth = 0;
  int monitorHeight = 0;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  guint recordingRawQueueBuffers = 8;
  int syncBufferLatencyMs = 0;
  int webrtcRtpQueueBuffers = 0;
  int webrtcRtpQueueTimeMs = 0;
  int programSource = 0;

  bool syncBufferEnabled = false;
  bool webrtcDecodeBranchEnabled = true;
  bool webrtcMonitorBranchEnabled = true;
  bool programRecordingEnabled = false;
  bool stutterTraceEnabled = false;
  bool h264KeyframeTraceEnabled = false;
  WebRTCMonitorNormalizeMode monitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_DEFERRED;

  NativeMonitorDiagnostics* webrtcRtpDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcEncodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcDecodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcMonitorOutDiagnostics = nullptr;
  RtpTimelineDiagnostics* webrtcRtpTimelineDiagnostics = nullptr;

  GstPadProbeCallback h264ParseSrcProbe = nullptr;
  WebRtcSourceMatcher sourceMatchesRecordingKeepWarmSelection;
  WebRtcBranchLinker linkBranchesToMixerSelectors;
  WebRtcSourceActivitySetter setSourceActive;
};

void handle_webrtc_h264_pad_added(
  WebRTCPeer* peer,
  GstPad* pad,
  const char* encodingName,
  const WebRtcH264BranchContext& context);
