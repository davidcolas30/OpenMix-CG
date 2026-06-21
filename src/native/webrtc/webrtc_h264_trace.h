#pragma once

#include <gst/gst.h>

struct WebRtcH264TraceContext {
  bool* stutterTraceEnabled = nullptr;
  bool* h264KeyframeTraceEnabled = nullptr;
};

void set_webrtc_h264_trace_context(const WebRtcH264TraceContext& context);

GstPadProbeReturn on_webrtc_h264_parse_src_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);
