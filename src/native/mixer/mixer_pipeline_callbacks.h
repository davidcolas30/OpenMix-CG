#pragma once

#include "mixer_runtime_config.h"
#include "multiview_overlay.h"

#include <array>
#include <gst/gst.h>

constexpr int kMixerPipelineCallbackMaxSources = 4;

struct MixerPipelineCallbackConfig {
  int sourceCount = 0;
  bool monitorCallbacksEnabled = false;
  MonitorRendererMode monitorRendererMode = MONITOR_RENDERER_COMPOSITOR;
};

struct MixerPipelineCallbackElements {
  GstElement* pipeline = nullptr;
  GstElement* pgmAppsink = nullptr;
  GstElement* pvwAppsink = nullptr;
  GstElement* pgmRecordingAppsink = nullptr;
  GstElement* pgmSelectorAppsink = nullptr;
  GstElement* pvwSelectorAppsink = nullptr;
  GstElement* audioReferenceAppsink = nullptr;
  GstElement* multiviewOverlay = nullptr;
  MultiviewOverlayState* multiviewOverlayState = nullptr;
  std::array<GstElement*, kMixerPipelineCallbackMaxSources> thumbAppsinks = {};
};

void configure_mixer_pipeline_callbacks(
  const MixerPipelineCallbackConfig& config,
  const MixerPipelineCallbackElements& elements);
