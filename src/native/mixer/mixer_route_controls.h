#pragma once

#include <gst/gst.h>

#include <functional>

#include "mixer_runtime_config.h"
#include "mixer_transition.h"

struct LocalVideoSource;

using MixerRoutePredicate = std::function<bool()>;
using MixerRecordingBranchRouter =
  std::function<void(bool enabled, int firstSource, int secondSource)>;

struct MixerRouteControlsContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 1;
  int internalWidth = 1920;
  int internalHeight = 1080;

  int* programSource = nullptr;
  int* previewSource = nullptr;
  int* monitorWidth = nullptr;
  int* monitorHeight = nullptr;
  bool* localVideoPrewarmEnabled = nullptr;
  bool* programRecordingEnabled = nullptr;
  bool* recordingKeepWarmSources = nullptr;
  bool* combinedMonitorEnabled = nullptr;
  bool* multiviewEnabled = nullptr;
  MonitorInputMode* monitorInputMode = nullptr;
  LocalVideoSource** localVideoSources = nullptr;

  GstElement** webrtcSelectors = nullptr;
  GstElement** webrtcRecordingSelectors = nullptr;
  GstPad** webrtcSelectorFallbackPads = nullptr;
  GstPad** webrtcRecordingSelectorFallbackPads = nullptr;

  GstElement** pgmSelectorSourceValves = nullptr;
  GstElement** pvwSelectorSourceValves = nullptr;
  GstElement** pgmMonitorSourceValves = nullptr;
  GstElement** pvwMonitorSourceValves = nullptr;
  GstElement** pgmRecordingSourceValves = nullptr;
  GstElement** pgmAbTransitionSourceValves = nullptr;

  GstElement** pgmMonitorSelector = nullptr;
  GstElement** pvwMonitorSelector = nullptr;
  GstElement** pgmAbTransitionSelector = nullptr;
  GstElement** pgmAbPrimaryCompositorValve = nullptr;
  GstElement** pgmAbSecondaryCompositorValve = nullptr;
  GstElement** pvwAbPrimaryCompositorValve = nullptr;

  GstElement** pgmCompositor = nullptr;
  GstElement** pvwCompositor = nullptr;
  GstElement** combinedMonitorCompositor = nullptr;
  GstElement** multiviewCompositor = nullptr;

  GstPad** pgmMonitorSelectorPads = nullptr;
  GstPad** pvwMonitorSelectorPads = nullptr;
  GstPad** pgmAbTransitionSelectorPads = nullptr;
  GstPad** pgmPads = nullptr;
  GstPad** pgmRecordingPads = nullptr;
  GstPad** pvwPads = nullptr;
  GstPad** pgmAbPrimaryPad = nullptr;
  GstPad** pgmAbSecondaryPad = nullptr;
  GstPad** pvwAbPrimaryPad = nullptr;

  MixerRoutePredicate usesSelectorMonitorInputs;
  MixerRoutePredicate isAbCompositorMonitorRenderer;
  MixerRecordingBranchRouter recordingBranchRouter;
};

void set_mixer_route_controls_context(const MixerRouteControlsContext& context);

void mixer_route_control_set_webrtc_slot_to_fallback(int sourceIndex);
bool mixer_route_control_is_local_video_source(int sourceIndex);
bool mixer_route_control_source_matches_recording_keepwarm_selection(
  int sourceIndex,
  int firstSource,
  int secondSource);

void mixer_route_control_set_program_selector_valves_for_source(int sourceIndex);
void mixer_route_control_set_preview_selector_valves_for_source(int sourceIndex);
void mixer_route_control_set_program_ab_transition_selector_for_source(int sourceIndex);
void mixer_route_control_close_program_ab_transition_selector();
void mixer_route_control_set_program_monitor_valves_for_sources(
  int firstSource,
  int secondSource = -1);
void mixer_route_control_set_preview_monitor_valves_for_source(int sourceIndex);
void mixer_route_control_set_recording_source_valves_for_sources(
  bool enabled,
  int firstSource,
  int secondSource = -1);
void mixer_route_control_apply_recording_steady_program_layout_locked();

void mixer_route_control_apply_program_transition_frame(
  MixerTransitionType transitionType,
  int outgoingSource,
  int incomingSource,
  double progress);
void mixer_route_control_update_compositor_alphas();
void mixer_route_control_set_monitor_compositors_sleeping(bool shouldSleepPrimaryMonitors);
