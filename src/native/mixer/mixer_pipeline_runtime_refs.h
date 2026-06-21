#pragma once

#include <chrono>
#include <gst/gst.h>

#include "mixer_pipeline_callbacks.h"
#include "mixer_pipeline_cleanup.h"
#include "mixer_pipeline_diagnostics.h"
#include "mixer_pipeline_handles.h"
#include "mixer_pipeline_pads.h"

struct MixerPipelineRuntimeRefsContext {
  int sourceCount = 0;
  int firstWebrtcSourceIndex = 0;

  GstElement** pipeline = nullptr;
  MultiviewOverlayState* multiviewOverlayState = nullptr;

  GstElement** pgmCompositor = nullptr;
  GstElement** pgmRecordingCompositor = nullptr;
  GstElement** pvwCompositor = nullptr;
  GstElement** multiviewCompositor = nullptr;
  GstElement** combinedMonitorCompositor = nullptr;

  GstElement** pgmAppsink = nullptr;
  GstElement** pvwAppsink = nullptr;
  GstElement** pgmRecordingAppsink = nullptr;
  GstElement** pgmRecordingValve = nullptr;
  GstElement** pgmRecordingTee = nullptr;
  GstElement** pgmSelectorAppsink = nullptr;
  GstElement** pvwSelectorAppsink = nullptr;
  GstElement** audioReferenceAppsink = nullptr;

  GstElement** graphicsPgmAppsrc = nullptr;
  GstElement** graphicsPvwAppsrc = nullptr;
  GstElement** pgmMonitorSelector = nullptr;
  GstElement** pvwMonitorSelector = nullptr;
  GstElement** pgmSelectorNativeMonitorValve = nullptr;
  GstElement** pgmSelectorNativeMonitorSink = nullptr;
  GstElement** pvwSelectorNativeMonitorValve = nullptr;
  GstElement** pvwSelectorNativeMonitorSink = nullptr;
  GstElement** pgmAbTransitionSelector = nullptr;
  GstElement** pgmAbPrimaryCompositorValve = nullptr;
  GstElement** pgmAbSecondaryCompositorValve = nullptr;
  GstElement** pvwAbPrimaryCompositorValve = nullptr;

  GstElement** pgmMonitorWebrtc = nullptr;
  GstElement** pgmMonitorWebrtcValve = nullptr;
  GstElement** pgmMonitorH264Pay = nullptr;
  GstElement** pvwMonitorWebrtc = nullptr;
  GstElement** pvwMonitorWebrtcValve = nullptr;
  GstElement** pvwMonitorH264Pay = nullptr;
  GstElement** pgmNativeMonitorValve = nullptr;
  GstElement** pgmNativeMonitorSink = nullptr;
  GstElement** pvwNativeMonitorValve = nullptr;
  GstElement** pvwNativeMonitorSink = nullptr;
  GstElement** multiviewOverlay = nullptr;
  GstElement** multiviewNativeMonitorValve = nullptr;
  GstElement** multiviewNativeMonitorSink = nullptr;
  GstElement** audioReferenceNativeMonitorValve = nullptr;
  GstElement** audioReferenceNativeMonitorSink = nullptr;
  GstElement** audioReferenceFrameValve = nullptr;
  GstElement** combinedMonitorWebrtc = nullptr;
  GstElement** combinedMonitorWebrtcValve = nullptr;
  GstElement** combinedMonitorPvwInputValve = nullptr;
  GstElement** combinedMonitorPgmInputValve = nullptr;
  GstElement** combinedMonitorH264Pay = nullptr;
  GstElement** multiviewMonitorWebrtc = nullptr;
  GstElement** multiviewMonitorWebrtcValve = nullptr;
  GstElement** multiviewMonitorH264Pay = nullptr;

  GstElement** pgmMonitorSourceValves = nullptr;
  GstElement** pvwMonitorSourceValves = nullptr;
  GstElement** pgmRecordingSourceValves = nullptr;
  GstElement** multiviewSourceValves = nullptr;
  GstElement** thumbSourceValves = nullptr;
  GstElement** pgmSelectorSourceValves = nullptr;
  GstElement** pvwSelectorSourceValves = nullptr;
  GstElement** pgmAbTransitionSourceValves = nullptr;
  GstElement** thumbAppsinks = nullptr;
  GstElement** webrtcSelectors = nullptr;
  GstElement** webrtcRecordingSelectors = nullptr;

  GstPad** webrtcSelectorFallbackPads = nullptr;
  GstPad** webrtcRecordingSelectorFallbackPads = nullptr;
  GstPad** pgmPads = nullptr;
  GstPad** pgmRecordingPads = nullptr;
  GstPad** pvwPads = nullptr;
  GstPad** multiviewPads = nullptr;
  GstPad** pgmMonitorSelectorPads = nullptr;
  GstPad** pvwMonitorSelectorPads = nullptr;
  GstPad** pgmAbTransitionSelectorPads = nullptr;
  GstPad** combinedMonitorPvwPad = nullptr;
  GstPad** combinedMonitorPgmPad = nullptr;
  GstPad** graphicsPgmPad = nullptr;
  GstPad** graphicsPvwPad = nullptr;
  GstPad** pgmAbPrimaryPad = nullptr;
  GstPad** pgmAbSecondaryPad = nullptr;
  GstPad** pvwAbPrimaryPad = nullptr;

  StreamDiagnostics* pgmDiagnostics = nullptr;
  StreamDiagnostics* pvwDiagnostics = nullptr;
  NativeMonitorDiagnostics* pgmNativeMonitorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pvwNativeMonitorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pgmCompositorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pvwCompositorDiagnostics = nullptr;
  NativeMonitorDiagnostics* pgmMonitorSourceDiagnostics = nullptr;
  NativeMonitorDiagnostics* pvwMonitorSourceDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcRtpDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcEncodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcDecodedDiagnostics = nullptr;
  NativeMonitorDiagnostics* webrtcMonitorOutDiagnostics = nullptr;
  RtpTimelineDiagnostics* webrtcRtpTimelineDiagnostics = nullptr;
  std::chrono::steady_clock::time_point* lastPgmMonitorFrameTime = nullptr;
  std::chrono::steady_clock::time_point* lastPvwMonitorFrameTime = nullptr;
};

void set_mixer_pipeline_runtime_refs_context(
  const MixerPipelineRuntimeRefsContext& context);

void adopt_mixer_pipeline_handles_refs(const MixerPipelineHandles& handles);
void adopt_mixer_pipeline_pads_refs(const MixerPipelinePads& pads);

MixerPipelineCallbackElements create_mixer_pipeline_callback_elements_refs();
MixerPipelineDiagnosticsState create_mixer_pipeline_diagnostics_state_refs();
MixerPipelineDiagnosticsElements create_mixer_pipeline_diagnostics_elements_refs();
MixerPipelineCleanupRefs create_mixer_pipeline_cleanup_refs_refs();
