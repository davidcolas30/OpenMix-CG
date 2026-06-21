#include "recording_elements.h"

#include "gst_utils.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

void configure_recording_videorate(GstElement* rate)
{
  if (!rate) {
    return;
  }

  /*
   * Las ramas 1080p de REC pueden estar cerradas durante minutos y conservar
   * CAPS/SEGMENT para abrirse sin renegociar. Si videorate rellena el hueco
   * entre ese SEGMENT antiguo y el primer frame real, el MP4 gana segundos de
   * imagen congelada. skip-to-first evita inventar frames antes de recibir el
   * primero, y max-duplication-time acota pequenos huecos sin convertir una
   * parada real en una secuencia larga de duplicados.
   */
  set_bool_property_if_exists(rate, "skip-to-first", true);
  set_uint64_property_if_exists(rate, "max-duplication-time", 250 * GST_MSECOND);
  set_uint64_property_if_exists(rate, "max-closing-segment-duplication-duration", 0);
}

static int estimate_recording_bitrate_kbps(const std::string& videoPreset, int qualityCrf)
{
  const int normalizedCrf = std::max(18, std::min(28, qualityCrf));
  const double qualityScale = 1.0 + static_cast<double>(28 - normalizedCrf) * 0.08;
  double presetScale = 1.0;
  if (videoPreset == "medium") {
    presetScale = 0.90;
  } else if (videoPreset == "fast") {
    presetScale = 1.0;
  } else {
    presetScale = 1.10;
  }

  return static_cast<int>(12000.0 * qualityScale * presetScale);
}

static void configure_h264_encoder(
  GstElement* encoder,
  const std::string& encoderName,
  const std::string& videoPreset,
  int qualityCrf,
  int frameRateNum)
{
  const int bitrateKbps = estimate_recording_bitrate_kbps(videoPreset, qualityCrf);

  if (encoderName == "x264enc") {
    const char* x264SpeedPreset = videoPreset == "veryfast" ? "ultrafast" : videoPreset.c_str();
    set_int_property_if_exists(encoder, "bitrate", bitrateKbps);
    set_int_property_if_exists(encoder, "key-int-max", frameRateNum * 2);
    set_int_property_if_exists(encoder, "rc-lookahead", 0);
    set_int_property_if_exists(encoder, "sync-lookahead", 0);
    set_bool_property_if_exists(encoder, "sliced-threads", true);
    set_bool_property_if_exists(encoder, "cabac", false);
    set_object_arg_if_exists(encoder, "speed-preset", x264SpeedPreset);
    set_object_arg_if_exists(encoder, "tune", "zerolatency");
    return;
  }

  if (encoderName == "avenc_h264") {
    set_int_property_if_exists(encoder, "bit_rate", bitrateKbps * 1000);
    return;
  }

  // Los encoders VideoToolbox trabajan en hardware y no exponen CRF.
  // Mapeamos las opciones de la UI a bitrate para conservar una semantica
  // comprensible: menor CRF implica mas bits y, por tanto, mas calidad.
  set_int_property_if_exists(encoder, "bitrate", bitrateKbps);
  set_object_arg_if_exists(encoder, "profile", "baseline");
  set_bool_property_if_exists(encoder, "realtime", true);
  set_bool_property_if_exists(encoder, "allow-frame-reordering", false);
  set_int_property_if_exists(encoder, "max-keyframe-interval", frameRateNum * 2);
}

static bool probe_videotoolbox_h264_encoder()
{
  static int cachedResult = -1;
  if (cachedResult != -1) {
    return cachedResult == 1;
  }

  GError* error = nullptr;
  GstElement* probePipeline = gst_parse_launch(
    "videotestsrc num-buffers=2 is-live=false ! "
    "videoconvert ! "
    "video/x-raw,format=NV12,width=1920,height=1080,framerate=30/1,colorimetry=bt709 ! "
    "vtenc_h264_hw realtime=true allow-frame-reordering=false ! "
    "video/x-h264,profile=baseline,stream-format=avc,alignment=au ! "
    "h264parse ! fakesink sync=false",
    &error);

  if (error) {
    fprintf(stderr, "[Output] VideoToolbox no disponible para REC: %s\n", error->message);
    g_error_free(error);
    cachedResult = 0;
    return false;
  }

  if (!probePipeline) {
    fprintf(stderr, "[Output] VideoToolbox no disponible para REC: no se pudo crear pipeline de prueba\n");
    cachedResult = 0;
    return false;
  }

  bool isAvailable = false;
  GstStateChangeReturn stateResult = gst_element_set_state(probePipeline, GST_STATE_PLAYING);
  if (stateResult != GST_STATE_CHANGE_FAILURE) {
    GstBus* bus = gst_element_get_bus(probePipeline);
    GstMessage* msg = gst_bus_timed_pop_filtered(
      bus,
      3 * GST_SECOND,
      static_cast<GstMessageType>(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));

    if (msg) {
      if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_EOS) {
        isAvailable = true;
      } else if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_ERROR) {
        GError* gstError = nullptr;
        gchar* debugInfo = nullptr;
        gst_message_parse_error(msg, &gstError, &debugInfo);
        fprintf(stderr,
          "[Output] VideoToolbox no disponible para REC 1080p: %s%s%s\n",
          gstError ? gstError->message : "error desconocido",
          debugInfo ? " | debug=" : "",
          debugInfo ? debugInfo : "");
        if (gstError) { g_error_free(gstError); }
        if (debugInfo) { g_free(debugInfo); }
      }
      gst_message_unref(msg);
    } else {
      fprintf(stderr, "[Output] VideoToolbox no disponible para REC: timeout en prueba 1080p\n");
    }

    gst_object_unref(bus);
  } else {
    fprintf(stderr, "[Output] VideoToolbox no disponible para REC: fallo al arrancar pipeline de prueba\n");
  }

  gst_element_set_state(probePipeline, GST_STATE_NULL);
  gst_object_unref(probePipeline);

  cachedResult = isAvailable ? 1 : 0;
  printf("[Output] Preflight VideoToolbox H264 1080p: %s\n", isAvailable ? "OK" : "NO DISPONIBLE");
  return isAvailable;
}

GstElement* make_h264_encoder(
  const std::string& videoPreset,
  int qualityCrf,
  int frameRateNum,
  std::string& selectedEncoderName)
{
  const char* hardwareCandidates[] = { "vtenc_h264_hw", "vtenc_h264" };
  const char* softwareCandidates[] = { "x264enc", "avenc_h264" };

  // En modo auto no basta con comprobar que existe el plugin applemedia:
  // VideoToolbox puede estar instalado y aun asi fallar al crear una sesion
  // H.264 1080p. Por eso hacemos un preflight real y elegimos HW solo si codifica.
  const char* encoderMode = std::getenv("OPENMIX_RECORDING_H264_ENCODER");
  const bool forceHardware = encoderMode != nullptr && std::strcmp(encoderMode, "hardware") == 0;
  const bool forceSoftware = encoderMode != nullptr && std::strcmp(encoderMode, "software") == 0;
  const bool forceSpecificEncoder =
    encoderMode != nullptr &&
    (std::strcmp(encoderMode, "vtenc_h264_hw") == 0 ||
     std::strcmp(encoderMode, "vtenc_h264") == 0 ||
     std::strcmp(encoderMode, "x264enc") == 0 ||
     std::strcmp(encoderMode, "avenc_h264") == 0);

  const bool useHardwareByAuto = !forceHardware && !forceSoftware && !forceSpecificEncoder &&
    probe_videotoolbox_h264_encoder();

  const char** candidates = useHardwareByAuto ? hardwareCandidates : softwareCandidates;
  size_t candidateCount = useHardwareByAuto
    ? sizeof(hardwareCandidates) / sizeof(hardwareCandidates[0])
    : sizeof(softwareCandidates) / sizeof(softwareCandidates[0]);
  const char* specificEncoderCandidates[] = { encoderMode };

  if (forceSpecificEncoder) {
    candidates = specificEncoderCandidates;
    candidateCount = sizeof(specificEncoderCandidates) / sizeof(specificEncoderCandidates[0]);
  } else if (forceHardware) {
    candidates = hardwareCandidates;
    candidateCount = sizeof(hardwareCandidates) / sizeof(hardwareCandidates[0]);
  } else if (forceSoftware) {
    candidates = softwareCandidates;
    candidateCount = sizeof(softwareCandidates) / sizeof(softwareCandidates[0]);
  }

  for (size_t i = 0; i < candidateCount; i++) {
    const char* candidate = candidates[i];
    GstElement* encoder = gst_element_factory_make(candidate, nullptr);
    if (!encoder) {
      continue;
    }

    selectedEncoderName = candidate;
    configure_h264_encoder(encoder, selectedEncoderName, videoPreset, qualityCrf, frameRateNum);
    return encoder;
  }

  return nullptr;
}

GstElement* make_recording_muxer(const std::string& container, std::string& selectedMuxerName)
{
  if (container == "mkv") {
    selectedMuxerName = "matroskamux";
    return gst_element_factory_make("matroskamux", nullptr);
  }

  GstElement* muxer = gst_element_factory_make("mp4mux", nullptr);
  if (muxer) {
    selectedMuxerName = "mp4mux";
    set_bool_property_if_exists(muxer, "faststart", true);
    return muxer;
  }

  muxer = gst_element_factory_make("qtmux", nullptr);
  if (muxer) {
    selectedMuxerName = "qtmux";
    set_bool_property_if_exists(muxer, "faststart", true);
  }
  return muxer;
}

static bool gst_element_factory_exists(const char* factoryName)
{
  GstElementFactory* factory = gst_element_factory_find(factoryName);
  if (!factory) {
    return false;
  }

  gst_object_unref(factory);
  return true;
}

GstElement* make_recording_system_memory_bridge(const char* name)
{
  GstElement* element = gst_element_factory_make("gldownload", name);
  if (element) {
    return element;
  }

  /*
   * gldownload acepta tanto GLMemory como memoria CPU y permite bajar a sistema
   * texturas que entregan vtdec/uridecodebin en macOS. Si el plugin GL no
   * existe, identity mantiene viva la ruta software.
   */
  return gst_element_factory_make("identity", name);
}

std::string resolve_recording_audio_source_name()
{
  const gchar* rawSource = g_getenv("OPENMIX_RECORDING_AUDIO_SOURCE");
  if (!rawSource || rawSource[0] == '\0') {
    rawSource = g_getenv("OPENMIX_LOCAL_AUDIO_SOURCE");
  }

  if (!rawSource || rawSource[0] == '\0' ||
      g_ascii_strcasecmp(rawSource, "auto") == 0 ||
      g_ascii_strcasecmp(rawSource, "default") == 0) {
    return gst_element_factory_exists("osxaudiosrc") ? "osxaudiosrc" : "autoaudiosrc";
  }

  if (g_ascii_strcasecmp(rawSource, "osx") == 0 ||
      g_ascii_strcasecmp(rawSource, "mac") == 0 ||
      g_ascii_strcasecmp(rawSource, "macos") == 0 ||
      g_ascii_strcasecmp(rawSource, "osxaudiosrc") == 0) {
    return "osxaudiosrc";
  }

  if (g_ascii_strcasecmp(rawSource, "autoaudiosrc") == 0) {
    return "autoaudiosrc";
  }

  if (gst_element_factory_exists(rawSource)) {
    return rawSource;
  }

  fprintf(stderr,
    "[RecordingAudio] OPENMIX_RECORDING_AUDIO_SOURCE=%s no existe; usando fuente por defecto\n",
    rawSource);
  return gst_element_factory_exists("osxaudiosrc") ? "osxaudiosrc" : "autoaudiosrc";
}

int clamp_recording_audio_delay_ms(int requestedDelayMs, int minDelayMs, int maxDelayMs)
{
  return std::max(minDelayMs, std::min(maxDelayMs, requestedDelayMs));
}

GstElement* make_recording_audio_encoder(
  std::string& selectedEncoderName,
  int audioBitrate)
{
  const char* encoderMode = std::getenv("OPENMIX_RECORDING_AUDIO_ENCODER");
  std::vector<std::string> candidates;

  if (encoderMode && std::strlen(encoderMode) > 0 &&
      std::strcmp(encoderMode, "auto") != 0) {
    candidates.emplace_back(encoderMode);
  } else {
    candidates = { "fdkaacenc", "avenc_aac", "faac" };
  }

  for (const std::string& candidate : candidates) {
    GstElement* encoder = gst_element_factory_make(candidate.c_str(), nullptr);
    if (!encoder) {
      continue;
    }

    selectedEncoderName = candidate;
    if (candidate == "avenc_aac") {
      set_int_property_if_exists(encoder, "bit_rate", audioBitrate);
    } else {
      set_int_property_if_exists(encoder, "bitrate", audioBitrate);
    }
    set_object_arg_if_exists(encoder, "profile", "lc");
    set_bool_property_if_exists(encoder, "afterburner", false);
    return encoder;
  }

  return nullptr;
}
