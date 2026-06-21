#include "webrtc_media_dispatch.h"

#include <cstdio>

#include "monitor_diagnostics.h"
#include "webrtc_legacy_bridge.h"
#include "webrtc_peer.h"

static WebRtcMediaDispatchContext g_context;

static bool bool_flag(const bool* value)
{
  return value && *value;
}

static bool is_valid_source_index(int sourceIndex)
{
  return sourceIndex >= 0 && sourceIndex < g_context.sourceCount;
}

void set_webrtc_media_dispatch_context(const WebRtcMediaDispatchContext& context)
{
  g_context = context;
}

static void attach_video_rtp_diagnostics(WebRTCPeer* peer, GstPad* pad)
{
  if (!peer || !pad || !is_valid_source_index(peer->mixerSourceIndex)) {
    return;
  }

  if (bool_flag(g_context.stutterTraceEnabled) &&
      g_context.webrtcRtpDiagnostics) {
    gst_pad_add_probe(
      pad,
      GST_PAD_PROBE_TYPE_BUFFER,
      on_native_monitor_buffer_probe,
      &g_context.webrtcRtpDiagnostics[peer->mixerSourceIndex],
      nullptr);
  }

  if (should_attach_rtp_timeline_probes() &&
      g_context.webrtcRtpTimelineDiagnostics) {
    gst_pad_add_probe(
      pad,
      GST_PAD_PROBE_TYPE_BUFFER,
      on_webrtc_rtp_timeline_probe,
      &g_context.webrtcRtpTimelineDiagnostics[peer->mixerSourceIndex],
      nullptr);
  }
}

static void link_rtp_pad_to_fakesink(
  WebRTCPeer* peer,
  GstPad* pad,
  const char* label)
{
  GstElement* sink = gst_element_factory_make("fakesink", NULL);
  if (!sink) {
    fprintf(stderr, "[WebRTC] Error creando fakesink para %s de %s\n",
      label,
      peer ? peer->peerId.c_str() : "peer desconocido");
    return;
  }

  g_object_set(sink, "sync", FALSE, "async", FALSE, NULL);
  gst_bin_add(GST_BIN(peer->pipeline), sink);
  gst_element_sync_state_with_parent(sink);

  GstPad* sinkpad = gst_element_get_static_pad(sink, "sink");
  GstPadLinkReturn ret = gst_pad_link(pad, sinkpad);
  gst_object_unref(sinkpad);

  if (ret != GST_PAD_LINK_OK) {
    fprintf(stderr, "[WebRTC] Error linking RTP %s a fakesink: %d\n", label, ret);
  }
}

void on_webrtc_pad_added(
  GstElement* /*webrtcbin*/, GstPad* pad, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);
  if (!peer || !pad) {
    return;
  }

  // Solo nos interesan los pads de salida (src = datos que vienen del peer remoto).
  if (GST_PAD_DIRECTION(pad) != GST_PAD_SRC) return;

  printf("[WebRTC] Nuevo pad de media de %s: %s\n",
    peer->peerId.c_str(), GST_PAD_NAME(pad));

  GstCaps* caps = gst_pad_get_current_caps(pad);
  if (!caps) {
    caps = gst_pad_query_caps(pad, NULL);
  }

  const GstStructure* structure = caps ? gst_caps_get_structure(caps, 0) : NULL;
  const gchar* media = structure ? gst_structure_get_string(structure, "media") : NULL;
  const gchar* encodingName =
    structure ? gst_structure_get_string(structure, "encoding-name") : NULL;

  gchar* capsStr = caps ? gst_caps_to_string(caps) : g_strdup("(sin caps)");
  printf("[WebRTC] Caps RTP de %s: %s\n", peer->peerId.c_str(), capsStr);
  g_free(capsStr);

  if (media && g_str_equal(media, "video") && bool_flag(g_context.rtpDirectSinkEnabled)) {
    /*
     * Diagnostico fuerte de entrada WebRTC: enlazamos el pad RTP de webrtcbin
     * directamente a fakesink para que depay/parser/decoder/mixer no puedan
     * bloquear el hilo push. Si los huecos de RtpTimeline siguen aqui, el
     * pulso nace en webrtcbin/sender/red.
     */
    attach_video_rtp_diagnostics(peer, pad);

    printf("[WebRTC] Stream RTP de VIDEO de %s (%s) descartado directamente "
           "por OPENMIX_WEBRTC_RTP_DIRECT_SINK=on\n",
      peer->peerId.c_str(), encodingName ? encodingName : "codec desconocido");

    link_rtp_pad_to_fakesink(peer, pad, "video directo");
    if (caps) gst_caps_unref(caps);
    return;
  }

  if (media && g_str_equal(media, "video") && encodingName &&
      g_ascii_strcasecmp(encodingName, "H264") == 0 &&
      g_context.makeH264BranchContext) {
    handle_webrtc_h264_pad_added(
      peer,
      pad,
      encodingName,
      g_context.makeH264BranchContext());
    if (caps) gst_caps_unref(caps);
    return;
  }

  if (media && g_str_equal(media, "audio")) {
    printf("[WebRTC] Stream RTP de AUDIO de %s (%s) descartado antes de decodificar\n",
      peer->peerId.c_str(), encodingName ? encodingName : "codec desconocido");

    link_rtp_pad_to_fakesink(peer, pad, "audio");
    if (caps) gst_caps_unref(caps);
    return;
  }

  if (media && g_str_equal(media, "video")) {
    attach_video_rtp_diagnostics(peer, pad);
  }

  if (media && g_str_equal(media, "video") && !bool_flag(g_context.decodeBranchEnabled)) {
    printf("[WebRTC] Stream RTP de VIDEO de %s (%s) descartado antes de decode "
           "por OPENMIX_WEBRTC_DECODE_BRANCH=off\n",
      peer->peerId.c_str(), encodingName ? encodingName : "codec desconocido");

    link_rtp_pad_to_fakesink(peer, pad, "video");
    if (caps) gst_caps_unref(caps);
    return;
  }

  // decodebin detecta el codec por caps y carga el decodificador adecuado.
  // Se mantiene como fallback para codecs no cubiertos por la ruta H.264
  // explicita.
  GstElement* decodebin = gst_element_factory_make("decodebin", NULL);
  if (!decodebin) {
    fprintf(stderr, "[WebRTC] Error: no se pudo crear decodebin\n");
    if (caps) gst_caps_unref(caps);
    return;
  }

  g_signal_connect(decodebin, "pad-added",
    G_CALLBACK(on_webrtc_decoded_pad), user_data);

  gst_bin_add(GST_BIN(peer->pipeline), decodebin);
  gst_element_sync_state_with_parent(decodebin);

  GstPad* sinkpad = gst_element_get_static_pad(decodebin, "sink");
  GstPadLinkReturn ret = gst_pad_link(pad, sinkpad);
  gst_object_unref(sinkpad);

  if (ret != GST_PAD_LINK_OK) {
    fprintf(stderr, "[WebRTC] Error linking webrtcbin pad a decodebin: %d\n", ret);
  }

  if (caps) gst_caps_unref(caps);
}
