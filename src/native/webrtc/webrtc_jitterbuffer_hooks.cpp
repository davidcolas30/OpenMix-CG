#include "webrtc_jitterbuffer_hooks.h"

#include <memory>
#include <mutex>
#include <string>

#include "sync_buffer_manager.h"
#include "webrtc_rx_stats.h"
#include "webrtc_utils.h"

static WebRtcJitterbufferHooksContext g_context;

static bool bool_flag(const bool* value)
{
  return value && *value;
}

static bool is_valid_source_index(int sourceIndex)
{
  return sourceIndex >= 0 && sourceIndex < g_context.sourceCount;
}

void set_webrtc_jitterbuffer_hooks_context(
  const WebRtcJitterbufferHooksContext& context)
{
  g_context = context;
}

void release_peer_rtp_jitterbuffers(WebRTCPeer* peer)
{
  if (!peer) {
    return;
  }

  std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
  for (GstElement* jitterBuffer : peer->rtpJitterBuffers) {
    if (jitterBuffer) {
      gst_object_unref(jitterBuffer);
    }
  }
  peer->rtpJitterBuffers.clear();
  peer->rtpJitterTimelineProbes.clear();
  peer->syncBufferNtpProbeContexts.clear();
}

void log_peer_rtp_timeline_summaries(WebRTCPeer* peer)
{
  if (!peer || !bool_flag(g_context.rtpTimelineSummaryEnabled)) {
    return;
  }

  if (is_valid_source_index(peer->mixerSourceIndex) &&
      g_context.webrtcRtpTimelineDiagnostics) {
    log_rtp_timeline_summary(
      g_context.webrtcRtpTimelineDiagnostics[peer->mixerSourceIndex]);
  }

  std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
  for (const auto& probes : peer->rtpJitterTimelineProbes) {
    if (!probes) {
      continue;
    }
    if (probes->sinkTimeline) {
      log_rtp_timeline_summary(*probes->sinkTimeline);
    }
    if (probes->srcTimeline) {
      log_rtp_timeline_summary(*probes->srcTimeline);
    }
  }
}

void on_webrtc_deep_element_added(
  GstBin* /*bin*/,
  GstBin* /*subBin*/,
  GstElement* element,
  gpointer user_data)
{
  if (!element) {
    return;
  }

  GstElementFactory* factory = gst_element_get_factory(element);
  const gchar* factoryName = factory
    ? gst_plugin_feature_get_name(GST_PLUGIN_FEATURE(factory))
    : nullptr;

  if (!factoryName || g_strcmp0(factoryName, "rtpjitterbuffer") != 0) {
    return;
  }

  auto* peer = static_cast<WebRTCPeer*>(user_data);
  const char* peerLabel = peer ? peer->peerId.c_str() : "peer desconocido";

  apply_webrtc_jitterbuffer_mode(element, peerLabel, "deep-element-added", true);

  if (peer && bool_flag(g_context.syncBufferNtpEnabled)) {
    /*
     * En deep-element-added las caps del rtpjitterbuffer no siempre existen
     * todavia. Si filtrasemos aqui por media=video perderiamos el unico punto
     * donde podemos pedir a GStreamer que exponga RTP/NTP. Por eso registramos
     * todos los jitterbuffers y resolvemos si son video de forma perezosa.
     */
    g_object_set(G_OBJECT(element),
      "add-reference-timestamp-meta", TRUE,
      NULL);

    auto ntpContext = std::make_unique<SyncBufferNtpProbeContext>();
    ntpContext->peer = peer;
    ntpContext->jitterBuffer = element;
    ntpContext->mediaLabel = "media=unknown";
    SyncBufferNtpProbeContext* rawContext = ntpContext.get();

    GstPad* srcPad = gst_element_get_static_pad(element, "src");
    if (srcPad) {
      resolve_sync_buffer_ntp_probe_context_media(rawContext, srcPad);
      gst_pad_add_probe(
        srcPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_sync_buffer_ntp_rtp_probe,
        rawContext,
        nullptr);
      gst_object_unref(srcPad);
    }

    g_signal_connect(element, "handle-sync",
      G_CALLBACK(on_sync_buffer_ntp_handle_sync), rawContext);

    {
      std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
      peer->syncBufferNtpProbeContexts.push_back(std::move(ntpContext));
    }

    if (bool_flag(g_context.syncBufferStatsEnabled)) {
      printf("[SyncBufferNTP] Jitterbuffer NTP candidato registrado para %s\n",
        peerLabel);
    }
  }

  if (peer && should_attach_rtp_timeline_probes() &&
      is_valid_source_index(peer->mixerSourceIndex) &&
      g_context.webrtcRtpTimelineDiagnostics) {
    /*
     * Estos probes estan dentro de webrtcbin: el pad sink observa lo que entra
     * al rtpjitterbuffer y el pad src lo que este entrega. Cada jitterbuffer
     * tiene su propio estado de timeline: si audio y video compartieran estado,
     * mezclar timestamps RTP produciria saltos falsos.
     */
    const gchar* rawElementName = GST_ELEMENT_NAME(element);
    std::string elementName = rawElementName ? rawElementName : "rtpjitterbuffer";

    GstPad* sinkPad = gst_element_get_static_pad(element, "sink");
    guint32 clockRate = 0;
    std::string mediaLabel = describe_rtp_pad_caps(sinkPad, &clockRate);

    auto timelineProbes = std::make_unique<RtpJitterBufferTimelineProbes>();
    timelineProbes->elementName = elementName;
    timelineProbes->mediaLabel = mediaLabel;
    timelineProbes->sinkTimeline = std::make_unique<RtpTimelineDiagnostics>(
      RtpTimelineDiagnostics{
        "WebRTC JBUF sink timeline src=" + std::to_string(peer->mixerSourceIndex) +
          " " + elementName + " " + mediaLabel,
        clockRate,
        false,
        0,
        0,
        0,
        0,
        0,
        0,
        0.0,
        0,
        {},
        {},
        {}
      });
    timelineProbes->srcTimeline = std::make_unique<RtpTimelineDiagnostics>(
      RtpTimelineDiagnostics{
        "WebRTC JBUF src timeline src=" + std::to_string(peer->mixerSourceIndex) +
          " " + elementName + " " + mediaLabel,
        clockRate,
        false,
        0,
        0,
        0,
        0,
        0,
        0,
        0.0,
        0,
        {},
        {},
        {}
      });

    if (sinkPad) {
      gst_pad_add_probe(
        sinkPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_webrtc_rtp_timeline_probe,
        timelineProbes->sinkTimeline.get(),
        nullptr);
      gst_object_unref(sinkPad);
    }

    GstPad* srcPad = gst_element_get_static_pad(element, "src");
    if (srcPad) {
      gst_pad_add_probe(
        srcPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_webrtc_rtp_timeline_probe,
        timelineProbes->srcTimeline.get(),
        nullptr);
      gst_object_unref(srcPad);
    }

    {
      std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
      peer->rtpJitterTimelineProbes.push_back(std::move(timelineProbes));
    }

    printf("[RtpTimeline] Probes jitterbuffer sink/src anadidos para %s (%s, %s)\n",
      peerLabel,
      elementName.c_str(),
      mediaLabel.c_str());
  }

  if (peer && bool_flag(g_context.webrtcRxStatsEnabled)) {
    /*
     * webrtcbin crea rtpjitterbuffer internamente, asi que guardamos una
     * referencia solo bajo diagnostico. El thread de stats lee su propiedad
     * "stats" sin tocar el plano de media ni pasar frames por IPC.
     */
    std::lock_guard<std::mutex> diagnosticsLock(peer->diagnosticsMutex);
    gst_object_ref(element);
    peer->rtpJitterBuffers.push_back(element);
    printf("[WebRTC RX] Jitterbuffer registrado para %s: %s\n",
      peerLabel,
      GST_ELEMENT_NAME(element));
  }
}
