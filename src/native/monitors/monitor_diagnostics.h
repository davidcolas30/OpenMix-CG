#pragma once

#include <gst/gst.h>
#include <chrono>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

struct NativeMonitorDiagnostics {
  const char* name;
  uint64_t frames;
  int minIntervalMs;
  int maxIntervalMs;
  int slowFrames;
  std::chrono::steady_clock::time_point lastFrameTime;
  std::chrono::steady_clock::time_point lastReportTime;
};

struct RtpTimelineDiagnostics {
  std::string name;
  guint32 clockRate;
  bool initialized;
  guint32 lastRtpTimestamp;
  guint16 lastSeq;
  uint64_t timestampChanges;
  uint64_t slowGaps;
  uint64_t deliveryGaps;
  int maxWallDeltaMs;
  double rtpDeltaAtMaxWallMs;
  guint16 seqDeltaAtMaxWall;
  std::chrono::steady_clock::time_point startTime;
  std::chrono::steady_clock::time_point lastTimestampChangeTime;
  struct GapSample {
    int sinceStartMs;
    int wallDeltaMs;
    double rtpDeltaMs;
    guint16 seqDelta;
    bool marker;
  };
  std::vector<GapSample> largestGaps;
};

struct RtpJitterBufferTimelineProbes {
  std::string elementName;
  std::string mediaLabel;
  std::unique_ptr<RtpTimelineDiagnostics> sinkTimeline;
  std::unique_ptr<RtpTimelineDiagnostics> srcTimeline;
};

struct MonitorDiagnosticsRuntimeContext {
  bool* realtimeDiagnosticLogsEnabled = nullptr;
  bool* stutterTraceEnabled = nullptr;
  bool* rtpTimelineTraceEnabled = nullptr;
  bool* rtpTimelineSummaryEnabled = nullptr;
};

void set_monitor_diagnostics_runtime_context(
  const MonitorDiagnosticsRuntimeContext& context);

void reset_native_monitor_diagnostics(NativeMonitorDiagnostics& diagnostics);

void reset_rtp_timeline_diagnostics(RtpTimelineDiagnostics& diagnostics);

bool should_attach_native_monitor_diagnostics_probes();

bool should_attach_rtp_timeline_probes();

void log_rtp_timeline_summary(const RtpTimelineDiagnostics& diagnostics);

GstPadProbeReturn on_native_monitor_buffer_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

GstPadProbeReturn on_webrtc_rtp_timeline_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

void attach_native_monitor_diagnostics_probe(
  GstElement* sink,
  NativeMonitorDiagnostics& diagnostics);

void attach_element_pad_diagnostics_probe(
  GstElement* element,
  const char* padName,
  NativeMonitorDiagnostics& diagnostics);
