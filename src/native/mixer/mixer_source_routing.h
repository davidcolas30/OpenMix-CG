#pragma once

#include "mixer_runtime_config.h"

#include <gst/gst.h>

#include <functional>
#include <vector>

struct MixerSourceRoutingContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 1;
  int programSource = 0;
  int previewSource = 1;
  int monitorWidth = 0;
  int monitorHeight = 0;
  int internalWidth = 0;
  int internalHeight = 0;
  bool localVideoPrewarmEnabled = false;
  bool selectorMonitorInputs = false;
  bool abCompositorMonitorRenderer = false;
  MonitorInputMode monitorInputMode = MONITOR_INPUTS_BOTH;
  std::vector<bool> localVideoSourcePresent;
  bool* recordingKeepWarmSources = nullptr;

  GstElement** pgmSelectorSourceValves = nullptr;
  GstElement** pvwSelectorSourceValves = nullptr;
  GstElement** pgmMonitorSourceValves = nullptr;
  GstElement** pvwMonitorSourceValves = nullptr;
  GstElement** pgmRecordingSourceValves = nullptr;
  GstElement** pgmAbTransitionSourceValves = nullptr;

  GstElement* pgmMonitorSelector = nullptr;
  GstElement* pvwMonitorSelector = nullptr;
  GstElement* pgmAbTransitionSelector = nullptr;
  GstElement* pgmAbPrimaryCompositorValve = nullptr;
  GstElement* pgmAbSecondaryCompositorValve = nullptr;
  GstElement* pvwAbPrimaryCompositorValve = nullptr;

  GstPad** pgmMonitorSelectorPads = nullptr;
  GstPad** pvwMonitorSelectorPads = nullptr;
  GstPad** pgmAbTransitionSelectorPads = nullptr;
  GstPad** pgmRecordingPads = nullptr;

  std::function<void(bool, int, int)> recordingBranchRouter;
};

bool mixer_route_has_local_video_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex);

bool mixer_route_source_matches_recording_keepwarm_selection(
  const MixerSourceRoutingContext& context,
  int sourceIndex,
  int firstSource,
  int secondSource);

void set_mixer_program_selector_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex);

void set_mixer_preview_selector_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex);

void set_mixer_program_ab_transition_selector_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex);

void close_mixer_program_ab_transition_selector(
  const MixerSourceRoutingContext& context);

void set_mixer_program_monitor_valves_for_sources(
  const MixerSourceRoutingContext& context,
  int firstSource,
  int secondSource = -1);

void set_mixer_preview_monitor_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex);

void set_mixer_recording_source_valves_for_sources(
  const MixerSourceRoutingContext& context,
  bool enabled,
  int firstSource,
  int secondSource = -1);

void apply_mixer_recording_steady_program_layout(
  const MixerSourceRoutingContext& context);
