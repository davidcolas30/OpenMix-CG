#include "recording_probes.h"

#include "env_utils.h"

#include <chrono>
#include <cinttypes>
#include <cstdio>

struct RecordingRetimerState {
  bool basePtsSet = false;
  bool segmentLogged = false;
  bool forceSequential = false;
  bool resetOnRecordingTimeline = false;
  const std::atomic<uint64_t>* recordingTimelineGeneration = nullptr;
  uint64_t observedGeneration = 0;
  GstClockTime basePts = 0;
  GstClockTime nextPts = 0;
  GstClockTime defaultDuration = GST_CLOCK_TIME_NONE;
};

struct RecordingRealtimeFrameGateState {
  bool started = false;
  bool logDrops = false;
  std::chrono::steady_clock::time_point startedAt;
  std::chrono::steady_clock::time_point lastLogAt;
  std::chrono::nanoseconds frameInterval{0};
  uint64_t acceptedFrames = 0;
  uint64_t droppedFrames = 0;
  uint64_t droppedSinceLog = 0;
};

static void reset_recording_retimer_timeline(RecordingRetimerState* state)
{
  if (!state || !state->resetOnRecordingTimeline || !state->recordingTimelineGeneration) {
    return;
  }

  const uint64_t currentGeneration =
    state->recordingTimelineGeneration->load(std::memory_order_relaxed);
  if (state->observedGeneration == currentGeneration) {
    return;
  }

  state->observedGeneration = currentGeneration;
  state->basePtsSet = false;
  state->segmentLogged = false;
  state->basePts = 0;
  state->nextPts = 0;
}

static GstClockTime get_recording_buffer_input_pts(GstBuffer* buffer)
{
  if (!buffer) {
    return GST_CLOCK_TIME_NONE;
  }

  GstClockTime inputPts = GST_BUFFER_PTS(buffer);
  if (!GST_CLOCK_TIME_IS_VALID(inputPts)) {
    inputPts = GST_BUFFER_DTS(buffer);
  }
  return inputPts;
}

static bool should_drop_recording_buffer(
  RecordingRetimerState* state,
  GstBuffer* buffer)
{
  if (!state || !buffer || state->forceSequential) {
    return false;
  }

  const GstClockTime inputPts = get_recording_buffer_input_pts(buffer);
  return GST_CLOCK_TIME_IS_VALID(inputPts) &&
    state->basePtsSet &&
    inputPts < state->basePts;
}

static void retime_recording_writable_buffer(
  RecordingRetimerState* state,
  GstBuffer* buffer)
{
  if (!state || !buffer) {
    return;
  }

  GstClockTime duration = state->forceSequential
    ? state->defaultDuration
    : GST_BUFFER_DURATION(buffer);
  if (!GST_CLOCK_TIME_IS_VALID(duration) || duration == 0) {
    duration = state->defaultDuration;
  }

  const GstClockTime inputPts = get_recording_buffer_input_pts(buffer);
  GstClockTime outputPts = state->nextPts;
  if (state->forceSequential) {
    outputPts = state->nextPts;
  } else if (GST_CLOCK_TIME_IS_VALID(inputPts)) {
    if (!state->basePtsSet) {
      state->basePts = inputPts;
      state->basePtsSet = true;
    }

    if (inputPts >= state->basePts) {
      outputPts = inputPts - state->basePts;
    }
  }

  if (outputPts < state->nextPts) {
    outputPts = state->nextPts;
  }

  GST_BUFFER_PTS(buffer) = outputPts;
  GST_BUFFER_DTS(buffer) = outputPts;
  if (GST_CLOCK_TIME_IS_VALID(duration) && duration > 0) {
    GST_BUFFER_DURATION(buffer) = duration;
    state->nextPts = outputPts + duration;
  } else {
    state->nextPts = outputPts + GST_MSECOND;
  }
}

static GstPadProbeReturn retime_recording_buffer_list(
  RecordingRetimerState* state,
  GstPadProbeInfo* info)
{
  GstBufferList* list = GST_PAD_PROBE_INFO_BUFFER_LIST(info);
  if (!state || !list) {
    return GST_PAD_PROBE_OK;
  }

  list = gst_buffer_list_make_writable(list);

  /*
   * h264parse/aacparse pueden entregar GstBufferList. Si solo retimeamos
   * GST_PAD_PROBE_TYPE_BUFFER, esos paquetes salen con PTS/duracion originales
   * y el MP4 puede durar minutos aunque REC haya estado activo unos segundos.
   */
  for (guint i = 0; i < gst_buffer_list_length(list);) {
    GstBuffer* buffer = gst_buffer_list_get(list, i);
    if (!buffer) {
      gst_buffer_list_remove(list, i, 1);
      continue;
    }

    if (should_drop_recording_buffer(state, buffer)) {
      gst_buffer_list_remove(list, i, 1);
      continue;
    }

    buffer = gst_buffer_list_get_writable(list, i);
    if (!buffer) {
      gst_buffer_list_remove(list, i, 1);
      continue;
    }

    retime_recording_writable_buffer(state, buffer);
    i++;
  }

  if (gst_buffer_list_length(list) == 0) {
    GST_PAD_PROBE_INFO_DATA(info) = list;
    return GST_PAD_PROBE_DROP;
  }

  GST_PAD_PROBE_INFO_DATA(info) = list;
  return GST_PAD_PROBE_OK;
}

static GstPadProbeReturn retime_recording_pad_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  RecordingRetimerState* state = static_cast<RecordingRetimerState*>(userData);
  if (!state) {
    return GST_PAD_PROBE_OK;
  }
  reset_recording_retimer_timeline(state);

  if (GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM) {
    GstEvent* event = GST_PAD_PROBE_INFO_EVENT(info);
    if (event && GST_EVENT_TYPE(event) == GST_EVENT_SEGMENT) {
      GstSegment recordingSegment;
      gst_segment_init(&recordingSegment, GST_FORMAT_TIME);
      recordingSegment.start = 0;
      recordingSegment.stop = GST_CLOCK_TIME_NONE;
      recordingSegment.time = 0;
      recordingSegment.base = 0;
      recordingSegment.position = 0;

      /*
       * REC se engancha a un tee que ya esta en PLAYING. Si solo reescribimos
       * PTS/DTS, mp4mux sigue recibiendo el SEGMENT antiguo y descarta los
       * buffers como "fuera de segmento". Por eso esta rama tiene su propio
       * segmento local: para el fichero, la grabacion siempre empieza en t=0.
       */
      GST_PAD_PROBE_INFO_DATA(info) = gst_event_new_segment(&recordingSegment);
      if (!state->segmentLogged) {
        printf("[Output] Segmento REC normalizado a t=0 para rama dinamica\n");
        state->segmentLogged = true;
      }
    }
    return GST_PAD_PROBE_OK;
  }

  if (GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER_LIST) {
    return retime_recording_buffer_list(state, info);
  }

  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = gst_pad_probe_info_get_buffer(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  if (should_drop_recording_buffer(state, buffer)) {
    return GST_PAD_PROBE_DROP;
  }

  buffer = gst_buffer_make_writable(buffer);
  retime_recording_writable_buffer(state, buffer);
  GST_PAD_PROBE_INFO_DATA(info) = buffer;
  return GST_PAD_PROBE_OK;
}

static void destroy_recording_retimer_state(gpointer userData)
{
  delete static_cast<RecordingRetimerState*>(userData);
}

void add_recording_retimer_probe(
  GstElement* element,
  const char* padName,
  GstClockTime defaultDuration,
  const std::atomic<uint64_t>* recordingTimelineGeneration,
  bool forceSequential,
  GstClockTime initialBasePts,
  bool resetOnRecordingTimeline)
{
  if (!element || !padName) {
    return;
  }

  GstPad* pad = gst_element_get_static_pad(element, padName);
  if (!pad) {
    return;
  }

  RecordingRetimerState* state = new RecordingRetimerState();
  state->defaultDuration = defaultDuration;
  state->forceSequential = forceSequential;
  state->resetOnRecordingTimeline = resetOnRecordingTimeline;
  state->recordingTimelineGeneration = recordingTimelineGeneration;
  if (recordingTimelineGeneration) {
    state->observedGeneration =
      recordingTimelineGeneration->load(std::memory_order_relaxed);
  }
  if (GST_CLOCK_TIME_IS_VALID(initialBasePts)) {
    state->basePts = initialBasePts;
    state->basePtsSet = true;
  }

  /*
   * La rama de REC se conecta dinamicamente a un pipeline que ya lleva tiempo
   * en PLAYING. Algunos elementos entregan buffers con PTS absolutos o sin PTS.
   * Para MP4 necesitamos una linea temporal local, monotona y empezando en 0.
   */
  gst_pad_add_probe(
    pad,
    static_cast<GstPadProbeType>(
      GST_PAD_PROBE_TYPE_BUFFER |
      GST_PAD_PROBE_TYPE_BUFFER_LIST |
      GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM),
    retime_recording_pad_probe,
    state,
    destroy_recording_retimer_state);
  gst_object_unref(pad);
}

static void maybe_log_recording_frame_gate(
  RecordingRealtimeFrameGateState* state,
  const std::chrono::steady_clock::time_point& now)
{
  if (!state || !state->logDrops || state->droppedSinceLog == 0) {
    return;
  }

  if (state->lastLogAt.time_since_epoch().count() == 0) {
    state->lastLogAt = now;
    return;
  }

  if (now - state->lastLogAt < std::chrono::seconds(2)) {
    return;
  }

  printf(
    "[Output][REC frame gate] accepted=%" PRIu64 " dropped=%" PRIu64 " recentDrops=%" PRIu64 "\n",
    state->acceptedFrames,
    state->droppedFrames,
    state->droppedSinceLog);
  state->droppedSinceLog = 0;
  state->lastLogAt = now;
}

static GstPadProbeReturn recording_realtime_frame_gate_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  RecordingRealtimeFrameGateState* state =
    static_cast<RecordingRealtimeFrameGateState*>(userData);
  if (!state || state->frameInterval.count() <= 0) {
    return GST_PAD_PROBE_OK;
  }

  if (GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM) {
    GstEvent* event = GST_PAD_PROBE_INFO_EVENT(info);
    if (event && GST_EVENT_TYPE(event) == GST_EVENT_SEGMENT) {
      /*
       * La rama dinamica de REC puede heredar segmentos de un pipeline que ya
       * estaba en PLAYING. Si aparece un nuevo segmento, reiniciamos tambien el
       * contador real para que el limite de 30 fps se mida desde ese punto.
       */
      state->started = false;
      state->acceptedFrames = 0;
      state->droppedFrames = 0;
      state->droppedSinceLog = 0;
    }
    return GST_PAD_PROBE_OK;
  }

  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  const auto now = std::chrono::steady_clock::now();
  if (!state->started) {
    state->started = true;
    state->startedAt = now;
    state->lastLogAt = now;
  }

  const auto elapsed =
    std::chrono::duration_cast<std::chrono::nanoseconds>(now - state->startedAt);
  const uint64_t allowedFrames =
    static_cast<uint64_t>(elapsed.count() / state->frameInterval.count()) + 1;

  if (state->acceptedFrames >= allowedFrames) {
    state->droppedFrames++;
    state->droppedSinceLog++;
    maybe_log_recording_frame_gate(state, now);
    return GST_PAD_PROBE_DROP;
  }

  state->acceptedFrames++;
  maybe_log_recording_frame_gate(state, now);
  return GST_PAD_PROBE_OK;
}

static void destroy_recording_realtime_frame_gate_state(gpointer userData)
{
  delete static_cast<RecordingRealtimeFrameGateState*>(userData);
}

void add_recording_realtime_frame_gate_probe(
  GstElement* element,
  const char* padName,
  GstClockTime frameDuration,
  int frameRateNum)
{
  if (!element || !padName || !GST_CLOCK_TIME_IS_VALID(frameDuration) ||
      frameDuration == 0) {
    return;
  }

  if (!parse_env_bool_with_default("OPENMIX_RECORDING_FRAME_GATE", true, "Output")) {
    printf("[Output] REC frame gate desactivado por OPENMIX_RECORDING_FRAME_GATE=off\n");
    return;
  }

  GstPad* pad = gst_element_get_static_pad(element, padName);
  if (!pad) {
    return;
  }

  RecordingRealtimeFrameGateState* state = new RecordingRealtimeFrameGateState();
  state->frameInterval =
    std::chrono::nanoseconds(static_cast<int64_t>(frameDuration));
  state->logDrops =
    parse_env_bool_with_default("OPENMIX_RECORDING_FRAME_GATE_LOG", false, "Output");

  /*
   * Este limite va antes del encoder, con frames raw. Es el lugar seguro para
   * tirar duplicados o rafagas: despues de H.264, descartar P-frames podria
   * romper referencias hasta el siguiente keyframe.
   */
  gst_pad_add_probe(
    pad,
    static_cast<GstPadProbeType>(
      GST_PAD_PROBE_TYPE_BUFFER |
      GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM),
    recording_realtime_frame_gate_probe,
    state,
    destroy_recording_realtime_frame_gate_state);
  gst_object_unref(pad);

  printf(
    "[Output] REC frame gate activo: max=%dfps guard=%s\n",
    frameRateNum,
    state->logDrops ? "log" : "silent");
}
