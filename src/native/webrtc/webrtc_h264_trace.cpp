#include "webrtc_h264_trace.h"

#include <chrono>
#include <cstdio>

#include "webrtc_peer.h"

namespace {

WebRtcH264TraceContext g_context;

bool is_enabled(const bool* flag)
{
  return flag && *flag;
}

} // namespace

void set_webrtc_h264_trace_context(const WebRtcH264TraceContext& context)
{
  g_context = context;
}

GstPadProbeReturn on_webrtc_h264_parse_src_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  const bool stutterTraceEnabled = is_enabled(g_context.stutterTraceEnabled);
  const bool h264KeyframeTraceEnabled = is_enabled(g_context.h264KeyframeTraceEnabled);

  if ((!stutterTraceEnabled && !h264KeyframeTraceEnabled) ||
      !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  auto* peer = static_cast<WebRTCPeer*>(userData);
  if (!peer || peer->destroyed) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  const bool isKeyframe = !GST_BUFFER_FLAG_IS_SET(buffer, GST_BUFFER_FLAG_DELTA_UNIT);
  if (!isKeyframe) {
    return GST_PAD_PROBE_OK;
  }

  const auto now = std::chrono::steady_clock::now();
  int elapsedSincePreviousMs = 0;
  if (peer->h264LastKeyframeTraceTime.time_since_epoch().count() != 0) {
    elapsedSincePreviousMs = static_cast<int>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
        now - peer->h264LastKeyframeTraceTime).count());
  }
  peer->h264LastKeyframeTraceTime = now;
  peer->h264KeyframeTraceCount += 1;

  printf("[%s] %s H264 keyframe #%d delta=%dms pts=%" GST_TIME_FORMAT "\n",
    stutterTraceEnabled ? "StutterTrace" : "H264Trace",
    peer->peerId.c_str(),
    peer->h264KeyframeTraceCount,
    elapsedSincePreviousMs,
    GST_TIME_ARGS(GST_BUFFER_PTS(buffer)));

  return GST_PAD_PROBE_OK;
}
