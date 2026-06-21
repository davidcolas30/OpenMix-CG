#pragma once

#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <string>
#include <thread>
#include <vector>

struct WebRtcRxStatsSnapshot {
  std::string peerId;
  int mixerSourceIndex = -1;
  std::vector<GstElement*> jitterBuffers;
};

using WebRtcRxStatsSnapshotCollector =
  std::function<std::vector<WebRtcRxStatsSnapshot>()>;

void apply_webrtc_jitterbuffer_mode(
  GstElement* jitterBuffer,
  const char* peerLabel,
  const char* context,
  bool logWhenAlreadyApplied);

void start_webrtc_rx_stats_thread(
  bool enabled,
  int intervalMs,
  std::atomic<bool>& running,
  std::thread& thread,
  WebRtcRxStatsSnapshotCollector snapshotCollector);

void join_webrtc_rx_stats_thread_after_unlock(std::thread& thread);
