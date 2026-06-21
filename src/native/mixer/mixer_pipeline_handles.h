#pragma once

#include <array>
#include <gst/gst.h>
#include <string>

constexpr int kMixerPipelineHandleMaxSources = 4;

struct MixerPipelineHandleConfig {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 0;
  int monitorWidth = 0;
  int monitorHeight = 0;
  int internalWidth = 0;
  int internalHeight = 0;
  bool thumbnailsEnabled = false;
  bool requireMultiviewOverlay = false;
};

struct MixerPipelineHandles {
  GstElement* pgmCompositor = nullptr;
  GstElement* pgmRecordingCompositor = nullptr;
  GstElement* pvwCompositor = nullptr;
  GstElement* multiviewCompositor = nullptr;

  GstElement* pgmAppsink = nullptr;
  GstElement* pvwAppsink = nullptr;
  GstElement* pgmRecordingAppsink = nullptr;
  GstElement* pgmRecordingValve = nullptr;
  GstElement* pgmRecordingTee = nullptr;

  std::array<GstElement*, kMixerPipelineHandleMaxSources> pgmMonitorSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> pvwMonitorSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> pgmRecordingSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> multiviewSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> thumbSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> pgmSelectorSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> pvwSelectorSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> pgmAbTransitionSourceValves = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> thumbAppsinks = {};

  GstElement* graphicsPgmAppsrc = nullptr;
  GstElement* graphicsPvwAppsrc = nullptr;

  std::array<GstElement*, kMixerPipelineHandleMaxSources> webrtcSelectors = {};
  std::array<GstElement*, kMixerPipelineHandleMaxSources> webrtcRecordingSelectors = {};
  std::array<GstPad*, kMixerPipelineHandleMaxSources> webrtcSelectorFallbackPads = {};
  std::array<GstPad*, kMixerPipelineHandleMaxSources> webrtcRecordingSelectorFallbackPads = {};

  GstElement* pgmMonitorSelector = nullptr;
  GstElement* pvwMonitorSelector = nullptr;
  GstElement* pgmSelectorAppsink = nullptr;
  GstElement* pvwSelectorAppsink = nullptr;
  GstElement* pgmSelectorNativeMonitorValve = nullptr;
  GstElement* pgmSelectorNativeMonitorSink = nullptr;
  GstElement* pvwSelectorNativeMonitorValve = nullptr;
  GstElement* pvwSelectorNativeMonitorSink = nullptr;

  GstElement* pgmAbTransitionSelector = nullptr;
  GstElement* pgmAbPrimaryCompositorValve = nullptr;
  GstElement* pgmAbSecondaryCompositorValve = nullptr;
  GstElement* pvwAbPrimaryCompositorValve = nullptr;

  GstElement* pgmMonitorWebrtc = nullptr;
  GstElement* pgmMonitorWebrtcValve = nullptr;
  GstElement* pgmMonitorH264Pay = nullptr;
  GstElement* pvwMonitorWebrtc = nullptr;
  GstElement* pvwMonitorWebrtcValve = nullptr;
  GstElement* pvwMonitorH264Pay = nullptr;

  GstElement* pgmNativeMonitorValve = nullptr;
  GstElement* pgmNativeMonitorSink = nullptr;
  GstElement* pvwNativeMonitorValve = nullptr;
  GstElement* pvwNativeMonitorSink = nullptr;
  GstElement* multiviewNativeMonitorValve = nullptr;
  GstElement* multiviewNativeMonitorSink = nullptr;
  GstElement* multiviewOverlay = nullptr;

  GstElement* audioReferenceNativeMonitorValve = nullptr;
  GstElement* audioReferenceNativeMonitorSink = nullptr;
  GstElement* audioReferenceFrameValve = nullptr;
  GstElement* audioReferenceAppsink = nullptr;

  GstElement* combinedMonitorCompositor = nullptr;
  GstElement* combinedMonitorWebrtc = nullptr;
  GstElement* combinedMonitorWebrtcValve = nullptr;
  GstElement* combinedMonitorPvwInputValve = nullptr;
  GstElement* combinedMonitorPgmInputValve = nullptr;
  GstElement* combinedMonitorH264Pay = nullptr;

  GstElement* multiviewMonitorWebrtc = nullptr;
  GstElement* multiviewMonitorWebrtcValve = nullptr;
  GstElement* multiviewMonitorH264Pay = nullptr;
};

bool resolve_mixer_pipeline_handles(
  GstElement* pipeline,
  const MixerPipelineHandleConfig& config,
  MixerPipelineHandles& handles,
  std::string& errorMessage);

void release_mixer_pipeline_handles(MixerPipelineHandles& handles);
