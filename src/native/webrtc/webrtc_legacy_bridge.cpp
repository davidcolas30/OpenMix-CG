#include "webrtc_legacy_bridge.h"

#include <gst/video/video.h>

#include <chrono>
#include <cstdio>

#include "webrtc_peer.h"

static WebRtcLegacyBridgeContext g_context;

static int bridge_width()
{
  return g_context.bridgeWidth ? *g_context.bridgeWidth : 960;
}

static int bridge_height()
{
  return g_context.bridgeHeight ? *g_context.bridgeHeight : 540;
}

static bool realtime_diagnostics_enabled()
{
  return g_context.realtimeDiagnosticLogsEnabled &&
    *g_context.realtimeDiagnosticLogsEnabled;
}

void set_webrtc_legacy_bridge_context(const WebRtcLegacyBridgeContext& context)
{
  g_context = context;
}

static void maybe_log_bridge_diagnostics(WebRTCPeer* peer)
{
  if (!realtime_diagnostics_enabled()) {
    return;
  }

  auto now = std::chrono::steady_clock::now();
  if (peer->bridgeLastReportTime.time_since_epoch().count() == 0) {
    peer->bridgeLastReportTime = now;
    return;
  }

  auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    now - peer->bridgeLastReportTime).count();
  if (elapsedMs < g_context.diagnosticLogIntervalMs) {
    return;
  }

  double sampleFps = peer->bridgeSamplesSinceLastReport * 1000.0 / elapsedMs;
  double pushedFps = peer->bridgePushedSinceLastReport * 1000.0 / elapsedMs;

  printf("[WebRTC Bridge] %s -> fuente %d: appsink=%.1ffps, pushMixer=%.1ffps, discont=%d, corruptDropped=%d, pushErrors=%d\n",
    peer->peerId.c_str(),
    peer->mixerSourceIndex,
    sampleFps,
    pushedFps,
    peer->bridgeDiscontCount,
    peer->bridgeDroppedCorruptCount,
    peer->bridgePushErrorCount);

  peer->bridgeSamplesSinceLastReport = 0;
  peer->bridgePushedSinceLastReport = 0;
  peer->bridgeLastReportTime = now;
}

/**
 * Callback del appsink de video WebRTC.
 *
 * Cada frame decodificado del movil se empuja al appsrc del mixer.
 *
 * Estrategia de copia simplificada:
 * El bridge cruza I420 nativo del movil (hasta 1920x1080) en vez de
 * BGRA expandido. Asi preservamos la resolucion negociada y dejamos
 * el escalado/formato pesado para el pipeline principal del mixer.
 *
 * Usamos gst_buffer_extract para copiar los bytes crudos a un buffer
 * nuevo. Esto es mas robusto que gst_video_frame_map porque:
 * 1. No depende de GstVideoMeta (que puede referenciar memoria HW)
 * 2. gst_buffer_extract maneja internamente multiples GstMemory blocks
 * 3. El buffer resultante es 100% independiente del pool del decoder
 */
GstFlowReturn on_webrtc_video_sample(GstAppSink* appsink, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);
  if (!peer || peer->destroyed) {
    GstSample* sample = gst_app_sink_pull_sample(appsink);
    if (sample) gst_sample_unref(sample);
    return GST_FLOW_OK;
  }

  GstSample* sample = gst_app_sink_pull_sample(appsink);
  if (!sample) return GST_FLOW_OK;

  GstBuffer* origBuffer = gst_sample_get_buffer(sample);
  if (origBuffer) {
    gsize size = gst_buffer_get_size(origBuffer);
    bool isCorrupted = GST_BUFFER_FLAG_IS_SET(origBuffer, GST_BUFFER_FLAG_CORRUPTED);
    bool isDiscont = GST_BUFFER_FLAG_IS_SET(origBuffer, GST_BUFFER_FLAG_DISCONT);
    // Tamano esperado: depende del raster activo del bridge (I420).
    // Con 1920x1080 seria ~3.1 MB; con 960x540 es ~0.78 MB.
    const gsize expectedSize =
      static_cast<gsize>(bridge_width()) * static_cast<gsize>(bridge_height()) * 3 / 2;

    peer->bridgeFrameCount++;
    peer->bridgeSamplesSinceLastReport++;

    if (isDiscont) {
      peer->bridgeDiscontCount++;
    }

    if (isCorrupted) {
      peer->bridgeDroppedCorruptCount++;
      fprintf(stderr,
        "[WebRTC Bridge] %s -> fuente %d frame #%d descartado por GST_BUFFER_FLAG_CORRUPTED "
        "(corrupt=%d discont=%d dropped=%d)\n",
        peer->peerId.c_str(),
        peer->mixerSourceIndex,
        peer->bridgeFrameCount,
        isCorrupted ? 1 : 0,
        isDiscont ? 1 : 0,
        peer->bridgeDroppedCorruptCount);
      maybe_log_bridge_diagnostics(peer);
      gst_sample_unref(sample);
      return GST_FLOW_OK;
    }

    // Logging diagnostico: primer frame, cada 300, si el tamano cambia,
    // o si GStreamer marca discontinuidad.
    if (peer->bridgeFrameCount == 1 || peer->bridgeFrameCount % 300 == 0 ||
        (int)size != peer->bridgeLastBufSize || isDiscont) {
      printf("[WebRTC Bridge] %s -> fuente %d frame #%d: bufSize=%zu expected=%zu "
             "hasVideoMeta=%s discont=%s droppedCorrupt=%d pushErrors=%d\n",
        peer->peerId.c_str(),
        peer->mixerSourceIndex,
        peer->bridgeFrameCount, size, expectedSize,
        gst_buffer_get_video_meta(origBuffer) ? "SI" : "NO",
        isDiscont ? "SI" : "NO",
        peer->bridgeDroppedCorruptCount,
        peer->bridgePushErrorCount);
      peer->bridgeLastBufSize = (int)size;
    }

    if (size >= expectedSize) {
      // El frame ya llega normalizado a I420 y al raster del bridge. Para
      // pasarlo al appsrc del mixer no necesitamos copiar sus pixeles: basta
      // con crear un GstBuffer nuevo que referencie la misma GstMemory.
      //
      // Esta operacion mantiene la separacion entre pipelines (appsink/appsrc)
      // pero evita un memcpy de ~0.78 MB por frame a 960x540. GStreamer
      // mantiene la memoria viva por refcount hasta que el mixer termina de
      // consumirla, aunque el sample original del appsink se libere al final
      // de este callback.
      GstBuffer* buffer = gst_buffer_copy_region(
        origBuffer,
        static_cast<GstBufferCopyFlags>(GST_BUFFER_COPY_MEMORY | GST_BUFFER_COPY_FLAGS),
        0,
        expectedSize
      );

      if (buffer) {
        // Aunque appsrc anade timestamps con do-timestamp=true, declarar
        // tambien la duracion esperada ayuda al compositor a mantener una
        // cadencia estable cuando conviven varias entradas live WebRTC.
        GST_BUFFER_PTS(buffer) = GST_CLOCK_TIME_NONE;
        GST_BUFFER_DTS(buffer) = GST_CLOCK_TIME_NONE;
        GST_BUFFER_DURATION(buffer) =
          gst_util_uint64_scale_int(
            GST_SECOND,
            g_context.frameRateDen,
            g_context.frameRateNum);
        gst_buffer_unref(buffer);
      }
    } else {
      fprintf(stderr, "[WebRTC Bridge] %s -> fuente %d frame #%d descartado: size=%zu < expected=%zu\n",
        peer->peerId.c_str(), peer->mixerSourceIndex, peer->bridgeFrameCount, size, expectedSize);
    }

    maybe_log_bridge_diagnostics(peer);
  }

  gst_sample_unref(sample);
  return GST_FLOW_OK;
}

/**
 * Callback: decodebin ha decodificado un stream y produce media cruda.
 *
 * Para video: conectamos videoconvert -> videoscale(add-borders) -> appsink.
 * videoscale con add-borders=true se encarga automaticamente de:
 * - Escalar manteniendo la proporcion original
 * - Rellenar con bandas negras (pillarbox/letterbox)
 * - Adaptarse a cambios de resolucion (rotacion, bitrate adaptativo)
 * Sin necesidad de capsfilter ni videobox intermedios.
 *
 * Para audio: ignorado (se implementara en fases posteriores)
 */
void on_webrtc_decoded_pad(
  GstElement* /*decodebin*/, GstPad* pad, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);

  // Obtener las caps del pad para saber si es video o audio
  GstCaps* caps = gst_pad_get_current_caps(pad);
  if (!caps) {
    caps = gst_pad_query_caps(pad, NULL);
  }

  const GstStructure* s = gst_caps_get_structure(caps, 0);
  const gchar* mediaType = gst_structure_get_name(s);
  gchar* capsStr = gst_caps_to_string(caps);
  printf("[WebRTC] Caps decodificadas de %s: %s\n",
    peer->peerId.c_str(), capsStr ? capsStr : "(null)");
  g_free(capsStr);

  if (g_str_has_prefix(mediaType, "video/")) {
    printf("[WebRTC] Stream de VIDEO decodificado de %s\n", peer->peerId.c_str());

    // Obtener resolucion de entrada (para logging)
    gint inW = 0, inH = 0;
    gst_structure_get_int(s, "width", &inW);
    gst_structure_get_int(s, "height", &inH);
    printf("[WebRTC] Resolucion de entrada: %dx%d\n", inW, inH);

    // Resetear contadores de diagnostico para esta conexion.
    peer->bridgeFrameCount = 0;
    peer->bridgeLastBufSize = 0;
    peer->bridgeDroppedCorruptCount = 0;
    peer->bridgeDiscontCount = 0;
    peer->bridgePushErrorCount = 0;
    peer->bridgeSamplesSinceLastReport = 0;
    peer->bridgePushedSinceLastReport = 0;
    peer->bridgeLastReportTime = std::chrono::steady_clock::now();
    peer->hasVideoTrack = false;

    //  Pipeline de video WebRTC 
    // El bridge ahora deja pasar la resolucion nativa del movil (hasta
    // 1920x1080) en I420. El escalado a BGRA 1920x1080 ocurre una sola
    // vez dentro del mixer, compartido entre PGM/PVW/thumbnails.
    // videoscale(add-borders=true): fija un lienzo 16:9 estable y mantiene
    // proporcion si la camara rota o renegocia otra resolucion.
    // videoconvert: normaliza a I420 para que el appsink entregue buffers
    // previsibles al bridge, independientemente del decoder usado.
    // capsfilter: fuerza la resolucion del bridge + PAR=1/1.
    // appsink: captura frames YUV para reenviarlos al appsrc del mixer.
    GstElement* convert = gst_element_factory_make("videoconvert", NULL);
    GstElement* scaleElem = gst_element_factory_make("videoscale", NULL);
    GstElement* sink = gst_element_factory_make("appsink", NULL);

    if (!convert || !scaleElem || !sink) {
      fprintf(stderr, "[WebRTC] Error creando elementos de video\n");
      gst_caps_unref(caps);
      return;
    }

    // add-borders: al escalar, mantiene aspect ratio original y
    // rellena con bandas negras (pillarbox para portrait, letterbox
    // para formatos mas anchos que 16:9). Funciona automaticamente
    // con cualquier resolucion de entrada.
    g_object_set(scaleElem, "add-borders", TRUE, NULL);

    // Capsfilter explicito entre videoscale y appsink.
    // Clave: pixel-aspect-ratio=1/1 es OBLIGATORIO para que add-borders
    // funcione. Sin PAR explicito, videoscale resuelve el cambio de
    // aspect ratio ajustando el PAR de salida (ej: PAR=81/256) en vez
    // de anadir bordes negros. Con PAR=1/1, videoscale no puede tocar
    // el PAR y DEBE anadir bordes para preservar la proporcion.
    GstElement* capsfilter = gst_element_factory_make("capsfilter", NULL);
    GstCaps* outCaps = gst_caps_new_simple("video/x-raw",
      "format", G_TYPE_STRING, "I420",
      "width", G_TYPE_INT, bridge_width(),
      "height", G_TYPE_INT, bridge_height(),
      "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
      NULL);
    g_object_set(capsfilter, "caps", outCaps, NULL);
    gst_caps_unref(outCaps);

    g_object_set(sink, "drop", TRUE, "max-buffers", 2, "sync", FALSE,
      "emit-signals", FALSE, NULL);

    // Callback para puentear frames al mixer.
    GstAppSinkCallbacks webrtcCbs = {};
    webrtcCbs.new_sample = on_webrtc_video_sample;
    gst_app_sink_set_callbacks(GST_APP_SINK(sink), &webrtcCbs, peer, NULL);

    gst_bin_add_many(GST_BIN(peer->pipeline),
      scaleElem, convert, capsfilter, sink, NULL);
    gst_element_sync_state_with_parent(scaleElem);
    gst_element_sync_state_with_parent(convert);
    gst_element_sync_state_with_parent(capsfilter);
    gst_element_sync_state_with_parent(sink);

    gst_element_link_many(scaleElem, convert, capsfilter, sink, NULL);

    // Conectar el pad decodificado al escalado del bridge.
    GstPad* sinkpad = gst_element_get_static_pad(scaleElem, "sink");
    GstPadLinkReturn ret = gst_pad_link(pad, sinkpad);
    gst_object_unref(sinkpad);

    if (ret != GST_PAD_LINK_OK) {
      fprintf(stderr, "[WebRTC] Error linking decoded video: %d\n", ret);
    } else {
      printf("[WebRTC] Video de %s conectado al mixer en la fuente %d "
             "(videoscale->videoconvert->appsink I420->appsrc)\n",
        peer->peerId.c_str(), peer->mixerSourceIndex);
      peer->hasVideoTrack = true;
      if (g_context.setSourceActive) {
        g_context.setSourceActive(peer->mixerSourceIndex, true);
      }
    }
  } else if (g_str_has_prefix(mediaType, "audio/")) {
    // Audio: crear un fakesink para consumir el stream sin procesarlo
    // TODO(Fase posterior): conectar a audiomixer para mezcla de audio
    printf("[WebRTC] Stream de AUDIO decodificado de %s (ignorado por ahora)\n",
      peer->peerId.c_str());
    GstElement* audioSink = gst_element_factory_make("fakesink", NULL);
    g_object_set(audioSink, "sync", FALSE, NULL);
    gst_bin_add(GST_BIN(peer->pipeline), audioSink);
    gst_element_sync_state_with_parent(audioSink);

    GstPad* sinkpad = gst_element_get_static_pad(audioSink, "sink");
    gst_pad_link(pad, sinkpad);
    gst_object_unref(sinkpad);
  }

  gst_caps_unref(caps);
}
