#include "recording_branch.h"

#include "gst_utils.h"
#include "recording_elements.h"
#include "recording_probes.h"

NativeRecordingBranch create_native_recording_branch(
  const NativeRecordingBranchConfig& config)
{
  NativeRecordingBranch branch;
  std::string encoderName;
  std::string muxerName;

  GstElement* bin = gst_bin_new("native_program_recording_bin");
  GstElement* queue = gst_element_factory_make("queue", nullptr);
  GstElement* convert = gst_element_factory_make("videoconvert", nullptr);
  GstElement* rate = gst_element_factory_make("videorate", nullptr);
  GstElement* capsfilter = gst_element_factory_make("capsfilter", nullptr);
  GstElement* encoder = make_h264_encoder(
    config.videoPreset,
    config.qualityCrf,
    config.frameRateNum,
    encoderName);
  GstElement* encodedCapsfilter = gst_element_factory_make("capsfilter", nullptr);
  GstElement* parser = gst_element_factory_make("h264parse", nullptr);
  GstElement* videoMuxQueue = gst_element_factory_make("queue", nullptr);
  GstElement* muxer = make_recording_muxer(config.container, muxerName);
  GstElement* sink = gst_element_factory_make("filesink", nullptr);
  GstElement* audioSource = nullptr;
  GstElement* audioQueue = nullptr;
  GstElement* audioDelay = nullptr;
  GstElement* audioConvert = nullptr;
  GstElement* audioResample = nullptr;
  GstElement* audioCapsfilter = nullptr;
  GstElement* audioEncoder = nullptr;
  GstElement* audioEncodedCapsfilter = nullptr;
  GstElement* audioParser = nullptr;
  GstElement* audioMuxQueue = nullptr;
  std::string audioEncoderName;

  /*
   * Esta rama se engancha/desengancha en caliente. Pedimos al GstBin que gestione
   * sus cambios asincronos internos para no convertir el arranque del muxer,
   * encoder o audio source en una transicion bloqueante del pipeline principal.
   */
  set_bool_property_if_exists(bin, "async-handling", true);

  if (!bin || !queue || !convert || !rate || !capsfilter || !encoder || !encodedCapsfilter ||
      !parser || !videoMuxQueue || !muxer || !sink) {
    if (bin) { gst_object_unref(bin); }
    if (queue) { gst_object_unref(queue); }
    if (convert) { gst_object_unref(convert); }
    if (rate) { gst_object_unref(rate); }
    if (capsfilter) { gst_object_unref(capsfilter); }
    if (encoder) { gst_object_unref(encoder); }
    if (encodedCapsfilter) { gst_object_unref(encodedCapsfilter); }
    if (parser) { gst_object_unref(parser); }
    if (videoMuxQueue) { gst_object_unref(videoMuxQueue); }
    if (muxer) { gst_object_unref(muxer); }
    if (sink) { gst_object_unref(sink); }
    return branch;
  }

  if (config.audioEnabled) {
    audioSource = gst_element_factory_make(config.audioSourceName.c_str(), nullptr);
    audioQueue = gst_element_factory_make("queue", nullptr);
    audioDelay = gst_element_factory_make("identity", "native_recording_audio_delay");
    audioConvert = gst_element_factory_make("audioconvert", nullptr);
    audioResample = gst_element_factory_make("audioresample", nullptr);
    audioCapsfilter = gst_element_factory_make("capsfilter", nullptr);
    audioEncoder = make_recording_audio_encoder(audioEncoderName, config.audioBitrate);
    audioEncodedCapsfilter = gst_element_factory_make("capsfilter", nullptr);
    audioParser = gst_element_factory_make("aacparse", nullptr);
    audioMuxQueue = gst_element_factory_make("queue", nullptr);

    if (!audioSource || !audioQueue || !audioDelay || !audioConvert || !audioResample ||
        !audioCapsfilter || !audioEncoder || !audioEncodedCapsfilter || !audioParser ||
        !audioMuxQueue) {
      if (audioSource) { gst_object_unref(audioSource); }
      if (audioQueue) { gst_object_unref(audioQueue); }
      if (audioDelay) { gst_object_unref(audioDelay); }
      if (audioConvert) { gst_object_unref(audioConvert); }
      if (audioResample) { gst_object_unref(audioResample); }
      if (audioCapsfilter) { gst_object_unref(audioCapsfilter); }
      if (audioEncoder) { gst_object_unref(audioEncoder); }
      if (audioEncodedCapsfilter) { gst_object_unref(audioEncodedCapsfilter); }
      if (audioParser) { gst_object_unref(audioParser); }
      if (audioMuxQueue) { gst_object_unref(audioMuxQueue); }
      gst_object_unref(bin);
      return branch;
    }
  }

  g_object_set(queue,
    "max-size-buffers", 8,
    "max-size-time", static_cast<guint64>(0),
    "max-size-bytes", 0,
    /*
     * REC es una salida del mixer, no una entrada critica. Si el encoder o el
     * muxer se bloquean, esta cola debe soltar frames antes que propagar
     * backpressure hacia el tee de Program y congelar la realizacion live.
     */
    "leaky", 2,
    NULL);

  g_object_set(videoMuxQueue,
    /*
     * Esta cola ya transporta H.264 codificado. No puede ser leaky: tirar un
     * P-frame comprimido rompe la cadena de referencias hasta el siguiente IDR
     * y el MP4 se ve con macrobloques/distorsion. La cola leaky que protege el
     * directo esta antes del encoder, donde descartar raw frames es seguro.
     */
    "max-size-buffers", 0,
    "max-size-time", static_cast<guint64>(10 * GST_SECOND),
    "max-size-bytes", 0,
    NULL);

  g_object_set(rate,
    /*
     * El Program compuesto sale de una rama live que puede arrancar con GAPs o
     * duraciones heredadas de WebRTC. Para REC no basta con etiquetar el fichero
     * como 30fps: antes del encoder imponemos una cadencia maxima real.
     */
    "max-rate", config.frameRateNum,
    "drop-only", TRUE,
    NULL);
  configure_recording_videorate(rate);

  const bool isVideoToolboxEncoder = encoderName == "vtenc_h264_hw" || encoderName == "vtenc_h264";

  GstCaps* encoderCaps = isVideoToolboxEncoder
    ? gst_caps_new_simple("video/x-raw",
      "format", G_TYPE_STRING, "NV12",
      "width", G_TYPE_INT, config.internalWidth,
      "height", G_TYPE_INT, config.internalHeight,
      "framerate", GST_TYPE_FRACTION, config.frameRateNum, config.frameRateDen,
      "colorimetry", G_TYPE_STRING, "bt709",
      NULL)
    : gst_caps_new_simple("video/x-raw",
      "format", G_TYPE_STRING, "I420",
      "width", G_TYPE_INT, config.internalWidth,
      "height", G_TYPE_INT, config.internalHeight,
      "framerate", GST_TYPE_FRACTION, config.frameRateNum, config.frameRateDen,
      NULL);
  g_object_set(capsfilter, "caps", encoderCaps, NULL);
  gst_caps_unref(encoderCaps);

  if (isVideoToolboxEncoder) {
    GstCaps* encodedCaps = gst_caps_new_simple("video/x-h264",
      "profile", G_TYPE_STRING, "baseline",
      "stream-format", G_TYPE_STRING, "avc",
      "alignment", G_TYPE_STRING, "au",
      NULL);
    g_object_set(encodedCapsfilter, "caps", encodedCaps, NULL);
    gst_caps_unref(encodedCaps);
  }

  g_object_set(sink,
    "location", config.filePath.c_str(),
    "sync", FALSE,
    "async", FALSE,
    NULL);

  gst_bin_add_many(
    GST_BIN(bin),
    queue, convert, rate, capsfilter, encoder, encodedCapsfilter, parser,
    videoMuxQueue, muxer, sink,
    NULL);
  if (config.audioEnabled) {
    gst_bin_add_many(
      GST_BIN(bin),
      audioSource, audioQueue, audioDelay, audioConvert, audioResample,
      audioCapsfilter, audioEncoder, audioEncodedCapsfilter, audioParser, audioMuxQueue,
      NULL);

    g_object_set(audioQueue,
      "max-size-buffers", 0,
      "max-size-time", static_cast<guint64>(2 * GST_SECOND),
      "max-size-bytes", 0,
      NULL);
    set_bool_property_if_exists(audioSource, "is-live", true);
    set_bool_property_if_exists(audioSource, "do-timestamp", true);
    const gchar* audioDevice = g_getenv("OPENMIX_RECORDING_AUDIO_DEVICE");
    if (audioDevice && audioDevice[0] != '\0') {
      set_object_arg_if_exists(audioSource, "device", audioDevice);
    }
    set_bool_property_if_exists(audioDelay, "sync", false);
    set_int64_property_if_exists(
      audioDelay,
      "ts-offset",
      static_cast<gint64>(config.audioDelayMs) * GST_MSECOND);
    g_object_set(audioMuxQueue,
      /*
       * El audio comprimido tambien llega ya listo para el contenedor. Mantener
       * orden y continuidad aqui es mas importante que ahorrar unos pocos KB.
       */
      "max-size-buffers", 0,
      "max-size-time", static_cast<guint64>(10 * GST_SECOND),
      "max-size-bytes", 0,
      NULL);

    const char* rawAudioFormat = audioEncoderName == "avenc_aac" ? "F32LE" : "S16LE";
    GstCaps* audioCaps = gst_caps_new_simple("audio/x-raw",
      "format", G_TYPE_STRING, rawAudioFormat,
      "layout", G_TYPE_STRING, "interleaved",
      "rate", G_TYPE_INT, config.audioRate,
      "channels", G_TYPE_INT, config.audioChannels,
      NULL);
    g_object_set(audioCapsfilter, "caps", audioCaps, NULL);
    gst_caps_unref(audioCaps);

    GstCaps* encodedAudioCaps = gst_caps_new_simple("audio/mpeg",
      "mpegversion", G_TYPE_INT, 4,
      "stream-format", G_TYPE_STRING, "raw",
      NULL);
    g_object_set(audioEncodedCapsfilter, "caps", encodedAudioCaps, NULL);
    gst_caps_unref(encodedAudioCaps);
  }

  if (!gst_element_link_many(
      queue, convert, rate, capsfilter, encoder, encodedCapsfilter, parser,
      videoMuxQueue, muxer, sink,
      NULL)) {
    gst_object_unref(bin);
    return branch;
  }

  if (config.audioEnabled &&
      !gst_element_link_many(
        audioSource, audioQueue, audioDelay, audioConvert, audioResample,
        audioCapsfilter, audioEncoder, audioEncodedCapsfilter, audioParser, audioMuxQueue,
        muxer, NULL)) {
    gst_object_unref(bin);
    return branch;
  }

  /*
   * El encoder puede volver a etiquetar buffers con el running-time del mixer.
   * Justo antes del muxer necesitamos una cadencia local 30fps: si se dejan PTS
   * absolutos, una grabacion corta acaba durando desde el arranque del mixer.
   */
  add_recording_retimer_probe(
    parser,
    "src",
    gst_util_uint64_scale_int(GST_SECOND, config.frameRateDen, config.frameRateNum),
    config.recordingTimelineGeneration,
    true);
  /*
   * Antes de videorate normalizamos solo el segmento/base temporal, pero sin
   * forzar una secuencia sintetica. Asi evitamos que elementos intermedios vean
   * el running-time viejo del mixer.
   */
  add_recording_retimer_probe(
    queue,
    "src",
    gst_util_uint64_scale_int(GST_SECOND, config.frameRateDen, config.frameRateNum),
    config.recordingTimelineGeneration,
    false);
  /*
   * El frame gate limita la entrada al encoder por tiempo real, antes de H.264,
   * que es el punto seguro para descartar duplicados o rafagas.
   */
  add_recording_realtime_frame_gate_probe(
    capsfilter,
    "src",
    gst_util_uint64_scale_int(GST_SECOND, config.frameRateDen, config.frameRateNum),
    config.frameRateNum);
  if (config.audioEnabled) {
    add_recording_retimer_probe(
      audioParser,
      "src",
      gst_util_uint64_scale_int(GST_SECOND, 1024, config.audioRate),
      config.recordingTimelineGeneration);
  }

  GstPad* audioMuxerSinkPad = nullptr;
  if (config.audioEnabled && audioMuxQueue) {
    GstPad* audioQueueSrcPad = gst_element_get_static_pad(audioMuxQueue, "src");
    if (audioQueueSrcPad) {
      audioMuxerSinkPad = gst_pad_get_peer(audioQueueSrcPad);
      gst_object_unref(audioQueueSrcPad);
    }
  }

  GstPad* queueSinkPad = gst_element_get_static_pad(queue, "sink");
  GstPad* ghostSinkPad = gst_ghost_pad_new("sink", queueSinkPad);
  gst_object_unref(queueSinkPad);

  if (!ghostSinkPad || !gst_element_add_pad(bin, ghostSinkPad)) {
    if (ghostSinkPad) { gst_object_unref(ghostSinkPad); }
    gst_object_unref(bin);
    return branch;
  }

  branch.bin = bin;
  branch.encoder = encoder;
  branch.audioDelay = audioDelay;
  branch.audioSource = audioSource;
  branch.audioMuxQueue = audioMuxQueue;
  branch.audioMuxerSinkPad = audioMuxerSinkPad;
  branch.fileSink = sink;
  branch.encoderName = encoderName.empty() ? muxerName : encoderName;
  branch.audioEncoderName = audioEncoderName;
  branch.audioSourceName = config.audioEnabled ? config.audioSourceName : "";
  branch.audioEnabled = config.audioEnabled;
  return branch;
}

GstElement* set_recording_compositor_sleeping(
  GstElement* compositor,
  bool shouldSleep)
{
  if (!compositor) {
    return nullptr;
  }

  if (shouldSleep) {
    // locked_state impide que el pipeline padre vuelva a subir este
    // compositor a PLAYING. Así evitamos que force-live genere frames
    // 1080p vacíos cuando REC está apagado.
    gst_element_set_locked_state(compositor, TRUE);
    gst_element_set_state(compositor, GST_STATE_READY);
    return nullptr;
  }

  gst_element_set_locked_state(compositor, FALSE);
  return GST_ELEMENT(gst_object_ref(compositor));
}

void sync_recording_compositor_state(GstElement* compositor)
{
  if (!compositor) {
    return;
  }

  /*
   * Despertar el compositor REC puede recalcular latencia en todo el pipeline.
   * Se hace fuera del mutex del mixer para que los hilos live de WebRTC,
   * multiview y grafismo puedan avanzar mientras GStreamer resuelve el cambio.
   */
  printf("[Output] REC despertando compositor 1080p...\n");
  gst_element_sync_state_with_parent(compositor);
  printf("[Output] REC compositor 1080p despierto\n");
  gst_object_unref(compositor);
}
