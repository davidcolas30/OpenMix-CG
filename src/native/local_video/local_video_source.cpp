#include "local_video_source.h"

#include "gst_utils.h"
#include "recording_elements.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <thread>

static LocalVideoSourceRuntimeContext g_localVideoRuntimeContext;

void set_local_video_source_runtime_context(
  const LocalVideoSourceRuntimeContext& context)
{
  g_localVideoRuntimeContext = context;
}

static bool is_local_video_source_index(int sourceIndex)
{
  return sourceIndex >= g_localVideoRuntimeContext.firstSourceIndex &&
    sourceIndex < g_localVideoRuntimeContext.sourceCount;
}

static LocalVideoSource* get_local_video_source_from_context(int sourceIndex)
{
  if (!is_local_video_source_index(sourceIndex) ||
      !g_localVideoRuntimeContext.sources) {
    return nullptr;
  }
  return g_localVideoRuntimeContext.sources[sourceIndex];
}

void reset_local_video_timeline_anchor(LocalVideoSource* source)
{
  if (!source) {
    return;
  }

  std::lock_guard<std::mutex> timelineLock(source->timelineMutex);
  source->timelineAnchorValid = false;
  source->hasLastRetimerPts = false;
  source->lastOriginalPts = GST_CLOCK_TIME_NONE;
  source->lastNormalizedPts = GST_CLOCK_TIME_NONE;
  source->nextSyntheticPts = GST_CLOCK_TIME_NONE;
}

static GstPadProbeReturn on_local_video_pause_gate_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* /*info*/,
  gpointer /*userData*/)
{
  /*
   * Un probe BLOCK mantiene el pad detenido mientras el probe exista. No
   * dormimos el thread ni usamos condition_variable: GStreamer aplica
   * backpressure hacia decodebin y el ultimo frame ya entregado se queda vivo
   * en los selectores de Program/Preview.
   */
  return GST_PAD_PROBE_OK;
}

void install_local_video_pause_gate(LocalVideoSource* source, GstPad* pad)
{
  if (!source || !pad) {
    return;
  }

  std::lock_guard<std::mutex> pauseLock(source->pauseGateMutex);
  if (source->pauseGateProbeId != 0) {
    source->pauseGateTargetRetimedFrame = 0;
    return;
  }

  source->pauseGateTargetRetimedFrame = 0;
  source->pauseGateProbeId = gst_pad_add_probe(
    pad,
    GST_PAD_PROBE_TYPE_BLOCK_DOWNSTREAM,
    on_local_video_pause_gate_probe,
    source,
    nullptr);
}

void schedule_local_video_pause_gate(LocalVideoSource* source)
{
  if (!source || !g_localVideoRuntimeContext.mixerMutex) {
    return;
  }

  const int sourceIndex = source->sourceIndex;
  const uint64_t instanceId = source->instanceId;
  std::thread([sourceIndex, instanceId]() {
    /*
     * El probe BLOCK se instala un poco despues de observar el primer buffer.
     * Asi ese frame alcanza los selectores y puede quedar como referencia de
     * cue; bloquearlo en el mismo probe dejaria el monitor negro.
     */
    std::this_thread::sleep_for(std::chrono::milliseconds(40));

    std::lock_guard<std::mutex> lock(*g_localVideoRuntimeContext.mixerMutex);
    LocalVideoSource* currentSource = get_local_video_source_from_context(sourceIndex);
    if (!currentSource ||
        currentSource->instanceId != instanceId ||
        !currentSource->paused) {
      return;
    }

    install_local_video_pause_gate(currentSource, currentSource->pauseGatePad);
  }).detach();
}

void remove_local_video_pause_gate(LocalVideoSource* source)
{
  if (!source) {
    return;
  }

  GstPad* pad = nullptr;
  gulong probeId = 0;
  {
    std::lock_guard<std::mutex> pauseLock(source->pauseGateMutex);
    source->pauseGateTargetRetimedFrame = 0;
    probeId = source->pauseGateProbeId;
    source->pauseGateProbeId = 0;
    pad = source->pauseGatePad;
    if (pad) {
      gst_object_ref(pad);
    }
  }

  if (pad && probeId != 0) {
    gst_pad_remove_probe(pad, probeId);
  }
  if (pad) {
    gst_object_unref(pad);
  }
}

void refresh_paused_local_video_after_route_change_locked(int sourceIndex)
{
  LocalVideoSource* source = get_local_video_source_from_context(sourceIndex);
  if (!source || !source->paused) {
    return;
  }

  /*
   * Si un clip pausado pasa a Program o Preview, puede haber ramas que estaban
   * cerradas y no tenian el frame congelado. Dejamos salir un frame con PTS
   * reanclado al running-time actual y volvemos a cerrar el flujo por
   * backpressure. Es un avance minimo, pero evita barras persistentes.
   */
  remove_local_video_pause_gate(source);
  if (source->clockSync) {
    g_signal_emit_by_name(source->clockSync, "resync");
  }
  reset_local_video_timeline_anchor(source);
  schedule_local_video_pause_gate(source);
}

GstPadProbeReturn on_local_video_retime_buffer_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  auto* source = static_cast<LocalVideoSource*>(userData);
  if (!source) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  const GstClockTime frameDuration =
    gst_util_uint64_scale_int(
      GST_SECOND,
      g_localVideoRuntimeContext.frameRateDen,
      g_localVideoRuntimeContext.frameRateNum);
  const GstClockTime runningTime = g_localVideoRuntimeContext.getRunningTime
    ? g_localVideoRuntimeContext.getRunningTime()
    : 0;
  if (!GST_CLOCK_TIME_IS_VALID(frameDuration) || frameDuration == 0 ||
      !GST_CLOCK_TIME_IS_VALID(runningTime)) {
    return GST_PAD_PROBE_OK;
  }

  const GstClockTime originalPts = GST_BUFFER_PTS(buffer);
  const bool hadValidPts = GST_CLOCK_TIME_IS_VALID(originalPts);
  const bool hadValidDuration =
    GST_CLOCK_TIME_IS_VALID(GST_BUFFER_DURATION(buffer)) && GST_BUFFER_DURATION(buffer) > 0;

  buffer = gst_buffer_make_writable(buffer);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }
  GST_PAD_PROBE_INFO_DATA(info) = buffer;

  std::lock_guard<std::mutex> timelineLock(source->timelineMutex);

  GstClockTime normalizedPts = runningTime;
  if (!source->timelineAnchorValid) {
    source->timelineAnchorValid = true;
    source->hasLastRetimerPts = true;
    source->lastOriginalPts = hadValidPts ? originalPts : GST_CLOCK_TIME_NONE;
    source->lastNormalizedPts = runningTime;
    source->nextSyntheticPts = runningTime + frameDuration;
  } else if (hadValidPts && source->hasLastRetimerPts &&
             GST_CLOCK_TIME_IS_VALID(source->lastOriginalPts) &&
             originalPts > source->lastOriginalPts) {
    GstClockTime originalDelta = originalPts - source->lastOriginalPts;
    const GstClockTime maxTrustedDelta = frameDuration * 3;
    const GstClockTime minTrustedDelta = frameDuration / 2;
    if (originalDelta < minTrustedDelta || originalDelta > maxTrustedDelta) {
      originalDelta = frameDuration;
      source->correctedPtsJumps += 1;
    }
    normalizedPts = source->lastNormalizedPts + originalDelta;
  } else if (GST_CLOCK_TIME_IS_VALID(source->nextSyntheticPts)) {
    normalizedPts = source->nextSyntheticPts;
    if (hadValidPts && source->hasLastRetimerPts) {
      source->correctedPtsJumps += 1;
    }
  }

  /*
   * Pausas, seeks y carga tardia pueden dejar el timeline normalizado por
   * detras del running-time real. Reanclamos antes de que el compositor decida
   * conservar el ultimo frame visible de Program.
   */
  const GstClockTime maxDrift = frameDuration * 6;
  const bool tooFarBehind = normalizedPts + maxDrift < runningTime;
  const bool tooFarAhead = normalizedPts > runningTime + maxDrift;
  if (tooFarBehind || tooFarAhead) {
    normalizedPts = runningTime;
    source->correctedPtsJumps += 1;
  }

  GST_BUFFER_PTS(buffer) = normalizedPts;
  GST_BUFFER_DTS(buffer) = GST_CLOCK_TIME_NONE;
  if (!hadValidDuration) {
    GST_BUFFER_DURATION(buffer) = frameDuration;
  }

  source->lastOriginalPts = hadValidPts ? originalPts : GST_CLOCK_TIME_NONE;
  source->lastNormalizedPts = normalizedPts;
  source->nextSyntheticPts = normalizedPts + frameDuration;
  source->hasLastRetimerPts = true;
  source->retimedFrames += 1;
  const uint64_t retimedFrames = source->retimedFrames;

  {
    std::lock_guard<std::mutex> pauseLock(source->pauseGateMutex);
    if (source->pauseGateTargetRetimedFrame > 0 &&
        retimedFrames >= source->pauseGateTargetRetimedFrame &&
        source->pauseGateProbeId == 0) {
      source->pauseGateTargetRetimedFrame = 0;
      schedule_local_video_pause_gate(source);
    }
  }

  return GST_PAD_PROBE_OK;
}

static void schedule_local_video_loop_seek(int sourceIndex)
{
  if (!is_local_video_source_index(sourceIndex) ||
      !g_localVideoRuntimeContext.mixerMutex ||
      !g_localVideoRuntimeContext.restartSourceLocked) {
    return;
  }

  LocalVideoSource* source = get_local_video_source_from_context(sourceIndex);
  if (!source || source->loopSeekPending.exchange(true)) {
    return;
  }

  std::thread([sourceIndex]() {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));

    std::lock_guard<std::mutex> lock(*g_localVideoRuntimeContext.mixerMutex);
    LocalVideoSource* currentSource = get_local_video_source_from_context(sourceIndex);
    if (!currentSource) {
      return;
    }

    currentSource->loopSeekPending.store(false);
    if (!currentSource->loopEnabled || currentSource->paused) {
      return;
    }

    g_localVideoRuntimeContext.restartSourceLocked(sourceIndex);
  }).detach();
}

GstPadProbeReturn on_local_video_branch_event_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  auto* source = static_cast<LocalVideoSource*>(userData);
  if (!source || !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM)) {
    return GST_PAD_PROBE_OK;
  }

  GstEvent* event = GST_PAD_PROBE_INFO_EVENT(info);
  if (event &&
      (GST_EVENT_TYPE(event) == GST_EVENT_FLUSH_START ||
       GST_EVENT_TYPE(event) == GST_EVENT_FLUSH_STOP)) {
    /*
     * Si un elemento interno del fichero emite flush, no debe escapar al mixer
     * compartido: Program/Preview y los monitores nativos no pertenecen al clip
     * local y podrian quedarse en estado flushing, dejando CUT sin efecto hasta
     * reiniciar la app.
     */
    return GST_PAD_PROBE_DROP;
  }

  if (event && GST_EVENT_TYPE(event) == GST_EVENT_EOS) {
    if (source->loopEnabled && !source->paused) {
      /*
       * El EOS llega en un thread de streaming. Programamos el seek en otro
       * thread corto para no hacer una operacion FLUSH desde el propio pad que
       * esta propagando el evento.
       */
      schedule_local_video_loop_seek(source->sourceIndex);
      return GST_PAD_PROBE_DROP;
    }

    /*
     * Un clip local no debe propagar EOS al pipeline completo del mixer: al
     * terminar, el slot simplemente conserva su ultimo frame hasta que el
     * operador cargue otro fichero o libere la fuente.
     */
    printf("[LocalVideo] Fuente %d llego a EOS; se mantiene el ultimo frame en el selector\n",
      source->sourceIndex);
    return GST_PAD_PROBE_DROP;
  }

  return GST_PAD_PROBE_OK;
}

void on_local_video_decodebin_pad_added(
  GstElement* /*decodebin*/,
  GstPad* pad,
  gpointer userData)
{
  auto* source = static_cast<LocalVideoSource*>(userData);
  if (!source || !source->bin) {
    return;
  }

  GstCaps* caps = gst_pad_get_current_caps(pad);
  if (!caps) {
    caps = gst_pad_query_caps(pad, NULL);
  }
  if (!caps || gst_caps_get_size(caps) == 0) {
    if (caps) { gst_caps_unref(caps); }
    return;
  }

  const GstStructure* structure = gst_caps_get_structure(caps, 0);
  const gchar* mediaType = gst_structure_get_name(structure);
  if (!mediaType || !g_str_has_prefix(mediaType, "video/")) {
    if (mediaType && g_str_has_prefix(mediaType, "audio/")) {
      GstElement* audioQueue = gst_element_factory_make("queue", NULL);
      GstElement* audioSink = gst_element_factory_make("fakesink", NULL);
      if (audioQueue && audioSink) {
        g_object_set(audioSink, "sync", FALSE, "async", FALSE, NULL);
        gst_bin_add_many(GST_BIN(source->bin), audioQueue, audioSink, NULL);
        gst_element_link(audioQueue, audioSink);
        gst_element_sync_state_with_parent(audioQueue);
        gst_element_sync_state_with_parent(audioSink);

        GstPad* audioSinkPad = gst_element_get_static_pad(audioQueue, "sink");
        if (audioSinkPad) {
          gst_pad_link(pad, audioSinkPad);
          gst_object_unref(audioSinkPad);
        }
      } else {
        if (audioQueue) { gst_object_unref(audioQueue); }
        if (audioSink) { gst_object_unref(audioSink); }
      }
    }
    gst_caps_unref(caps);
    return;
  }

  GstElement* decodeQueue = gst_bin_get_by_name(GST_BIN(source->bin), "decode_queue");
  if (!decodeQueue) {
    gst_caps_unref(caps);
    return;
  }

  GstPad* sinkPad = gst_element_get_static_pad(decodeQueue, "sink");
  if (!sinkPad || gst_pad_is_linked(sinkPad)) {
    if (sinkPad) { gst_object_unref(sinkPad); }
    gst_object_unref(decodeQueue);
    gst_caps_unref(caps);
    return;
  }

  GstPadLinkReturn ret = gst_pad_link(pad, sinkPad);
  gst_object_unref(sinkPad);
  gst_object_unref(decodeQueue);

  gchar* capsText = gst_caps_to_string(caps);
  if (ret == GST_PAD_LINK_OK) {
    printf("[LocalVideo] Fuente %d conectada desde fichero (%s)\n",
      source->sourceIndex, capsText ? capsText : "video/x-raw");
  } else {
    fprintf(stderr,
      "[LocalVideo] Error enlazando decodebin a fuente %d: %d (%s)\n",
      source->sourceIndex, ret, capsText ? capsText : "caps desconocidas");
  }
  g_free(capsText);
  gst_caps_unref(caps);
}

LocalVideoSourceBranch create_local_video_source_branch(
  const LocalVideoSourceBranchConfig& config)
{
  LocalVideoSourceBranch branch;
  auto* source = new LocalVideoSource();
  source->instanceId = config.instanceId;
  source->sourceIndex = config.sourceIndex;
  source->uri = config.uri;

  char binName[64];
  snprintf(binName, sizeof(binName), "local_video_source_%d", config.sourceIndex);
  GstElement* bin = gst_bin_new(binName);
  GstElement* decodebin = gst_element_factory_make("uridecodebin", "local_decodebin");
  GstElement* decodeQueue = gst_element_factory_make("queue", "decode_queue");
  GstElement* retimeClock = gst_element_factory_make("clocksync", "local_retime_clock");
  GstElement* decodedTee = gst_element_factory_make("tee", "local_decoded_tee");
  GstElement* monitorQueue = gst_element_factory_make("queue", "local_monitor_queue");
  GstElement* monitorConvert = gst_element_factory_make("videoconvert", "local_monitor_convert");
  GstElement* monitorScale = gst_element_factory_make("videoscale", "local_monitor_scale");
  GstElement* monitorRate = gst_element_factory_make("videorate", "local_monitor_rate");
  GstElement* monitorCapsfilter = gst_element_factory_make("capsfilter", "local_monitor_caps");
  GstElement* monitorOutQueue = gst_element_factory_make("queue", "local_monitor_out_queue");
  GstElement* recordingValve = gst_element_factory_make("valve", "local_recording_valve");
  GstElement* recordingQueue = gst_element_factory_make("queue", "local_recording_queue");
  GstElement* recordingDownload = make_recording_system_memory_bridge("local_recording_download");
  GstElement* recordingSystemCapsfilter =
    gst_element_factory_make("capsfilter", "local_recording_system_caps");
  GstElement* recordingConvert = gst_element_factory_make("videoconvert", "local_recording_convert");
  GstElement* recordingScale = gst_element_factory_make("videoscale", "local_recording_scale");
  GstElement* recordingRate = gst_element_factory_make("videorate", "local_recording_rate");
  GstElement* recordingCapsfilter = gst_element_factory_make("capsfilter", "local_recording_caps");
  GstElement* recordingOutQueue = gst_element_factory_make("queue", "local_recording_out_queue");

  if (!bin || !decodebin || !decodeQueue || !retimeClock || !decodedTee ||
      !monitorQueue || !monitorConvert || !monitorScale || !monitorRate ||
      !monitorCapsfilter || !monitorOutQueue ||
      !recordingValve || !recordingQueue || !recordingDownload ||
      !recordingSystemCapsfilter || !recordingConvert || !recordingScale ||
      !recordingRate || !recordingCapsfilter || !recordingOutQueue) {
    if (bin) { gst_object_unref(bin); }
    delete source;
    return branch;
  }

  source->bin = bin;
  source->clockSync = retimeClock;
  source->recordingBranchValve = recordingValve;

  g_object_set(decodebin, "uri", config.uri.c_str(), NULL);
  g_object_set(decodeQueue,
    "max-size-buffers", static_cast<guint>(8),
    "max-size-bytes", static_cast<guint>(0),
    "max-size-time", static_cast<guint64>(0),
    /*
     * Esta cola queda antes de clocksync. En ficheros locales queremos
     * backpressure, no descarte: si fuese leaky, decodebin podria decodificar
     * el clip en rafaga y clocksync recibiria solo un subconjunto de frames,
     * provocando el "primer frame congelado" que ve el operador.
     */
    "leaky", 0,
    NULL);
  /*
   * Un fichero local no es una fuente live: si lo conectamos directamente al
   * mixer, decodebin puede soltar todos los buffers en rafaga y el operador
   * solo ve un frame congelado. clocksync convierte el timeline del fichero
   * en reproduccion contra el GstClock del pipeline padre.
   */
  g_object_set(retimeClock,
    "sync", TRUE,
    "sync-to-first", TRUE,
    "qos", FALSE,
    NULL);
  g_object_set(monitorScale, "add-borders", TRUE, NULL);
  g_object_set(recordingScale, "add-borders", TRUE, NULL);
  configure_recording_videorate(recordingRate);
  g_object_set(recordingRate,
    /*
     * Esta videorate solo debe imponer un maximo y normalizar caps. Si duplica
     * frames aqui, la rama REC comprime duplicados y el fichero parece ir a
     * tirones aunque el contenedor declare 30fps.
     */
    "max-rate", config.frameRateNum,
    "drop-only", TRUE,
    NULL);
  g_object_set(monitorQueue,
    "max-size-buffers", static_cast<guint>(2),
    "max-size-bytes", static_cast<guint>(0),
    "max-size-time", static_cast<guint64>(0),
    "leaky", 2,
    NULL);
  g_object_set(monitorOutQueue,
    "max-size-buffers", static_cast<guint>(2),
    "max-size-bytes", static_cast<guint>(0),
    "max-size-time", static_cast<guint64>(0),
    "leaky", 2,
    NULL);
  g_object_set(recordingQueue,
    "max-size-buffers", static_cast<guint>(2),
    "max-size-bytes", static_cast<guint>(0),
    "max-size-time", static_cast<guint64>(0),
    "leaky", 2,
    NULL);
  g_object_set(recordingOutQueue,
    "max-size-buffers", config.recordingRawQueueBuffers,
    "max-size-bytes", static_cast<guint>(0),
    "max-size-time", static_cast<guint64>(0),
    "leaky", 2,
    NULL);
  g_object_set(recordingValve,
    "drop", config.recordingValveOpen ? FALSE : TRUE,
    NULL);
  /*
   * Igual que en WebRTC, la rama REC del video local debe conservar CAPS y
   * SEGMENT mientras esta cerrada para poder abrirse sin renegociar a ciegas.
   * No usamos transform-to-gap aqui: esos GAPs pueden convertirse en frames
   * repetidos al arrancar la grabacion y desalinear audio/video.
   */
  set_object_arg_if_exists(recordingValve, "drop-mode", "forward-sticky-events");

  GstCaps* monitorCaps = gst_caps_new_simple("video/x-raw",
    "format", G_TYPE_STRING, "I420",
    "width", G_TYPE_INT, config.monitorWidth,
    "height", G_TYPE_INT, config.monitorHeight,
    "framerate", GST_TYPE_FRACTION, config.frameRateNum, config.frameRateDen,
    "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
    NULL);
  g_object_set(monitorCapsfilter, "caps", monitorCaps, NULL);
  gst_caps_unref(monitorCaps);

  GstCaps* recordingSystemCaps = gst_caps_new_empty_simple("video/x-raw");
  g_object_set(recordingSystemCapsfilter, "caps", recordingSystemCaps, NULL);
  gst_caps_unref(recordingSystemCaps);

  GstCaps* recordingCaps = gst_caps_new_simple("video/x-raw",
    "format", G_TYPE_STRING, "I420",
    "width", G_TYPE_INT, config.internalWidth,
    "height", G_TYPE_INT, config.internalHeight,
    "framerate", GST_TYPE_FRACTION, config.frameRateNum, config.frameRateDen,
    "pixel-aspect-ratio", GST_TYPE_FRACTION, 1, 1,
    NULL);
  g_object_set(recordingCapsfilter, "caps", recordingCaps, NULL);
  gst_caps_unref(recordingCaps);

  gst_bin_add_many(GST_BIN(bin),
    decodebin, decodeQueue, retimeClock, decodedTee,
    monitorQueue, monitorConvert, monitorScale, monitorRate, monitorCapsfilter, monitorOutQueue,
    recordingValve, recordingQueue, recordingDownload, recordingSystemCapsfilter,
    recordingConvert, recordingScale, recordingRate, recordingCapsfilter, recordingOutQueue,
    NULL);

  const bool internalLinked =
    gst_element_link_many(decodeQueue, retimeClock, decodedTee, NULL) &&
    gst_element_link_many(monitorQueue, monitorConvert, monitorScale, monitorRate,
      monitorCapsfilter, monitorOutQueue, NULL) &&
    gst_element_link_many(recordingValve, recordingQueue, recordingDownload,
      recordingSystemCapsfilter, recordingConvert, recordingScale, recordingRate,
      recordingCapsfilter, recordingOutQueue, NULL);

  GstPadTemplate* teePadTemplate =
    gst_element_class_get_pad_template(GST_ELEMENT_GET_CLASS(decodedTee), "src_%u");
  GstPad* monitorTeePad = gst_element_request_pad(decodedTee, teePadTemplate, nullptr, nullptr);
  GstPad* recordingTeePad = gst_element_request_pad(decodedTee, teePadTemplate, nullptr, nullptr);
  GstPad* monitorQueueSinkPad = gst_element_get_static_pad(monitorQueue, "sink");
  GstPad* recordingValveSinkPad = gst_element_get_static_pad(recordingValve, "sink");
  const bool teeLinked =
    monitorTeePad && recordingTeePad && monitorQueueSinkPad && recordingValveSinkPad &&
    gst_pad_link(monitorTeePad, monitorQueueSinkPad) == GST_PAD_LINK_OK &&
    gst_pad_link(recordingTeePad, recordingValveSinkPad) == GST_PAD_LINK_OK;
  if (monitorQueueSinkPad) { gst_object_unref(monitorQueueSinkPad); }
  if (recordingValveSinkPad) { gst_object_unref(recordingValveSinkPad); }

  if (!internalLinked || !teeLinked) {
    gst_object_unref(bin);
    delete source;
    return branch;
  }

  GstPad* retimeOutPad = gst_element_get_static_pad(retimeClock, "src");
  if (retimeOutPad) {
    source->retimeSrcPad = retimeOutPad;
    if (config.retimeBufferProbe) {
      gst_pad_add_probe(
        retimeOutPad,
        GST_PAD_PROBE_TYPE_BUFFER,
        config.retimeBufferProbe,
        source,
        nullptr);
    }
  }
  source->pauseGatePad = gst_element_get_static_pad(retimeClock, "sink");

  GstPad* monitorOutPad = gst_element_get_static_pad(monitorOutQueue, "src");
  if (monitorOutPad) {
    if (config.branchEventProbe) {
      gst_pad_add_probe(
        monitorOutPad,
        GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM,
        config.branchEventProbe,
        source,
        nullptr);
    }
    gst_object_unref(monitorOutPad);
  }
  GstPad* recordingOutPad = gst_element_get_static_pad(recordingOutQueue, "src");
  if (recordingOutPad) {
    if (config.branchEventProbe) {
      gst_pad_add_probe(
        recordingOutPad,
        GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM,
        config.branchEventProbe,
        source,
        nullptr);
    }
    gst_object_unref(recordingOutPad);
  }

  if (config.decodebinPadAddedCallback) {
    g_signal_connect(
      decodebin,
      "pad-added",
      config.decodebinPadAddedCallback,
      source);
  }

  branch.source = source;
  branch.monitorOutQueue = monitorOutQueue;
  branch.recordingOutQueue = recordingOutQueue;
  return branch;
}
