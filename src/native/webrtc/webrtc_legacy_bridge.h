#pragma once

#include <gst/app/gstappsink.h>
#include <gst/gst.h>

struct WebRtcLegacyBridgeContext {
  int* bridgeWidth = nullptr;
  int* bridgeHeight = nullptr;
  int frameRateNum = 30;
  int frameRateDen = 1;
  int diagnosticLogIntervalMs = 2000;
  bool* realtimeDiagnosticLogsEnabled = nullptr;
  void (*setSourceActive)(int sourceIndex, bool active) = nullptr;
};

/**
 * Configura la ruta WebRTC historica basada en decodebin -> appsink.
 *
 * La ruta principal actual usa ramas H.264 explicitas, pero mantenemos este
 * bridge como fallback diagnostico para otros codecs.
 */
void set_webrtc_legacy_bridge_context(const WebRtcLegacyBridgeContext& context);

void on_webrtc_decoded_pad(GstElement* decodebin, GstPad* pad, gpointer user_data);

GstFlowReturn on_webrtc_video_sample(GstAppSink* appsink, gpointer user_data);
