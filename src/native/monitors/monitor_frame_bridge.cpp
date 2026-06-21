#include "monitor_frame_bridge.h"

#include <algorithm>
#include <cstdio>
#include <string>

struct FrameData {
  GstBuffer* buffer = nullptr;
  gsize size = 0;
  int width = 0;
  int height = 0;
  std::string format;
};

static MonitorFrameBridgeContext g_context;

void set_monitor_frame_bridge_context(const MonitorFrameBridgeContext& context)
{
  g_context = context;
}

const char* monitor_ipc_mode_label(MonitorIpcMode mode)
{
  switch (mode) {
    case MONITOR_IPC_PGM_ONLY:
      return "pgm";
    case MONITOR_IPC_PVW_ONLY:
      return "pvw";
    case MONITOR_IPC_NONE:
      return "none";
    case MONITOR_IPC_BOTH:
    default:
      return "both";
  }
}

bool should_forward_monitor_frame(MonitorIpcMode mode, MonitorFrameTarget target)
{
  switch (mode) {
    case MONITOR_IPC_NONE:
      return false;
    case MONITOR_IPC_PGM_ONLY:
      return target == MONITOR_FRAME_TARGET_PGM;
    case MONITOR_IPC_PVW_ONLY:
      return target == MONITOR_FRAME_TARGET_PVW;
    case MONITOR_IPC_BOTH:
    default:
      return true;
  }
}

void reset_stream_diagnostics(StreamDiagnostics& diagnostics)
{
  diagnostics.producedFrames = 0;
  diagnostics.queuedFramesToJs = 0;
  diagnostics.queueFullDrops = 0;
  diagnostics.lastReportTime = std::chrono::steady_clock::now();
}

static bool context_bool(bool* value, bool defaultValue = false)
{
  return value ? *value : defaultValue;
}

static int context_int(int* value, int defaultValue)
{
  return value ? *value : defaultValue;
}

static GstElement* context_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

static MonitorIpcMode context_monitor_ipc_mode()
{
  return g_context.monitorIpcMode ? *g_context.monitorIpcMode : MONITOR_IPC_NONE;
}

static bool should_emit_monitor_frame(std::chrono::steady_clock::time_point* lastFrameTime)
{
  if (!lastFrameTime) {
    return true;
  }

  const bool mediaPlaneActive = g_context.mediaPlaneActive &&
    g_context.mediaPlaneActive->load();
  const bool hasActivePeer = g_context.activeWebrtcPeerCount &&
    g_context.activeWebrtcPeerCount->load() > 0;
  const bool shouldUseActiveCadence = mediaPlaneActive || hasActivePeer;
  const int activeFps = context_int(g_context.monitorActiveFps, g_context.maxMonitorFps);
  if (shouldUseActiveCadence && activeFps >= g_context.maxMonitorFps) {
    return true;
  }

  auto now = std::chrono::steady_clock::now();
  int intervalMs = shouldUseActiveCadence
    ? context_int(g_context.monitorActiveIntervalMs, 1)
    : context_int(g_context.monitorIdleIntervalMs, 200);

  if (lastFrameTime->time_since_epoch().count() == 0) {
    *lastFrameTime = now;
    return true;
  }

  auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    now - *lastFrameTime).count();
  if (elapsedMs < intervalMs) {
    return false;
  }

  *lastFrameTime = now;
  return true;
}

static void maybe_log_stream_diagnostics(StreamDiagnostics& diagnostics)
{
  if (!context_bool(g_context.realtimeDiagnosticLogsEnabled)) {
    return;
  }

  auto now = std::chrono::steady_clock::now();
  if (diagnostics.lastReportTime.time_since_epoch().count() == 0) {
    diagnostics.lastReportTime = now;
    return;
  }

  auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    now - diagnostics.lastReportTime).count();
  if (elapsedMs < g_context.diagnosticLogIntervalMs) {
    return;
  }

  double producedFps = diagnostics.producedFrames * 1000.0 / elapsedMs;
  double queuedFps = diagnostics.queuedFramesToJs * 1000.0 / elapsedMs;
  const bool mediaPlaneActive = g_context.mediaPlaneActive &&
    g_context.mediaPlaneActive->load();

  printf("[Mixer] %s: salida=%.1ffps hacia appsink, encoladoJS=%.1ffps, queueFullDrops=%d, ipc=%s, monitorMode=%s\n",
    diagnostics.name,
    producedFps,
    queuedFps,
    diagnostics.queueFullDrops,
    monitor_ipc_mode_label(context_monitor_ipc_mode()),
    mediaPlaneActive ? "active" : "idle");

  diagnostics.producedFrames = 0;
  diagnostics.queuedFramesToJs = 0;
  diagnostics.queueFullDrops = 0;
  diagnostics.lastReportTime = now;
}

static bool extract_frame(GstAppSink* appsink, FrameData& outFrame)
{
  GstSample* sample = gst_app_sink_pull_sample(appsink);
  if (!sample) {
    return false;
  }

  GstBuffer* buffer = gst_sample_get_buffer(sample);
  if (!buffer) {
    gst_sample_unref(sample);
    return false;
  }

  GstCaps* caps = gst_sample_get_caps(sample);
  GstStructure* structure = caps ? gst_caps_get_structure(caps, 0) : nullptr;
  int width = 0;
  int height = 0;
  if (structure) {
    gst_structure_get_int(structure, "width", &width);
    gst_structure_get_int(structure, "height", &height);
  }
  const gchar* format = structure ? gst_structure_get_string(structure, "format") : nullptr;

  // Tomamos una referencia del GstBuffer para cruzar a JS sin copiar en el
  // hilo de streaming. La copia a Buffer de Node se hace dentro de la TSFN.
  outFrame.buffer = gst_buffer_ref(buffer);
  outFrame.size = gst_buffer_get_size(buffer);
  outFrame.width = width;
  outFrame.height = height;
  outFrame.format = format ? format : "";

  gst_sample_unref(sample);
  return true;
}

static void discard_sample(GstAppSink* appsink)
{
  GstSample* sample = gst_app_sink_pull_sample(appsink);
  if (sample) {
    gst_sample_unref(sample);
  }
}

static void send_frame_to_js(
  Napi::ThreadSafeFunction* tsfn,
  const FrameData& frame,
  int sourceIndex = -1,
  StreamDiagnostics* diagnostics = nullptr)
{
  if (!tsfn) {
    if (frame.buffer) {
      gst_buffer_unref(frame.buffer);
    }
    return;
  }

  GstBuffer* buffer = frame.buffer;
  gsize size = frame.size;
  int w = frame.width;
  int h = frame.height;
  std::string format = frame.format;
  int idx = sourceIndex;

  napi_status status = tsfn->NonBlockingCall(
    [buffer, size, w, h, format, idx](Napi::Env env, Napi::Function jsCallback) {
      GstMapInfo map;
      if (!gst_buffer_map(buffer, &map, GST_MAP_READ)) {
        gst_buffer_unref(buffer);
        return;
      }
      auto buf = Napi::Buffer<uint8_t>::Copy(env, map.data, std::min(map.size, size));
      gst_buffer_unmap(buffer, &map);
      gst_buffer_unref(buffer);

      Napi::Object frameInfo = Napi::Object::New(env);
      frameInfo.Set("width", Napi::Number::New(env, w));
      frameInfo.Set("height", Napi::Number::New(env, h));
      frameInfo.Set("data", buf);
      if (!format.empty()) {
        frameInfo.Set("format", Napi::String::New(env, format));
      }
      if (idx >= 0) {
        frameInfo.Set("sourceIndex", Napi::Number::New(env, idx));
      }

      jsCallback.Call({ frameInfo });
    }
  );

  if (status == napi_ok) {
    if (diagnostics) {
      diagnostics->queuedFramesToJs++;
    }
  } else if (status == napi_queue_full) {
    if (diagnostics) {
      diagnostics->queueFullDrops++;
    }
  }

  if (status != napi_ok && buffer) {
    gst_buffer_unref(buffer);
  }
}

GstFlowReturn on_monitor_frame_bridge_pgm_sample(GstAppSink* appsink, gpointer /*userData*/)
{
  StreamDiagnostics* diagnostics = g_context.pgmDiagnostics;
  if (diagnostics) {
    diagnostics->producedFrames++;
  }

  if (!should_emit_monitor_frame(g_context.lastPgmMonitorFrameTime)) {
    discard_sample(appsink);
    if (diagnostics) {
      maybe_log_stream_diagnostics(*diagnostics);
    }
    return GST_FLOW_OK;
  }
  if (!should_forward_monitor_frame(context_monitor_ipc_mode(), MONITOR_FRAME_TARGET_PGM)) {
    discard_sample(appsink);
    if (diagnostics) {
      maybe_log_stream_diagnostics(*diagnostics);
    }
    return GST_FLOW_OK;
  }

  FrameData frame;
  if (!extract_frame(appsink, frame)) {
    return GST_FLOW_ERROR;
  }
  send_frame_to_js(g_context.pgmFrameCallback, frame, -1, diagnostics);
  if (diagnostics) {
    maybe_log_stream_diagnostics(*diagnostics);
  }
  return GST_FLOW_OK;
}

GstFlowReturn on_monitor_frame_bridge_pvw_sample(GstAppSink* appsink, gpointer /*userData*/)
{
  StreamDiagnostics* diagnostics = g_context.pvwDiagnostics;
  if (diagnostics) {
    diagnostics->producedFrames++;
  }

  if (!should_emit_monitor_frame(g_context.lastPvwMonitorFrameTime)) {
    discard_sample(appsink);
    if (diagnostics) {
      maybe_log_stream_diagnostics(*diagnostics);
    }
    return GST_FLOW_OK;
  }
  if (!should_forward_monitor_frame(context_monitor_ipc_mode(), MONITOR_FRAME_TARGET_PVW)) {
    discard_sample(appsink);
    if (diagnostics) {
      maybe_log_stream_diagnostics(*diagnostics);
    }
    return GST_FLOW_OK;
  }

  FrameData frame;
  if (!extract_frame(appsink, frame)) {
    return GST_FLOW_ERROR;
  }
  send_frame_to_js(g_context.pvwFrameCallback, frame, -1, diagnostics);
  if (diagnostics) {
    maybe_log_stream_diagnostics(*diagnostics);
  }
  return GST_FLOW_OK;
}

GstFlowReturn on_monitor_frame_bridge_audio_reference_sample(
  GstAppSink* appsink,
  gpointer /*userData*/)
{
  FrameData frame;
  if (!extract_frame(appsink, frame)) {
    return GST_FLOW_ERROR;
  }
  send_frame_to_js(g_context.audioReferenceFrameCallback, frame);
  return GST_FLOW_OK;
}

GstFlowReturn on_monitor_frame_bridge_pgm_recording_sample(
  GstAppSink* appsink,
  gpointer /*userData*/)
{
  if (!context_bool(g_context.programRecordingEnabled)) {
    discard_sample(appsink);
    return GST_FLOW_OK;
  }

  FrameData frame;
  if (!extract_frame(appsink, frame)) {
    return GST_FLOW_ERROR;
  }
  send_frame_to_js(g_context.pgmRecordingFrameCallback, frame);
  return GST_FLOW_OK;
}

GstFlowReturn on_monitor_frame_bridge_thumb_sample(GstAppSink* appsink, gpointer userData)
{
  int sourceIndex = GPOINTER_TO_INT(userData);

  if (!context_bool(g_context.thumbnailsEnabled)) {
    discard_sample(appsink);
    return GST_FLOW_OK;
  }

  if (!g_context.lastThumbTime ||
      sourceIndex < 0 ||
      sourceIndex >= g_context.sourceCount) {
    discard_sample(appsink);
    return GST_FLOW_OK;
  }

  auto now = std::chrono::steady_clock::now();
  auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
    now - g_context.lastThumbTime[sourceIndex]).count();

  if (elapsed < g_context.thumbIntervalMs) {
    discard_sample(appsink);
    return GST_FLOW_OK;
  }

  g_context.lastThumbTime[sourceIndex] = now;

  FrameData frame;
  if (!extract_frame(appsink, frame)) {
    return GST_FLOW_ERROR;
  }
  send_frame_to_js(g_context.thumbFrameCallback, frame, sourceIndex);
  return GST_FLOW_OK;
}

static void dispatch_bus_message_to_js(GstMessage* msg)
{
  const char* typeName = GST_MESSAGE_TYPE_NAME(msg);
  std::string errorMsg;
  std::string debugInfo;
  GstElement* pipeline = context_pipeline();

  switch (GST_MESSAGE_TYPE(msg)) {
    case GST_MESSAGE_ERROR: {
      GError* err = nullptr;
      gchar* debug = nullptr;
      gst_message_parse_error(msg, &err, &debug);
      if (err) {
        errorMsg = err->message;
        g_error_free(err);
      }
      if (debug) {
        debugInfo = debug;
        g_free(debug);
      }
      break;
    }
    case GST_MESSAGE_WARNING: {
      GError* err = nullptr;
      gchar* debug = nullptr;
      gst_message_parse_warning(msg, &err, &debug);
      if (err) {
        errorMsg = err->message;
        g_error_free(err);
      }
      if (debug) {
        debugInfo = debug;
        g_free(debug);
      }
      break;
    }
    case GST_MESSAGE_STATE_CHANGED: {
      if (!pipeline || GST_MESSAGE_SRC(msg) != GST_OBJECT(pipeline)) {
        return;
      }
      GstState oldState;
      GstState newState;
      GstState pending;
      gst_message_parse_state_changed(msg, &oldState, &newState, &pending);
      errorMsg = std::string(gst_element_state_get_name(oldState)) + " -> " +
        gst_element_state_get_name(newState);
      break;
    }
    case GST_MESSAGE_EOS:
      break;
    default:
      return;
  }

  if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_ERROR || GST_MESSAGE_TYPE(msg) == GST_MESSAGE_WARNING) {
    fprintf(stderr,
      "[GStreamer Bus] %s: %s%s%s\n",
      typeName,
      errorMsg.empty() ? "(sin mensaje)" : errorMsg.c_str(),
      debugInfo.empty() ? "" : " | debug=",
      debugInfo.empty() ? "" : debugInfo.c_str());
  }

  if (!g_context.busCallback) {
    return;
  }

  std::string typeStr(typeName);
  g_context.busCallback->BlockingCall(
    [typeStr, errorMsg, debugInfo](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object msgObj = Napi::Object::New(env);
      msgObj.Set("type", Napi::String::New(env, typeStr));
      if (!errorMsg.empty()) {
        msgObj.Set("message", Napi::String::New(env, errorMsg));
      }
      if (!debugInfo.empty()) {
        msgObj.Set("debug", Napi::String::New(env, debugInfo));
      }
      jsCallback.Call({ msgObj });
    }
  );
}

GstBusSyncReply on_monitor_frame_bridge_bus_sync_message(
  GstBus* /*bus*/,
  GstMessage* msg,
  gpointer /*userData*/)
{
  GstElement* pipeline = context_pipeline();
  const bool shouldRecalculateLatency =
    GST_MESSAGE_TYPE(msg) == GST_MESSAGE_LATENCY &&
    pipeline &&
    context_bool(g_context.syncBufferEnabled) &&
    g_context.syncBufferDecodedPeerCount &&
    g_context.syncBufferMinPeers &&
    g_context.syncBufferDecodedPeerCount->load() >= *g_context.syncBufferMinPeers;

  if (shouldRecalculateLatency) {
    gst_bin_recalculate_latency(GST_BIN(pipeline));
  }

  dispatch_bus_message_to_js(msg);
  return GST_BUS_PASS;
}
