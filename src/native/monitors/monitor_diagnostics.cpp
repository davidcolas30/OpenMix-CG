#include "monitor_diagnostics.h"

#include "webrtc_utils.h"

#include <gst/rtp/rtp.h>
#include <algorithm>
#include <cinttypes>
#include <cstdio>

static const int DIAGNOSTIC_LOG_INTERVAL_MS = 2000;
static MonitorDiagnosticsRuntimeContext g_monitorDiagnosticsContext;

static bool realtime_diagnostic_logs_enabled()
{
  return g_monitorDiagnosticsContext.realtimeDiagnosticLogsEnabled &&
    *g_monitorDiagnosticsContext.realtimeDiagnosticLogsEnabled;
}

static bool stutter_trace_enabled()
{
  return g_monitorDiagnosticsContext.stutterTraceEnabled &&
    *g_monitorDiagnosticsContext.stutterTraceEnabled;
}

static bool rtp_timeline_trace_enabled()
{
  return g_monitorDiagnosticsContext.rtpTimelineTraceEnabled &&
    *g_monitorDiagnosticsContext.rtpTimelineTraceEnabled;
}

static bool rtp_timeline_summary_enabled()
{
  return g_monitorDiagnosticsContext.rtpTimelineSummaryEnabled &&
    *g_monitorDiagnosticsContext.rtpTimelineSummaryEnabled;
}

void set_monitor_diagnostics_runtime_context(
  const MonitorDiagnosticsRuntimeContext& context)
{
  g_monitorDiagnosticsContext = context;
}

void reset_native_monitor_diagnostics(NativeMonitorDiagnostics& diagnostics)
{
  diagnostics.frames = 0;
  diagnostics.minIntervalMs = 1000000;
  diagnostics.maxIntervalMs = 0;
  diagnostics.slowFrames = 0;
  diagnostics.lastFrameTime = {};
  diagnostics.lastReportTime = std::chrono::steady_clock::now();
}

void reset_rtp_timeline_diagnostics(RtpTimelineDiagnostics& diagnostics)
{
  diagnostics.initialized = false;
  diagnostics.lastRtpTimestamp = 0;
  diagnostics.lastSeq = 0;
  diagnostics.timestampChanges = 0;
  diagnostics.slowGaps = 0;
  diagnostics.deliveryGaps = 0;
  diagnostics.maxWallDeltaMs = 0;
  diagnostics.rtpDeltaAtMaxWallMs = 0.0;
  diagnostics.seqDeltaAtMaxWall = 0;
  diagnostics.startTime = {};
  diagnostics.lastTimestampChangeTime = {};
  diagnostics.largestGaps.clear();
}

static void record_native_monitor_frame(NativeMonitorDiagnostics& diagnostics)
{
  if (!realtime_diagnostic_logs_enabled() && !stutter_trace_enabled()) {
    return;
  }

  auto now = std::chrono::steady_clock::now();

  if (diagnostics.lastFrameTime.time_since_epoch().count() != 0) {
    const int intervalMs = static_cast<int>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
        now - diagnostics.lastFrameTime).count());
    diagnostics.minIntervalMs = std::min(diagnostics.minIntervalMs, intervalMs);
    diagnostics.maxIntervalMs = std::max(diagnostics.maxIntervalMs, intervalMs);

    // A 30fps el intervalo ideal ronda 33ms. Marcamos >45ms porque ya suele
    // percibirse como microcongelacion en un monitor de realizacion.
    if (intervalMs > 45) {
      diagnostics.slowFrames += 1;
      if (stutter_trace_enabled()) {
        printf("[StutterTrace] %s frame lento interval=%dms\n",
          diagnostics.name,
          intervalMs);
      }
    }
  }

  diagnostics.lastFrameTime = now;
  diagnostics.frames += 1;

  if (diagnostics.lastReportTime.time_since_epoch().count() == 0) {
    diagnostics.lastReportTime = now;
    return;
  }

  const int elapsedMs = static_cast<int>(
    std::chrono::duration_cast<std::chrono::milliseconds>(
      now - diagnostics.lastReportTime).count());
  if (elapsedMs < DIAGNOSTIC_LOG_INTERVAL_MS) {
    return;
  }

  if (!realtime_diagnostic_logs_enabled()) {
    diagnostics.frames = 0;
    diagnostics.minIntervalMs = 1000000;
    diagnostics.maxIntervalMs = 0;
    diagnostics.slowFrames = 0;
    diagnostics.lastReportTime = now;
    return;
  }

  const double fps = diagnostics.frames * 1000.0 / std::max(elapsedMs, 1);
  const int minIntervalMs =
    diagnostics.minIntervalMs == 1000000 ? 0 : diagnostics.minIntervalMs;

  printf("[NativeMonitor] %s: entrada=%.1ffps intervalMs=min:%d max:%d slow>%dms=%d\n",
    diagnostics.name,
    fps,
    minIntervalMs,
    diagnostics.maxIntervalMs,
    45,
    diagnostics.slowFrames);

  diagnostics.frames = 0;
  diagnostics.minIntervalMs = 1000000;
  diagnostics.maxIntervalMs = 0;
  diagnostics.slowFrames = 0;
  diagnostics.lastReportTime = now;
}

GstPadProbeReturn on_native_monitor_buffer_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  auto* diagnostics = static_cast<NativeMonitorDiagnostics*>(userData);
  record_native_monitor_frame(*diagnostics);
  return GST_PAD_PROBE_OK;
}

bool should_attach_rtp_timeline_probes()
{
  return rtp_timeline_trace_enabled() || rtp_timeline_summary_enabled();
}

static void remember_rtp_timeline_gap(
  RtpTimelineDiagnostics& diagnostics,
  const RtpTimelineDiagnostics::GapSample& sample)
{
  static const size_t MAX_RETAINED_GAPS = 8;

  if (diagnostics.largestGaps.size() < MAX_RETAINED_GAPS) {
    diagnostics.largestGaps.push_back(sample);
    return;
  }

  auto smallest = std::min_element(
    diagnostics.largestGaps.begin(),
    diagnostics.largestGaps.end(),
    [](const auto& left, const auto& right) {
      return left.wallDeltaMs < right.wallDeltaMs;
    });

  if (smallest != diagnostics.largestGaps.end() &&
      sample.wallDeltaMs > smallest->wallDeltaMs) {
    *smallest = sample;
  }
}

void log_rtp_timeline_summary(const RtpTimelineDiagnostics& diagnostics)
{
  if (!rtp_timeline_summary_enabled() || diagnostics.timestampChanges == 0) {
    return;
  }

  std::vector<RtpTimelineDiagnostics::GapSample> largestGaps = diagnostics.largestGaps;
  std::sort(
    largestGaps.begin(),
    largestGaps.end(),
    [](const auto& left, const auto& right) {
      return left.wallDeltaMs > right.wallDeltaMs;
    });

  printf("[RtpTimelineSummary] %s changes=%" PRIu64 " slow>80ms=%" PRIu64
         " deliveryGaps=%" PRIu64 " maxWall=%dms maxRtp=%.1fms maxSeqDelta=%u\n",
    diagnostics.name.c_str(),
    diagnostics.timestampChanges,
    diagnostics.slowGaps,
    diagnostics.deliveryGaps,
    diagnostics.maxWallDeltaMs,
    diagnostics.rtpDeltaAtMaxWallMs,
    static_cast<unsigned int>(diagnostics.seqDeltaAtMaxWall));

  for (size_t i = 0; i < largestGaps.size(); i++) {
    const auto& sample = largestGaps[i];
    printf("[RtpTimelineSummary]   gap#%zu t=%dms wall=%dms rtp=%.1fms "
           "seqDelta=%u marker=%s\n",
      i + 1,
      sample.sinceStartMs,
      sample.wallDeltaMs,
      sample.rtpDeltaMs,
      static_cast<unsigned int>(sample.seqDelta),
      sample.marker ? "true" : "false");
  }
}

GstPadProbeReturn on_webrtc_rtp_timeline_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!should_attach_rtp_timeline_probes() ||
      !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  GstRTPBuffer rtpBuffer = GST_RTP_BUFFER_INIT;
  if (!gst_rtp_buffer_map(buffer, GST_MAP_READ, &rtpBuffer)) {
    return GST_PAD_PROBE_OK;
  }

  auto* diagnostics = static_cast<RtpTimelineDiagnostics*>(userData);
  if (diagnostics->clockRate == 0) {
    guint32 detectedClockRate = 0;
    describe_rtp_pad_caps(pad, &detectedClockRate);
    if (detectedClockRate > 0) {
      diagnostics->clockRate = detectedClockRate;
    }
  }

  const guint32 rtpTimestamp = gst_rtp_buffer_get_timestamp(&rtpBuffer);
  const guint16 seq = gst_rtp_buffer_get_seq(&rtpBuffer);
  const gboolean marker = gst_rtp_buffer_get_marker(&rtpBuffer);
  const auto now = std::chrono::steady_clock::now();

  if (!diagnostics->initialized) {
    diagnostics->initialized = true;
    diagnostics->lastRtpTimestamp = rtpTimestamp;
    diagnostics->lastSeq = seq;
    diagnostics->startTime = now;
    diagnostics->lastTimestampChangeTime = now;
    gst_rtp_buffer_unmap(&rtpBuffer);
    return GST_PAD_PROBE_OK;
  }

  if (rtpTimestamp != diagnostics->lastRtpTimestamp) {
    const int wallDeltaMs = static_cast<int>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
        now - diagnostics->lastTimestampChangeTime).count());
    const guint32 rtpDeltaTicks = rtpTimestamp - diagnostics->lastRtpTimestamp;
    const guint32 clockRate = diagnostics->clockRate > 0 ? diagnostics->clockRate : 90000;
    const double rtpDeltaMs =
      (static_cast<double>(rtpDeltaTicks) * 1000.0) / static_cast<double>(clockRate);
    const guint16 seqDelta = static_cast<guint16>(seq - diagnostics->lastSeq);
    diagnostics->timestampChanges += 1;

    if (wallDeltaMs > diagnostics->maxWallDeltaMs) {
      diagnostics->maxWallDeltaMs = wallDeltaMs;
      diagnostics->rtpDeltaAtMaxWallMs = rtpDeltaMs;
      diagnostics->seqDeltaAtMaxWall = seqDelta;
    }

    if (wallDeltaMs > 80) {
      diagnostics->slowGaps += 1;
      if (rtpDeltaMs <= 50.0) {
        diagnostics->deliveryGaps += 1;
      }

      const int sinceStartMs = static_cast<int>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
          now - diagnostics->startTime).count());
      remember_rtp_timeline_gap(
        *diagnostics,
        RtpTimelineDiagnostics::GapSample{
          sinceStartMs,
          wallDeltaMs,
          rtpDeltaMs,
          seqDelta,
          marker ? true : false
        });

      /*
       * Si wallDeltaMs es grande pero rtpDeltaMs ronda 33ms, el movil genero
       * frames a tiempo y algo los entrego en rafaga. Si ambos son grandes,
       * el emisor/captura dejo realmente un hueco temporal en la senal.
       */
      if (rtp_timeline_trace_enabled()) {
        printf("[RtpTimeline] %s timestamp-change wall=%dms rtp=%.1fms seqDelta=%u marker=%s\n",
          diagnostics->name.c_str(),
          wallDeltaMs,
          rtpDeltaMs,
          static_cast<unsigned int>(seqDelta),
          marker ? "true" : "false");
      }
    }

    diagnostics->lastRtpTimestamp = rtpTimestamp;
    diagnostics->lastTimestampChangeTime = now;
  }

  diagnostics->lastSeq = seq;
  gst_rtp_buffer_unmap(&rtpBuffer);
  return GST_PAD_PROBE_OK;
}

bool should_attach_native_monitor_diagnostics_probes()
{
  /*
   * Los probes de diagnostico viven dentro del plano de media: aunque el
   * callback retorne rapido cuando no hay logs, GStreamer debe invocarlo para
   * cada buffer. En pruebas de microtirones queremos que las guardas "off"
   * eliminen tambien esa llamada por frame, no solo el printf.
   */
  return realtime_diagnostic_logs_enabled() || stutter_trace_enabled();
}

void attach_native_monitor_diagnostics_probe(
  GstElement* sink,
  NativeMonitorDiagnostics& diagnostics)
{
  if (!sink || !should_attach_native_monitor_diagnostics_probes()) {
    return;
  }

  GstPad* pad = gst_element_get_static_pad(sink, "sink");
  if (!pad) {
    return;
  }

  gst_pad_add_probe(
    pad,
    GST_PAD_PROBE_TYPE_BUFFER,
    on_native_monitor_buffer_probe,
    &diagnostics,
    nullptr);
  gst_object_unref(pad);
}

void attach_element_pad_diagnostics_probe(
  GstElement* element,
  const char* padName,
  NativeMonitorDiagnostics& diagnostics)
{
  if (!element || !padName || !should_attach_native_monitor_diagnostics_probes()) {
    return;
  }

  GstPad* pad = gst_element_get_static_pad(element, padName);
  if (!pad) {
    return;
  }

  gst_pad_add_probe(
    pad,
    GST_PAD_PROBE_TYPE_BUFFER,
    on_native_monitor_buffer_probe,
    &diagnostics,
    nullptr);
  gst_object_unref(pad);
}
