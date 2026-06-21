#pragma once

#include <gst/gst.h>
#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>

struct LocalVideoSource {
  uint64_t instanceId = 0;
  int sourceIndex = -1;
  std::string uri;
  GstElement* bin = nullptr;
  GstElement* clockSync = nullptr;
  GstPad* retimeSrcPad = nullptr;
  GstPad* pauseGatePad = nullptr;
  GstElement* recordingBranchValve = nullptr;
  GstPad* mixerSelectorPad = nullptr;
  GstPad* mixerRecordingSelectorPad = nullptr;
  bool paused = false;
  bool loopEnabled = false;
  std::atomic<bool> loopSeekPending{false};
  std::mutex pauseGateMutex;
  gulong pauseGateProbeId = 0;
  uint64_t pauseGateTargetRetimedFrame = 0;

  /*
   * Los ficheros empiezan su timeline en 0, pero el mixer puede llevar tiempo
   * en PLAYING. Reanclamos PTS al running-time del pipeline para que un CUT a
   * Program no mantenga el ultimo frame anterior por timestamps atrasados.
   */
  std::mutex timelineMutex;
  bool timelineAnchorValid = false;
  bool hasLastRetimerPts = false;
  GstClockTime lastOriginalPts = GST_CLOCK_TIME_NONE;
  GstClockTime lastNormalizedPts = GST_CLOCK_TIME_NONE;
  GstClockTime nextSyntheticPts = GST_CLOCK_TIME_NONE;
  uint64_t retimedFrames = 0;
  uint64_t correctedPtsJumps = 0;
};

using LocalVideoRunningTimeCallback = GstClockTime (*)();
using LocalVideoRestartCallback = bool (*)(int sourceIndex);

struct LocalVideoSourceRuntimeContext {
  std::mutex* mixerMutex = nullptr;
  LocalVideoSource** sources = nullptr;
  int firstSourceIndex = 1;
  int sourceCount = 4;
  int frameRateNum = 30;
  int frameRateDen = 1;
  LocalVideoRunningTimeCallback getRunningTime = nullptr;
  LocalVideoRestartCallback restartSourceLocked = nullptr;
};

struct LocalVideoSourceBranchConfig {
  uint64_t instanceId = 0;
  int sourceIndex = -1;
  std::string uri;
  int monitorWidth = 960;
  int monitorHeight = 540;
  int internalWidth = 1920;
  int internalHeight = 1080;
  int frameRateNum = 30;
  int frameRateDen = 1;
  guint recordingRawQueueBuffers = 8;
  bool recordingValveOpen = false;
  GstPadProbeCallback retimeBufferProbe = nullptr;
  GstPadProbeCallback branchEventProbe = nullptr;
  GCallback decodebinPadAddedCallback = nullptr;
};

struct LocalVideoSourceBranch {
  LocalVideoSource* source = nullptr;
  GstElement* monitorOutQueue = nullptr;
  GstElement* recordingOutQueue = nullptr;
};

LocalVideoSourceBranch create_local_video_source_branch(
  const LocalVideoSourceBranchConfig& config);

void set_local_video_source_runtime_context(
  const LocalVideoSourceRuntimeContext& context);

void reset_local_video_timeline_anchor(LocalVideoSource* source);

void install_local_video_pause_gate(LocalVideoSource* source, GstPad* pad);

void schedule_local_video_pause_gate(LocalVideoSource* source);

void remove_local_video_pause_gate(LocalVideoSource* source);

void refresh_paused_local_video_after_route_change_locked(int sourceIndex);

GstPadProbeReturn on_local_video_retime_buffer_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

GstPadProbeReturn on_local_video_branch_event_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData);

void on_local_video_decodebin_pad_added(
  GstElement* decodebin,
  GstPad* pad,
  gpointer userData);
