#pragma once

#include <gst/gst.h>

#include "monitor_diagnostics.h"
#include "webrtc_peer.h"

struct WebRtcJitterbufferHooksContext {
  int sourceCount = 0;
  bool* syncBufferNtpEnabled = nullptr;
  bool* syncBufferStatsEnabled = nullptr;
  bool* webrtcRxStatsEnabled = nullptr;
  bool* rtpTimelineSummaryEnabled = nullptr;
  RtpTimelineDiagnostics* webrtcRtpTimelineDiagnostics = nullptr;
};

/**
 * Hooks asociados a rtpjitterbuffer internos creados por webrtcbin.
 *
 * webrtcbin crea estos elementos dinamicamente, por eso hay que observar la
 * senal deep-element-added en vez de construirlos a mano en la pipeline.
 */
void set_webrtc_jitterbuffer_hooks_context(
  const WebRtcJitterbufferHooksContext& context);

void release_peer_rtp_jitterbuffers(WebRTCPeer* peer);

void log_peer_rtp_timeline_summaries(WebRTCPeer* peer);

void on_webrtc_deep_element_added(
  GstBin* bin,
  GstBin* subBin,
  GstElement* element,
  gpointer user_data);
