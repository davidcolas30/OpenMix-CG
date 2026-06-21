#pragma once

#include <array>
#include <gst/gst.h>
#include <string>

constexpr int kMixerPipelinePadMaxSources = 4;

struct MixerPipelinePadConfig {
  int sourceCount = 0;
  int monitorWidth = 0;
  int monitorHeight = 0;
  int multiviewColumns = 0;
  int multiviewGutter = 0;
  int multiviewSlotWidth = 0;
  int multiviewSlotHeight = 0;
};

struct MixerPipelinePadElements {
  GstElement* pgmCompositor = nullptr;
  GstElement* pgmRecordingCompositor = nullptr;
  GstElement* pvwCompositor = nullptr;
  GstElement* multiviewCompositor = nullptr;
  GstElement* pgmMonitorSelector = nullptr;
  GstElement* pvwMonitorSelector = nullptr;
  GstElement* pgmAbTransitionSelector = nullptr;
  GstElement* combinedMonitorCompositor = nullptr;
};

struct MixerPipelinePads {
  std::array<GstPad*, kMixerPipelinePadMaxSources> pgmPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> pgmRecordingPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> pvwPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> multiviewPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> pgmMonitorSelectorPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> pvwMonitorSelectorPads = {};
  std::array<GstPad*, kMixerPipelinePadMaxSources> pgmAbTransitionSelectorPads = {};

  GstPad* combinedMonitorPvwPad = nullptr;
  GstPad* combinedMonitorPgmPad = nullptr;
  GstPad* graphicsPgmPad = nullptr;
  GstPad* graphicsPvwPad = nullptr;
  GstPad* pgmAbPrimaryPad = nullptr;
  GstPad* pgmAbSecondaryPad = nullptr;
  GstPad* pvwAbPrimaryPad = nullptr;
};

bool resolve_mixer_pipeline_pads(
  const MixerPipelinePadConfig& config,
  const MixerPipelinePadElements& elements,
  MixerPipelinePads& pads,
  std::string& errorMessage);
void detach_graphics_overlay_compositor_pad(
  GstElement* compositor,
  GstPad** storedPad,
  const char* label);
void detach_legacy_monitor_compositor_pads_for_ab_mode(
  bool abCompositorMonitorRenderer,
  int sourceCount,
  GstElement* pgmCompositor,
  GstPad** pgmPads,
  GstElement* pvwCompositor,
  GstPad** pvwPads);
