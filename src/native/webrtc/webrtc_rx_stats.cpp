#include "webrtc_rx_stats.h"

#include "gst_utils.h"
#include "mixer_runtime_config.h"
#include "webrtc_utils.h"

#include <algorithm>
#include <chrono>
#include <cstdio>

void apply_webrtc_jitterbuffer_mode(
  GstElement* jitterBuffer,
  const char* peerLabel,
  const char* context,
  bool logWhenAlreadyApplied)
{
  if (!jitterBuffer) {
    return;
  }

  /*
   * El modo del jitterbuffer es una guarda de diagnostico. Se resuelve aqui
   * tambien para que los logs de RX demuestren que el proceso ve realmente la
   * variable de entorno, sin tocar la ruta de media ni depender del caller.
   */
  resolve_webrtc_jitterbuffer_mode_from_env();

  if (g_webrtcJitterBufferModeValue < 0) {
    if (logWhenAlreadyApplied) {
      printf("[WebRTC] Jitterbuffer de %s mantiene modo default (%s, env=%s)\n",
        peerLabel,
        context,
        g_getenv("OPENMIX_WEBRTC_JITTERBUFFER_MODE")
          ? g_getenv("OPENMIX_WEBRTC_JITTERBUFFER_MODE")
          : "unset");
    }
    return;
  }

  gint previousMode = -1;
  g_object_get(G_OBJECT(jitterBuffer), "mode", &previousMode, NULL);

  if (previousMode != g_webrtcJitterBufferModeValue) {
    g_object_set(G_OBJECT(jitterBuffer), "mode", g_webrtcJitterBufferModeValue, NULL);
  }

  gint actualMode = -1;
  g_object_get(G_OBJECT(jitterBuffer), "mode", &actualMode, NULL);

  if (logWhenAlreadyApplied ||
      previousMode != g_webrtcJitterBufferModeValue ||
      actualMode != g_webrtcJitterBufferModeValue) {
    printf("[WebRTC] Jitterbuffer de %s configurado (%s): mode=%s "
           "requested=%d previous=%d actual=%d env=%s\n",
      peerLabel,
      context,
      g_webrtcJitterBufferMode.c_str(),
      g_webrtcJitterBufferModeValue,
      previousMode,
      actualMode,
      g_getenv("OPENMIX_WEBRTC_JITTERBUFFER_MODE")
        ? g_getenv("OPENMIX_WEBRTC_JITTERBUFFER_MODE")
        : "unset");
  }
}

static void log_webrtc_rx_stats_snapshot(const WebRtcRxStatsSnapshot& snapshot)
{
  for (size_t i = 0; i < snapshot.jitterBuffers.size(); i++) {
    GstElement* jitterBuffer = snapshot.jitterBuffers[i];
    if (!jitterBuffer) {
      continue;
    }

    gchar* elementName = gst_element_get_name(jitterBuffer);
    GstPad* sinkPad = gst_element_get_static_pad(jitterBuffer, "sink");
    guint32 statsClockRate = 0;
    std::string mediaLabel = describe_rtp_pad_caps(sinkPad, &statsClockRate);
    if (sinkPad) {
      gst_object_unref(sinkPad);
    }

    apply_webrtc_jitterbuffer_mode(
      jitterBuffer,
      snapshot.peerId.c_str(),
      "rx-stats",
      false);

    std::string stats = read_structure_property(G_OBJECT(jitterBuffer), "stats");
    std::string latency = read_numeric_or_bool_property(G_OBJECT(jitterBuffer), "latency");
    std::string percent = read_numeric_or_bool_property(G_OBJECT(jitterBuffer), "percent");
    std::string mode = read_numeric_or_bool_property(G_OBJECT(jitterBuffer), "mode");
    std::string dropOnLatency =
      read_numeric_or_bool_property(G_OBJECT(jitterBuffer), "drop-on-latency");

    printf("[WebRTC RX] %s fuente=%d jitterbuffer=%s#%zu %s latency=%sms "
           "percent=%s mode=%s drop-on-latency=%s stats=%s\n",
      snapshot.peerId.c_str(),
      snapshot.mixerSourceIndex,
      elementName ? elementName : "rtpjitterbuffer",
      i,
      mediaLabel.c_str(),
      latency.c_str(),
      percent.c_str(),
      mode.c_str(),
      dropOnLatency.c_str(),
      stats.c_str());

    g_free(elementName);
    gst_object_unref(jitterBuffer);
  }
}

static void poll_webrtc_rx_stats(
  std::atomic<bool>& running,
  int intervalMs,
  WebRtcRxStatsSnapshotCollector snapshotCollector)
{
  while (running.load()) {
    int waitedMs = 0;
    while (running.load() && waitedMs < intervalMs) {
      const int sleepMs = std::min(100, intervalMs - waitedMs);
      std::this_thread::sleep_for(std::chrono::milliseconds(sleepMs));
      waitedMs += sleepMs;
    }
    if (!running.load()) {
      break;
    }

    for (const auto& snapshot : snapshotCollector()) {
      log_webrtc_rx_stats_snapshot(snapshot);
    }
  }
}

void start_webrtc_rx_stats_thread(
  bool enabled,
  int intervalMs,
  std::atomic<bool>& running,
  std::thread& thread,
  WebRtcRxStatsSnapshotCollector snapshotCollector)
{
  if (!enabled || running.load()) {
    return;
  }

  running = true;
  thread = std::thread(
    poll_webrtc_rx_stats,
    std::ref(running),
    intervalMs,
    std::move(snapshotCollector));
  printf("[WebRTC RX] Hilo de stats de recepcion arrancado\n");
}

void join_webrtc_rx_stats_thread_after_unlock(std::thread& thread)
{
  if (thread.joinable()) {
    thread.join();
    printf("[WebRTC RX] Hilo de stats de recepcion detenido\n");
  }
}
