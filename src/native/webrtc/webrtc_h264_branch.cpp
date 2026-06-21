#include "webrtc_h264_branch.h"

#include <gst/video/video.h>

#include <cstdio>

#include "gst_utils.h"
#include "monitor_diagnostics.h"
#include "recording_elements.h"
#include "sync_buffer_manager.h"

namespace {

bool is_valid_source(const WebRTCPeer* peer, const WebRtcH264BranchContext& context)
{
  return peer &&
    peer->mixerSourceIndex >= 0 &&
    peer->mixerSourceIndex < context.sourceCount;
}

NativeMonitorDiagnostics* diagnostic_at(
  NativeMonitorDiagnostics* diagnostics,
  const WebRTCPeer* peer,
  const WebRtcH264BranchContext& context)
{
  if (!diagnostics || !is_valid_source(peer, context)) {
    return nullptr;
  }
  return &diagnostics[peer->mixerSourceIndex];
}

RtpTimelineDiagnostics* timeline_at(
  RtpTimelineDiagnostics* diagnostics,
  const WebRTCPeer* peer,
  const WebRtcH264BranchContext& context)
{
  if (!diagnostics || !is_valid_source(peer, context)) {
    return nullptr;
  }
  return &diagnostics[peer->mixerSourceIndex];
}

} // namespace

void handle_webrtc_h264_pad_added(
  WebRTCPeer* peer,
  GstPad* pad,
  const char* encodingName,
  const WebRtcH264BranchContext& context)
{
  if (!peer || !pad) {
    return;
  }

  const WebRTCH264DecoderMode decoderMode = get_webrtc_h264_decoder_mode();
  bool isHardwareDecoder = false;
  GstElement* decoder = nullptr;

#ifdef __APPLE__
  if (decoderMode != WEBRTC_H264_DECODER_SOFTWARE) {
    decoder = gst_element_factory_make("vtdec", NULL);
    isHardwareDecoder = true;
  } else {
    decoder = gst_element_factory_make("avdec_h264", NULL);
  }
#else
  if (decoderMode == WEBRTC_H264_DECODER_HARDWARE) {
    printf("[WebRTC] Decoder H264 hardware solicitado, pero vtdec solo esta disponible en macOS; usando avdec_h264\n");
  }
  decoder = gst_element_factory_make("avdec_h264", NULL);
#endif

  if (isHardwareDecoder) {
    printf("[WebRTC] %s usa H264 RTP → decoder=vtdec (modo=%s, VideoToolbox hardware)\n",
      peer->peerId.c_str(),
      get_webrtc_h264_decoder_mode_label(decoderMode));
  } else {
    printf("[WebRTC] %s usa H264 RTP → decoder=avdec_h264 (modo=%s, software)\n",
      peer->peerId.c_str(),
      get_webrtc_h264_decoder_mode_label(decoderMode));
  }

  GstElement* queue = gst_element_factory_make("queue", NULL);
  GstElement* depay = gst_element_factory_make("rtph264depay", NULL);
  GstElement* parse = gst_element_factory_make("h264parse", NULL);
  GstElement* decodeValve = gst_element_factory_make("valve", NULL);
  GstElement* syncQueue = context.syncBufferEnabled
    ? gst_element_factory_make("queue", NULL)
    : nullptr;
  GstElement* syncClock = context.syncBufferEnabled
    ? gst_element_factory_make("identity", NULL)
    : nullptr;
  GstElement* decodedTee = gst_element_factory_make("tee", NULL);
  GstElement* monitorValve = gst_element_factory_make("valve", NULL);
  GstElement* monitorQueue = gst_element_factory_make("queue", NULL);
  GstElement* monitorConvert = gst_element_factory_make("videoconvert", NULL);
  GstElement* monitorScale = gst_element_factory_make("videoscale", NULL);
  GstElement* monitorRate = gst_element_factory_make("videorate", NULL);
  GstElement* monitorCapsfilter = gst_element_factory_make("capsfilter", NULL);
  GstElement* monitorOutQueue = gst_element_factory_make("queue", NULL);
  GstElement* recordingValve = gst_element_factory_make("valve", NULL);
  GstElement* recordingQueue = gst_element_factory_make("queue", NULL);
  GstElement* recordingDownload = make_recording_system_memory_bridge(NULL);
  GstElement* recordingSystemCapsfilter = gst_element_factory_make("capsfilter", NULL);
  GstElement* recordingConvert = gst_element_factory_make("videoconvert", NULL);
  GstElement* recordingScale = gst_element_factory_make("videoscale", NULL);
  GstElement* recordingRate = gst_element_factory_make("videorate", NULL);
  GstElement* recordingCapsfilter = gst_element_factory_make("capsfilter", NULL);
  GstElement* recordingOutQueue = gst_element_factory_make("queue", NULL);

  if (!queue || !depay || !parse || !decodeValve || !decoder ||
      (context.syncBufferEnabled && (!syncQueue || !syncClock)) || !decodedTee ||
      !monitorValve || !monitorQueue || !monitorConvert || !monitorScale || !monitorRate ||
      !monitorCapsfilter || !monitorOutQueue ||
      !recordingValve || !recordingQueue || !recordingDownload ||
      !recordingSystemCapsfilter || !recordingConvert || !recordingScale ||
      !recordingRate || !recordingCapsfilter || !recordingOutQueue) {
    fprintf(stderr, "[WebRTC] Error creando rama H264 para %s\n",
      peer->peerId.c_str());
    return;
  }

  // OJO: aquí el queue almacena paquetes RTP, no frames completos.
  // Un frame H264 a 5 Mbps puede ocupar decenas de paquetes, así que
  // un límite temporal pequeño puede bloquear en pulsos si downstream
  // tarda en parsear/decodificar una rafaga.
  // Preferimos absorber ráfagas cortas aquí y dejar el descarte para
  // etapas posteriores donde ya trabajamos con frames decodificados.
  g_object_set(queue,
    "max-size-buffers", (guint)context.webrtcRtpQueueBuffers,
    "max-size-bytes", (guint)0,
    "max-size-time", (guint64)(static_cast<guint64>(context.webrtcRtpQueueTimeMs) * GST_MSECOND),
    "leaky", 0,
    NULL);
  // Si se pierde un paquete H264, pedimos un keyframe nuevo (PLI/FIR)
  // para recuperarnos rápido. NO esperamos bloqueados al siguiente
  // keyframe porque eso congela la imagen en UI aunque el compositor
  // siga produciendo 30fps con el último frame válido.
  g_object_set(depay,
    "request-keyframe", TRUE,
    "wait-for-keyframe", FALSE,
    NULL);
  // Reinyectar SPS/PPS en cada IDR ayuda a que el decoder se resincronice
  // mejor tras pérdida RTP o tras un PLI/FIR, evitando corrupción larga.
  g_object_set(parse,
    "config-interval", -1,
    "disable-passthrough", TRUE,
    NULL);
  if (!isHardwareDecoder) {
    // Para la vista en vivo preferimos descartar frames corruptos a mostrarlos
    // con macro-bloques durante varios segundos hasta el siguiente IDR limpio.
    // Estas opciones solo aplican a avdec_h264 (software); vtdec usa
    // la Media Engine de Apple y no expone estos controles.
    g_object_set(decoder,
      // A esta resolución prima la estabilidad sobre el throughput puro.
      // Un solo hilo y sin direct-rendering reduce riesgo de artefactos
      // ligados a reutilización/buffering interno del decoder.
      "max-threads", 1,
      "direct-rendering", FALSE,
      "output-corrupt", FALSE,
      NULL);
  }
  if ((context.stutterTraceEnabled || context.h264KeyframeTraceEnabled) &&
      context.h264ParseSrcProbe) {
    GstPad* parseSrcPad = gst_element_get_static_pad(parse, "src");
    if (parseSrcPad) {
      gst_pad_add_probe(
        parseSrcPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        context.h264ParseSrcProbe,
        peer,
        nullptr);
      NativeMonitorDiagnostics* encodedDiagnostics =
        diagnostic_at(context.webrtcEncodedDiagnostics, peer, context);
      if (context.stutterTraceEnabled && encodedDiagnostics) {
        gst_pad_add_probe(
          parseSrcPad,
          GST_PAD_PROBE_TYPE_BUFFER,
          on_native_monitor_buffer_probe,
          encodedDiagnostics,
          nullptr);
      }
      gst_object_unref(parseSrcPad);
    }
  }
  // Valvula de diagnostico: permite medir cuanto cuesta recibir RTP/H264
  // sin llegar a decodificar. No es un modo operativo de realizacion.
  g_object_set(decodeValve, "drop", context.webrtcDecodeBranchEnabled ? FALSE : TRUE, NULL);
  if (syncQueue && syncClock) {
    /*
     * Sync Buffer Manager v1:
     * - queue absorbe ráfagas cortas ya con frames decodificados.
     * - el probe de entrada normaliza el PTS de cada peer al running-time
     *   del mixer padre; asi una camara conectada tarde no parece estar
     *   "en el pasado" para los compositores.
     * - identity puede actuar como compuerta de reloj, pero empieza en modo
     *   pasante y solo se arma cuando hay suficientes peers para sincronizar.
     * Este punto está antes del tee monitor/REC para que todas las salidas
     * consuman la misma decisión temporal y no tengamos dos sincronizadores
     * independientes para la misma cámara.
     */
    g_object_set(syncQueue,
      "max-size-buffers", (guint)0,
      "max-size-bytes", (guint)0,
      "max-size-time", (guint64)0,
      "leaky", 0,
      "silent", TRUE,
      NULL);
    g_object_set(syncClock,
      "sync", FALSE,
      /*
       * Estado inicial realmente pasante: con una sola cámara el comando
       * base de producto no debe reescribir segmentos ni PTS. single-segment
       * se activa más tarde, solo cuando hay al menos dos cámaras decodificadas
       * y el retimer necesita publicar una base temporal continua.
       */
      "single-segment", FALSE,
      "ts-offset", (gint64)0,
      "silent", TRUE,
      "signal-handoffs", FALSE,
      NULL);
    g_signal_connect(syncQueue, "overrun",
      G_CALLBACK(on_sync_buffer_queue_overrun), peer);
    peer->syncBufferQueue = syncQueue;
    peer->syncBufferClock = syncClock;
  }
  g_object_set(monitorScale, "add-borders", TRUE, NULL);
  g_object_set(recordingScale, "add-borders", TRUE, NULL);
  configure_recording_videorate(recordingRate);
  g_object_set(monitorValve, "drop", context.webrtcMonitorBranchEnabled ? FALSE : TRUE, NULL);
  g_object_set(monitorOutQueue,
    "max-size-buffers", (guint)2,
    "max-size-bytes", (guint)0,
    "max-size-time", (guint64)0,
    "leaky", 2,
    NULL);
  g_object_set(recordingOutQueue,
    "max-size-buffers", (guint)2,
    "max-size-bytes", (guint)0,
    "max-size-time", (guint64)0,
    "leaky", 2,
    NULL);
  const bool sourceMatchesRecording =
    context.sourceMatchesRecordingKeepWarmSelection &&
    context.sourceMatchesRecordingKeepWarmSelection(
      peer->mixerSourceIndex,
      context.programSource,
      -1);
  g_object_set(recordingValve,
    "drop",
    (context.programRecordingEnabled && sourceMatchesRecording) ? FALSE : TRUE,
    NULL);
  /*
   * Esta valve se abre solo al activar REC. En modo drop-all se perderian
   * CAPS/SEGMENT mientras esta cerrada; al abrirla, el selector de REC puede
   * recibir buffers sin contexto y la rama de video queda muda. Forward-sticky
   * conserva esos eventos sin generar GAPs que videorate podria convertir en
   * frames repetidos al principio del fichero.
   */
  set_object_arg_if_exists(recordingValve, "drop-mode", "forward-sticky-events");
  g_object_set(monitorQueue,
    "max-size-buffers", (guint)2,
    "max-size-bytes", (guint)0,
    "max-size-time", (guint64)0,
    "leaky", 2,
    NULL);
  g_object_set(recordingQueue,
    "max-size-buffers", context.recordingRawQueueBuffers,
    "max-size-bytes", (guint)0,
    "max-size-time", (guint64)0,
    "leaky", 2,
    NULL);

  GstCaps* monitorCaps = nullptr;
  if (context.monitorNormalizeMode == WEBRTC_MONITOR_NORMALIZE_DEFERRED) {
    // En modo selector no conviene escalar/convertir todas las camaras
    // conectadas antes de saber cual mira PGM/PVW. Dejamos el frame en su
    // resolucion/formato decodificado y normalizamos solo despues del
    // selector, en la rama visible.
    monitorCaps = gst_caps_new_simple("video/x-raw",
      "framerate", GST_TYPE_FRACTION, context.frameRateNum, context.frameRateDen,
      "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
      NULL);
  } else {
    monitorCaps = gst_caps_new_simple("video/x-raw",
      "format", G_TYPE_STRING, "I420",
      "width", G_TYPE_INT, context.monitorWidth,
      "height", G_TYPE_INT, context.monitorHeight,
      "framerate", GST_TYPE_FRACTION, context.frameRateNum, context.frameRateDen,
      "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
      NULL);
  }
  g_object_set(monitorCapsfilter, "caps", monitorCaps, NULL);
  gst_caps_unref(monitorCaps);

  GstCaps* recordingSystemCaps = gst_caps_new_empty_simple("video/x-raw");
  g_object_set(recordingSystemCapsfilter, "caps", recordingSystemCaps, NULL);
  gst_caps_unref(recordingSystemCaps);

  GstCaps* recordingCaps = gst_caps_new_simple("video/x-raw",
    "format", G_TYPE_STRING, "I420",
    "width", G_TYPE_INT, context.internalWidth,
    "height", G_TYPE_INT, context.internalHeight,
    "framerate", GST_TYPE_FRACTION, context.frameRateNum, context.frameRateDen,
    "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
    NULL);
  g_object_set(recordingCapsfilter, "caps", recordingCaps, NULL);
  gst_caps_unref(recordingCaps);

  // videoconvert va ANTES de videoscale cuando usamos vtdec, porque
  // VideoToolbox puede entregar buffers en memoria de video (IOSurface)
  // que videoscale (software) no sabe escalar directamente.
  // videoconvert fuerza la copia a memoria de sistema y normaliza el
  // formato para el resto del pipeline. En software (avdec_h264) este
  // orden también funciona correctamente, así que lo unificamos.
  //
  // videorate repone el contrato que antes imponía el appsrc del puente:
  // el mixer espera caps con framerate=30/1. Sin ese campo explícito,
  // algunos decoders/WebRTC entregan raw video sin framerate fijo y la
  // rama directa falla con GST_FLOW_NOT_NEGOTIATED.
  gst_bin_add_many(GST_BIN(peer->pipeline),
    queue, depay, parse, decodeValve, decoder,
    monitorValve, monitorQueue, monitorConvert, monitorScale, monitorRate,
    monitorCapsfilter, monitorOutQueue,
    recordingValve, recordingQueue, recordingDownload, recordingSystemCapsfilter,
    recordingConvert, recordingScale, recordingRate, recordingCapsfilter, recordingOutQueue,
    NULL);
  if (syncQueue && syncClock) {
    gst_bin_add_many(GST_BIN(peer->pipeline), syncQueue, syncClock, decodedTee, NULL);
  } else {
    gst_bin_add(GST_BIN(peer->pipeline), decodedTee);
  }
  gst_element_sync_state_with_parent(queue);
  gst_element_sync_state_with_parent(depay);
  gst_element_sync_state_with_parent(parse);
  gst_element_sync_state_with_parent(decodeValve);
  gst_element_sync_state_with_parent(decoder);
  if (syncQueue && syncClock) {
    gst_element_sync_state_with_parent(syncQueue);
    gst_element_sync_state_with_parent(syncClock);
  }
  gst_element_sync_state_with_parent(decodedTee);
  gst_element_sync_state_with_parent(monitorValve);
  gst_element_sync_state_with_parent(monitorQueue);
  gst_element_sync_state_with_parent(monitorConvert);
  gst_element_sync_state_with_parent(monitorScale);
  gst_element_sync_state_with_parent(monitorRate);
  gst_element_sync_state_with_parent(monitorCapsfilter);
  gst_element_sync_state_with_parent(monitorOutQueue);
  gst_element_sync_state_with_parent(recordingValve);
  gst_element_sync_state_with_parent(recordingQueue);
  gst_element_sync_state_with_parent(recordingDownload);
  gst_element_sync_state_with_parent(recordingSystemCapsfilter);
  gst_element_sync_state_with_parent(recordingConvert);
  gst_element_sync_state_with_parent(recordingScale);
  gst_element_sync_state_with_parent(recordingRate);
  gst_element_sync_state_with_parent(recordingCapsfilter);
  gst_element_sync_state_with_parent(recordingOutQueue);

  const bool decodeChainLinked = (syncQueue && syncClock)
    ? gst_element_link_many(queue, depay, parse, decodeValve, decoder,
        syncQueue, syncClock, decodedTee, NULL)
    : gst_element_link_many(queue, depay, parse, decodeValve, decoder, decodedTee, NULL);

  if (!decodeChainLinked ||
      !gst_element_link_many(monitorValve, monitorQueue, monitorConvert, monitorScale, monitorRate,
        monitorCapsfilter, monitorOutQueue, NULL) ||
      !gst_element_link_many(recordingValve, recordingQueue, recordingDownload,
        recordingSystemCapsfilter, recordingConvert, recordingScale, recordingRate,
        recordingCapsfilter, recordingOutQueue, NULL)) {
    fprintf(stderr, "[WebRTC] Error enlazando rama H264 para %s\n",
      peer->peerId.c_str());
    return;
  }

  if (syncClock) {
    GstPad* syncSinkPad = gst_element_get_static_pad(syncClock, "sink");
    if (syncSinkPad) {
      gst_pad_add_probe(
        syncSinkPad,
        GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM,
        on_sync_buffer_event_probe,
        peer,
        nullptr);
      gst_pad_add_probe(
        syncSinkPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_sync_buffer_prepare_buffer_probe,
        peer,
        nullptr);
      gst_object_unref(syncSinkPad);
    }

    GstPad* syncSrcPad = gst_element_get_static_pad(syncClock, "src");
    if (syncSrcPad) {
      gst_pad_add_probe(
        syncSrcPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_sync_buffer_released_buffer_probe,
        peer,
        nullptr);
      NativeMonitorDiagnostics* decodedDiagnostics =
        diagnostic_at(context.webrtcDecodedDiagnostics, peer, context);
      if (context.stutterTraceEnabled && decodedDiagnostics) {
        gst_pad_add_probe(
          syncSrcPad,
          GST_PAD_PROBE_TYPE_BUFFER,
          on_native_monitor_buffer_probe,
          decodedDiagnostics,
          nullptr);
      }
      gst_object_unref(syncSrcPad);
    }
  }

  GstPadTemplate* teePadTemplate =
    gst_element_class_get_pad_template(GST_ELEMENT_GET_CLASS(decodedTee), "src_%u");
  GstPad* monitorTeePad = gst_element_request_pad(decodedTee, teePadTemplate, nullptr, nullptr);
  GstPad* recordingTeePad = gst_element_request_pad(decodedTee, teePadTemplate, nullptr, nullptr);
  GstPad* monitorValveSinkPad = gst_element_get_static_pad(monitorValve, "sink");
  GstPad* recordingValveSinkPad = gst_element_get_static_pad(recordingValve, "sink");

  const bool teeLinked =
    monitorTeePad && recordingTeePad && monitorValveSinkPad && recordingValveSinkPad &&
    gst_pad_link(monitorTeePad, monitorValveSinkPad) == GST_PAD_LINK_OK &&
    gst_pad_link(recordingTeePad, recordingValveSinkPad) == GST_PAD_LINK_OK;

  if (monitorValveSinkPad) { gst_object_unref(monitorValveSinkPad); }
  if (recordingValveSinkPad) { gst_object_unref(recordingValveSinkPad); }

  if (!teeLinked) {
    fprintf(stderr, "[WebRTC] Error enlazando tee monitor/REC para %s\n",
      peer->peerId.c_str());
    return;
  }

  peer->recordingBranchValve = recordingValve;

  if (!context.linkBranchesToMixerSelectors ||
      !context.linkBranchesToMixerSelectors(peer, monitorOutQueue, recordingOutQueue)) {
    return;
  }

  if (context.stutterTraceEnabled && is_valid_source(peer, context)) {
    NativeMonitorDiagnostics* rtpDiagnostics =
      diagnostic_at(context.webrtcRtpDiagnostics, peer, context);
    if (rtpDiagnostics) {
      gst_pad_add_probe(
        pad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_native_monitor_buffer_probe,
        rtpDiagnostics,
        nullptr);
    }
    if (!syncClock) {
      NativeMonitorDiagnostics* decodedDiagnostics =
        diagnostic_at(context.webrtcDecodedDiagnostics, peer, context);
      if (decodedDiagnostics) {
        attach_element_pad_diagnostics_probe(
          decoder,
          "src",
          *decodedDiagnostics);
      }
    }
    NativeMonitorDiagnostics* monitorOutDiagnostics =
      diagnostic_at(context.webrtcMonitorOutDiagnostics, peer, context);
    if (monitorOutDiagnostics) {
      attach_element_pad_diagnostics_probe(
        monitorOutQueue,
        "src",
        *monitorOutDiagnostics);
    }
  }
  if (should_attach_rtp_timeline_probes() && is_valid_source(peer, context)) {
    RtpTimelineDiagnostics* timelineDiagnostics =
      timeline_at(context.webrtcRtpTimelineDiagnostics, peer, context);
    if (timelineDiagnostics) {
      gst_pad_add_probe(
        pad,
        GST_PAD_PROBE_TYPE_BUFFER,
        on_webrtc_rtp_timeline_probe,
        timelineDiagnostics,
        nullptr);
    }
  }

  GstPad* sinkpad = gst_element_get_static_pad(queue, "sink");
  GstPadLinkReturn ret = gst_pad_link(pad, sinkpad);
  gst_object_unref(sinkpad);

  if (ret != GST_PAD_LINK_OK) {
    fprintf(stderr, "[WebRTC] Error linking RTP H264 a rama: %d\n", ret);
  } else {
    printf("[WebRTC] Vídeo de %s conectado directamente al mixer con decodificación %s H264 "
           "(decode=%s, sync-buffer=%s/%dms, monitor=%dx%d, rec-master=%dx%d)\n",
      peer->peerId.c_str(),
      isHardwareDecoder ? "hardware (vtdec)" : "software (avdec_h264)",
      context.webrtcDecodeBranchEnabled ? "on" : "off",
      syncClock ? "on" : "off",
      syncClock ? context.syncBufferLatencyMs : 0,
      context.monitorWidth,
      context.monitorHeight,
      context.internalWidth,
      context.internalHeight);
    peer->hasVideoTrack = true;
    if (context.setSourceActive) {
      context.setSourceActive(peer->mixerSourceIndex, true);
    }
  }

  (void)encodingName;
}
