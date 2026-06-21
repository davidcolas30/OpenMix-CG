#pragma once

#include <napi.h>
#include <gst/app/gstappsink.h>
#include <gst/gst.h>

#include <atomic>
#include <chrono>

enum MonitorFrameTarget {
  MONITOR_FRAME_TARGET_PGM,
  MONITOR_FRAME_TARGET_PVW
};

enum MonitorIpcMode {
  MONITOR_IPC_BOTH,
  MONITOR_IPC_PGM_ONLY,
  MONITOR_IPC_PVW_ONLY,
  MONITOR_IPC_NONE
};

struct StreamDiagnostics {
  const char* name;
  int producedFrames;
  int queuedFramesToJs;
  int queueFullDrops;
  std::chrono::steady_clock::time_point lastReportTime;
};

struct MonitorFrameBridgeContext {
  GstElement** pipeline = nullptr;

  Napi::ThreadSafeFunction* pgmFrameCallback = nullptr;
  Napi::ThreadSafeFunction* pvwFrameCallback = nullptr;
  Napi::ThreadSafeFunction* thumbFrameCallback = nullptr;
  Napi::ThreadSafeFunction* busCallback = nullptr;
  Napi::ThreadSafeFunction* pgmRecordingFrameCallback = nullptr;
  Napi::ThreadSafeFunction* audioReferenceFrameCallback = nullptr;

  std::atomic<bool>* mediaPlaneActive = nullptr;
  std::atomic<int>* activeWebrtcPeerCount = nullptr;
  std::atomic<int>* syncBufferDecodedPeerCount = nullptr;

  bool* realtimeDiagnosticLogsEnabled = nullptr;
  bool* programRecordingEnabled = nullptr;
  bool* thumbnailsEnabled = nullptr;
  bool* syncBufferEnabled = nullptr;

  MonitorIpcMode* monitorIpcMode = nullptr;
  int* monitorActiveFps = nullptr;
  int* monitorActiveIntervalMs = nullptr;
  int* monitorIdleIntervalMs = nullptr;
  int* syncBufferMinPeers = nullptr;

  std::chrono::steady_clock::time_point* lastPgmMonitorFrameTime = nullptr;
  std::chrono::steady_clock::time_point* lastPvwMonitorFrameTime = nullptr;
  std::chrono::steady_clock::time_point* lastThumbTime = nullptr;
  int sourceCount = 0;

  StreamDiagnostics* pgmDiagnostics = nullptr;
  StreamDiagnostics* pvwDiagnostics = nullptr;

  int maxMonitorFps = 30;
  int thumbIntervalMs = 125;
  int diagnosticLogIntervalMs = 2000;
};

void set_monitor_frame_bridge_context(const MonitorFrameBridgeContext& context);
const char* monitor_ipc_mode_label(MonitorIpcMode mode);
bool should_forward_monitor_frame(MonitorIpcMode mode, MonitorFrameTarget target);
void reset_stream_diagnostics(StreamDiagnostics& diagnostics);

GstFlowReturn on_monitor_frame_bridge_pgm_sample(GstAppSink* appsink, gpointer userData);
GstFlowReturn on_monitor_frame_bridge_pvw_sample(GstAppSink* appsink, gpointer userData);
GstFlowReturn on_monitor_frame_bridge_audio_reference_sample(
  GstAppSink* appsink,
  gpointer userData);
GstFlowReturn on_monitor_frame_bridge_pgm_recording_sample(
  GstAppSink* appsink,
  gpointer userData);
GstFlowReturn on_monitor_frame_bridge_thumb_sample(GstAppSink* appsink, gpointer userData);
GstBusSyncReply on_monitor_frame_bridge_bus_sync_message(
  GstBus* bus,
  GstMessage* msg,
  gpointer userData);
