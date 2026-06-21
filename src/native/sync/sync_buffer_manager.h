#pragma once

#include <gst/gst.h>

#include <atomic>
#include <functional>

#include "webrtc_peer.h"

using SyncBufferPeerRunningTimeProvider =
  std::function<GstClockTime(WebRTCPeer*)>;

struct SyncBufferRuntimeContext {
  int sourceCount = 0;
  int frameRateNum = 30;
  int frameRateDen = 1;
  int diagnosticLogIntervalMs = 2000;
  double ntpAgeSmoothingAlpha = 0.08;

  bool* enabled = nullptr;
  bool* statsEnabled = nullptr;
  bool* ntpEnabled = nullptr;
  bool* ntpApplyEnabled = nullptr;
  bool* retimerEnabled = nullptr;
  bool* clockGateEnabled = nullptr;

  int* latencyMs = nullptr;
  int* maxBuffers = nullptr;
  int* maxTimeMs = nullptr;
  int* minPeers = nullptr;
  int* ntpMaxDelayMs = nullptr;
  int* ntpMinStepMs = nullptr;
  int* ntpAdjustIntervalMs = nullptr;
  int* ntpMaxStepMs = nullptr;

  std::atomic<int>* decodedPeerCount = nullptr;
  SyncBufferPeerRunningTimeProvider getPeerRunningTime;
};

void set_sync_buffer_runtime_context(const SyncBufferRuntimeContext& context);

void reset_sync_buffer_ntp_alignment_state();

bool resolve_sync_buffer_ntp_probe_context_media(
  SyncBufferNtpProbeContext* context,
  GstPad* observedPad);

void unmark_peer_decoded_for_sync_buffer_timing(WebRTCPeer* peer);

GstPadProbeReturn on_sync_buffer_ntp_rtp_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

void on_sync_buffer_ntp_handle_sync(
  GstElement* jitterBuffer,
  GstStructure* syncStructure,
  gpointer userData);

GstPadProbeReturn on_sync_buffer_event_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

GstPadProbeReturn on_sync_buffer_prepare_buffer_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

GstPadProbeReturn on_sync_buffer_released_buffer_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

void on_sync_buffer_queue_overrun(GstElement* queue, gpointer userData);
