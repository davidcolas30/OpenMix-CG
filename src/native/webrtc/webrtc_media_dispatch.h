#pragma once

#include <gst/gst.h>

#include <functional>

#include "monitor_diagnostics.h"
#include "webrtc_h264_branch.h"

using WebRtcH264BranchContextProvider =
  std::function<WebRtcH264BranchContext()>;

struct WebRtcMediaDispatchContext {
  int sourceCount = 0;
  bool* rtpDirectSinkEnabled = nullptr;
  bool* stutterTraceEnabled = nullptr;
  bool* decodeBranchEnabled = nullptr;
  NativeMonitorDiagnostics* webrtcRtpDiagnostics = nullptr;
  RtpTimelineDiagnostics* webrtcRtpTimelineDiagnostics = nullptr;
  WebRtcH264BranchContextProvider makeH264BranchContext;
};

/**
 * Dispatcher del pad-added de webrtcbin.
 *
 * Decide si un pad RTP se descarta para diagnostico, si entra por la ruta
 * H.264 explicita o si cae al bridge legacy basado en decodebin.
 */
void set_webrtc_media_dispatch_context(
  const WebRtcMediaDispatchContext& context);

void on_webrtc_pad_added(GstElement* webrtcbin, GstPad* pad, gpointer user_data);
