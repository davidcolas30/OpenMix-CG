#include "mixer_pipeline_runtime_refs.h"

namespace {

MixerPipelineRuntimeRefsContext g_context;

bool valid_source_index(int index)
{
  return index >= 0 && index < g_context.sourceCount;
}

bool valid_webrtc_source_index(int index)
{
  return index >= g_context.firstWebrtcSourceIndex && valid_source_index(index);
}

} // namespace

void set_mixer_pipeline_runtime_refs_context(
  const MixerPipelineRuntimeRefsContext& context)
{
  g_context = context;
}

void adopt_mixer_pipeline_handles_refs(const MixerPipelineHandles& handles)
{
  if (g_context.pgmCompositor) *g_context.pgmCompositor = handles.pgmCompositor;
  if (g_context.pgmRecordingCompositor) *g_context.pgmRecordingCompositor = handles.pgmRecordingCompositor;
  if (g_context.pvwCompositor) *g_context.pvwCompositor = handles.pvwCompositor;
  if (g_context.multiviewCompositor) *g_context.multiviewCompositor = handles.multiviewCompositor;
  if (g_context.pgmAppsink) *g_context.pgmAppsink = handles.pgmAppsink;
  if (g_context.pvwAppsink) *g_context.pvwAppsink = handles.pvwAppsink;
  if (g_context.pgmRecordingAppsink) *g_context.pgmRecordingAppsink = handles.pgmRecordingAppsink;
  if (g_context.pgmRecordingValve) *g_context.pgmRecordingValve = handles.pgmRecordingValve;
  if (g_context.pgmRecordingTee) *g_context.pgmRecordingTee = handles.pgmRecordingTee;

  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmMonitorSourceValves) g_context.pgmMonitorSourceValves[i] = handles.pgmMonitorSourceValves[i];
    if (g_context.pvwMonitorSourceValves) g_context.pvwMonitorSourceValves[i] = handles.pvwMonitorSourceValves[i];
    if (g_context.pgmRecordingSourceValves) g_context.pgmRecordingSourceValves[i] = handles.pgmRecordingSourceValves[i];
    if (g_context.multiviewSourceValves) g_context.multiviewSourceValves[i] = handles.multiviewSourceValves[i];
    if (g_context.thumbSourceValves) g_context.thumbSourceValves[i] = handles.thumbSourceValves[i];
    if (g_context.pgmSelectorSourceValves) g_context.pgmSelectorSourceValves[i] = handles.pgmSelectorSourceValves[i];
    if (g_context.pvwSelectorSourceValves) g_context.pvwSelectorSourceValves[i] = handles.pvwSelectorSourceValves[i];
    if (g_context.pgmAbTransitionSourceValves) {
      g_context.pgmAbTransitionSourceValves[i] = handles.pgmAbTransitionSourceValves[i];
    }
    if (g_context.thumbAppsinks) g_context.thumbAppsinks[i] = handles.thumbAppsinks[i];
    if (g_context.webrtcSelectors) g_context.webrtcSelectors[i] = handles.webrtcSelectors[i];
    if (g_context.webrtcRecordingSelectors) {
      g_context.webrtcRecordingSelectors[i] = handles.webrtcRecordingSelectors[i];
    }
    if (g_context.webrtcSelectorFallbackPads) {
      g_context.webrtcSelectorFallbackPads[i] = handles.webrtcSelectorFallbackPads[i];
    }
    if (g_context.webrtcRecordingSelectorFallbackPads) {
      g_context.webrtcRecordingSelectorFallbackPads[i] = handles.webrtcRecordingSelectorFallbackPads[i];
    }
  }

  if (g_context.graphicsPgmAppsrc) *g_context.graphicsPgmAppsrc = handles.graphicsPgmAppsrc;
  if (g_context.graphicsPvwAppsrc) *g_context.graphicsPvwAppsrc = handles.graphicsPvwAppsrc;
  if (g_context.pgmMonitorSelector) *g_context.pgmMonitorSelector = handles.pgmMonitorSelector;
  if (g_context.pvwMonitorSelector) *g_context.pvwMonitorSelector = handles.pvwMonitorSelector;
  if (g_context.pgmSelectorAppsink) *g_context.pgmSelectorAppsink = handles.pgmSelectorAppsink;
  if (g_context.pvwSelectorAppsink) *g_context.pvwSelectorAppsink = handles.pvwSelectorAppsink;
  if (g_context.pgmSelectorNativeMonitorValve) {
    *g_context.pgmSelectorNativeMonitorValve = handles.pgmSelectorNativeMonitorValve;
  }
  if (g_context.pgmSelectorNativeMonitorSink) {
    *g_context.pgmSelectorNativeMonitorSink = handles.pgmSelectorNativeMonitorSink;
  }
  if (g_context.pvwSelectorNativeMonitorValve) {
    *g_context.pvwSelectorNativeMonitorValve = handles.pvwSelectorNativeMonitorValve;
  }
  if (g_context.pvwSelectorNativeMonitorSink) {
    *g_context.pvwSelectorNativeMonitorSink = handles.pvwSelectorNativeMonitorSink;
  }
  if (g_context.pgmAbTransitionSelector) {
    *g_context.pgmAbTransitionSelector = handles.pgmAbTransitionSelector;
  }
  if (g_context.pgmAbPrimaryCompositorValve) {
    *g_context.pgmAbPrimaryCompositorValve = handles.pgmAbPrimaryCompositorValve;
  }
  if (g_context.pgmAbSecondaryCompositorValve) {
    *g_context.pgmAbSecondaryCompositorValve = handles.pgmAbSecondaryCompositorValve;
  }
  if (g_context.pvwAbPrimaryCompositorValve) {
    *g_context.pvwAbPrimaryCompositorValve = handles.pvwAbPrimaryCompositorValve;
  }
  if (g_context.pgmMonitorWebrtc) *g_context.pgmMonitorWebrtc = handles.pgmMonitorWebrtc;
  if (g_context.pgmMonitorWebrtcValve) *g_context.pgmMonitorWebrtcValve = handles.pgmMonitorWebrtcValve;
  if (g_context.pgmMonitorH264Pay) *g_context.pgmMonitorH264Pay = handles.pgmMonitorH264Pay;
  if (g_context.pvwMonitorWebrtc) *g_context.pvwMonitorWebrtc = handles.pvwMonitorWebrtc;
  if (g_context.pvwMonitorWebrtcValve) *g_context.pvwMonitorWebrtcValve = handles.pvwMonitorWebrtcValve;
  if (g_context.pvwMonitorH264Pay) *g_context.pvwMonitorH264Pay = handles.pvwMonitorH264Pay;
  if (g_context.pgmNativeMonitorValve) *g_context.pgmNativeMonitorValve = handles.pgmNativeMonitorValve;
  if (g_context.pgmNativeMonitorSink) *g_context.pgmNativeMonitorSink = handles.pgmNativeMonitorSink;
  if (g_context.pvwNativeMonitorValve) *g_context.pvwNativeMonitorValve = handles.pvwNativeMonitorValve;
  if (g_context.pvwNativeMonitorSink) *g_context.pvwNativeMonitorSink = handles.pvwNativeMonitorSink;
  if (g_context.multiviewOverlay) *g_context.multiviewOverlay = handles.multiviewOverlay;
  if (g_context.multiviewNativeMonitorValve) {
    *g_context.multiviewNativeMonitorValve = handles.multiviewNativeMonitorValve;
  }
  if (g_context.multiviewNativeMonitorSink) {
    *g_context.multiviewNativeMonitorSink = handles.multiviewNativeMonitorSink;
  }
  if (g_context.audioReferenceNativeMonitorValve) {
    *g_context.audioReferenceNativeMonitorValve = handles.audioReferenceNativeMonitorValve;
  }
  if (g_context.audioReferenceNativeMonitorSink) {
    *g_context.audioReferenceNativeMonitorSink = handles.audioReferenceNativeMonitorSink;
  }
  if (g_context.audioReferenceFrameValve) {
    *g_context.audioReferenceFrameValve = handles.audioReferenceFrameValve;
  }
  if (g_context.audioReferenceAppsink) {
    *g_context.audioReferenceAppsink = handles.audioReferenceAppsink;
  }
  if (g_context.combinedMonitorCompositor) {
    *g_context.combinedMonitorCompositor = handles.combinedMonitorCompositor;
  }
  if (g_context.combinedMonitorWebrtc) {
    *g_context.combinedMonitorWebrtc = handles.combinedMonitorWebrtc;
  }
  if (g_context.combinedMonitorWebrtcValve) {
    *g_context.combinedMonitorWebrtcValve = handles.combinedMonitorWebrtcValve;
  }
  if (g_context.combinedMonitorPvwInputValve) {
    *g_context.combinedMonitorPvwInputValve = handles.combinedMonitorPvwInputValve;
  }
  if (g_context.combinedMonitorPgmInputValve) {
    *g_context.combinedMonitorPgmInputValve = handles.combinedMonitorPgmInputValve;
  }
  if (g_context.combinedMonitorH264Pay) {
    *g_context.combinedMonitorH264Pay = handles.combinedMonitorH264Pay;
  }
  if (g_context.multiviewMonitorWebrtc) {
    *g_context.multiviewMonitorWebrtc = handles.multiviewMonitorWebrtc;
  }
  if (g_context.multiviewMonitorWebrtcValve) {
    *g_context.multiviewMonitorWebrtcValve = handles.multiviewMonitorWebrtcValve;
  }
  if (g_context.multiviewMonitorH264Pay) {
    *g_context.multiviewMonitorH264Pay = handles.multiviewMonitorH264Pay;
  }
}

void adopt_mixer_pipeline_pads_refs(const MixerPipelinePads& pads)
{
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmPads) g_context.pgmPads[i] = pads.pgmPads[i];
    if (g_context.pgmRecordingPads) g_context.pgmRecordingPads[i] = pads.pgmRecordingPads[i];
    if (g_context.pvwPads) g_context.pvwPads[i] = pads.pvwPads[i];
    if (g_context.multiviewPads) g_context.multiviewPads[i] = pads.multiviewPads[i];
    if (g_context.pgmMonitorSelectorPads) {
      g_context.pgmMonitorSelectorPads[i] = pads.pgmMonitorSelectorPads[i];
    }
    if (g_context.pvwMonitorSelectorPads) {
      g_context.pvwMonitorSelectorPads[i] = pads.pvwMonitorSelectorPads[i];
    }
    if (g_context.pgmAbTransitionSelectorPads) {
      g_context.pgmAbTransitionSelectorPads[i] = pads.pgmAbTransitionSelectorPads[i];
    }
  }

  if (g_context.combinedMonitorPvwPad) {
    *g_context.combinedMonitorPvwPad = pads.combinedMonitorPvwPad;
  }
  if (g_context.combinedMonitorPgmPad) {
    *g_context.combinedMonitorPgmPad = pads.combinedMonitorPgmPad;
  }
  if (g_context.graphicsPgmPad) *g_context.graphicsPgmPad = pads.graphicsPgmPad;
  if (g_context.graphicsPvwPad) *g_context.graphicsPvwPad = pads.graphicsPvwPad;
  if (g_context.pgmAbPrimaryPad) *g_context.pgmAbPrimaryPad = pads.pgmAbPrimaryPad;
  if (g_context.pgmAbSecondaryPad) *g_context.pgmAbSecondaryPad = pads.pgmAbSecondaryPad;
  if (g_context.pvwAbPrimaryPad) *g_context.pvwAbPrimaryPad = pads.pvwAbPrimaryPad;
}

MixerPipelineCallbackElements create_mixer_pipeline_callback_elements_refs()
{
  MixerPipelineCallbackElements elements;
  elements.pipeline = g_context.pipeline ? *g_context.pipeline : nullptr;
  elements.pgmAppsink = g_context.pgmAppsink ? *g_context.pgmAppsink : nullptr;
  elements.pvwAppsink = g_context.pvwAppsink ? *g_context.pvwAppsink : nullptr;
  elements.pgmRecordingAppsink =
    g_context.pgmRecordingAppsink ? *g_context.pgmRecordingAppsink : nullptr;
  elements.pgmSelectorAppsink =
    g_context.pgmSelectorAppsink ? *g_context.pgmSelectorAppsink : nullptr;
  elements.pvwSelectorAppsink =
    g_context.pvwSelectorAppsink ? *g_context.pvwSelectorAppsink : nullptr;
  elements.audioReferenceAppsink =
    g_context.audioReferenceAppsink ? *g_context.audioReferenceAppsink : nullptr;
  elements.multiviewOverlay =
    g_context.multiviewOverlay ? *g_context.multiviewOverlay : nullptr;
  elements.multiviewOverlayState = g_context.multiviewOverlayState;
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.thumbAppsinks) {
      elements.thumbAppsinks[i] = g_context.thumbAppsinks[i];
    }
  }
  return elements;
}

MixerPipelineDiagnosticsState create_mixer_pipeline_diagnostics_state_refs()
{
  MixerPipelineDiagnosticsState state;
  state.pgmDiagnostics = g_context.pgmDiagnostics;
  state.pvwDiagnostics = g_context.pvwDiagnostics;
  state.pgmNativeMonitorDiagnostics = g_context.pgmNativeMonitorDiagnostics;
  state.pvwNativeMonitorDiagnostics = g_context.pvwNativeMonitorDiagnostics;
  state.pgmCompositorDiagnostics = g_context.pgmCompositorDiagnostics;
  state.pvwCompositorDiagnostics = g_context.pvwCompositorDiagnostics;
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmMonitorSourceDiagnostics) {
      state.pgmMonitorSourceDiagnostics[i] = &g_context.pgmMonitorSourceDiagnostics[i];
    }
    if (g_context.pvwMonitorSourceDiagnostics) {
      state.pvwMonitorSourceDiagnostics[i] = &g_context.pvwMonitorSourceDiagnostics[i];
    }
    if (g_context.webrtcRtpDiagnostics) {
      state.webrtcRtpDiagnostics[i] = &g_context.webrtcRtpDiagnostics[i];
    }
    if (g_context.webrtcEncodedDiagnostics) {
      state.webrtcEncodedDiagnostics[i] = &g_context.webrtcEncodedDiagnostics[i];
    }
    if (g_context.webrtcDecodedDiagnostics) {
      state.webrtcDecodedDiagnostics[i] = &g_context.webrtcDecodedDiagnostics[i];
    }
    if (g_context.webrtcMonitorOutDiagnostics) {
      state.webrtcMonitorOutDiagnostics[i] = &g_context.webrtcMonitorOutDiagnostics[i];
    }
    if (g_context.webrtcRtpTimelineDiagnostics) {
      state.webrtcRtpTimelineDiagnostics[i] = &g_context.webrtcRtpTimelineDiagnostics[i];
    }
  }
  state.lastPgmMonitorFrameTime = g_context.lastPgmMonitorFrameTime;
  state.lastPvwMonitorFrameTime = g_context.lastPvwMonitorFrameTime;
  return state;
}

MixerPipelineDiagnosticsElements create_mixer_pipeline_diagnostics_elements_refs()
{
  MixerPipelineDiagnosticsElements elements;
  elements.pgmNativeMonitorSink =
    g_context.pgmNativeMonitorSink ? *g_context.pgmNativeMonitorSink : nullptr;
  elements.pvwNativeMonitorSink =
    g_context.pvwNativeMonitorSink ? *g_context.pvwNativeMonitorSink : nullptr;
  elements.pgmCompositor = g_context.pgmCompositor ? *g_context.pgmCompositor : nullptr;
  elements.pvwCompositor = g_context.pvwCompositor ? *g_context.pvwCompositor : nullptr;
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmMonitorSourceValves) {
      elements.pgmMonitorSourceValves[i] = g_context.pgmMonitorSourceValves[i];
    }
    if (g_context.pvwMonitorSourceValves) {
      elements.pvwMonitorSourceValves[i] = g_context.pvwMonitorSourceValves[i];
    }
  }
  return elements;
}

MixerPipelineCleanupRefs create_mixer_pipeline_cleanup_refs_refs()
{
  MixerPipelineCleanupRefs refs;
  refs.pipeline = g_context.pipeline;
  refs.multiviewOverlay = g_context.multiviewOverlay;
  refs.multiviewOverlayState = g_context.multiviewOverlayState;

  refs.padRefs = {
    g_context.graphicsPgmPad,
    g_context.graphicsPvwPad,
    g_context.pgmAbPrimaryPad,
    g_context.pgmAbSecondaryPad,
    g_context.pvwAbPrimaryPad,
    g_context.combinedMonitorPvwPad,
    g_context.combinedMonitorPgmPad
  };
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmPads) refs.padRefs.push_back(&g_context.pgmPads[i]);
    if (g_context.pgmRecordingPads) refs.padRefs.push_back(&g_context.pgmRecordingPads[i]);
    if (g_context.pvwPads) refs.padRefs.push_back(&g_context.pvwPads[i]);
    if (g_context.multiviewPads) refs.padRefs.push_back(&g_context.multiviewPads[i]);
    if (g_context.pgmMonitorSelectorPads) {
      refs.padRefs.push_back(&g_context.pgmMonitorSelectorPads[i]);
    }
    if (g_context.pvwMonitorSelectorPads) {
      refs.padRefs.push_back(&g_context.pvwMonitorSelectorPads[i]);
    }
    if (g_context.pgmAbTransitionSelectorPads) {
      refs.padRefs.push_back(&g_context.pgmAbTransitionSelectorPads[i]);
    }
  }
  for (int i = g_context.firstWebrtcSourceIndex; i < g_context.sourceCount; i++) {
    if (valid_webrtc_source_index(i) && g_context.webrtcSelectorFallbackPads) {
      refs.padRefs.push_back(&g_context.webrtcSelectorFallbackPads[i]);
    }
    if (valid_webrtc_source_index(i) && g_context.webrtcRecordingSelectorFallbackPads) {
      refs.padRefs.push_back(&g_context.webrtcRecordingSelectorFallbackPads[i]);
    }
  }

  refs.elementRefs = {
    g_context.pgmAppsink,
    g_context.pgmRecordingAppsink,
    g_context.pgmRecordingValve,
    g_context.pgmRecordingTee,
    g_context.pvwAppsink,
    g_context.pgmMonitorSelector,
    g_context.pvwMonitorSelector,
    g_context.pgmSelectorAppsink,
    g_context.pvwSelectorAppsink,
    g_context.pgmMonitorWebrtc,
    g_context.pgmMonitorWebrtcValve,
    g_context.pgmMonitorH264Pay,
    g_context.pvwMonitorWebrtc,
    g_context.pvwMonitorWebrtcValve,
    g_context.pvwMonitorH264Pay,
    g_context.pgmNativeMonitorValve,
    g_context.pgmNativeMonitorSink,
    g_context.pvwNativeMonitorValve,
    g_context.pvwNativeMonitorSink,
    g_context.multiviewOverlay,
    g_context.multiviewNativeMonitorValve,
    g_context.multiviewNativeMonitorSink,
    g_context.audioReferenceNativeMonitorValve,
    g_context.audioReferenceNativeMonitorSink,
    g_context.audioReferenceFrameValve,
    g_context.audioReferenceAppsink,
    g_context.pgmSelectorNativeMonitorValve,
    g_context.pgmSelectorNativeMonitorSink,
    g_context.pvwSelectorNativeMonitorValve,
    g_context.pvwSelectorNativeMonitorSink,
    g_context.pgmAbTransitionSelector,
    g_context.pgmAbPrimaryCompositorValve,
    g_context.pgmAbSecondaryCompositorValve,
    g_context.pvwAbPrimaryCompositorValve,
    g_context.combinedMonitorCompositor,
    g_context.combinedMonitorWebrtc,
    g_context.combinedMonitorWebrtcValve,
    g_context.combinedMonitorPvwInputValve,
    g_context.combinedMonitorPgmInputValve,
    g_context.combinedMonitorH264Pay,
    g_context.multiviewMonitorWebrtc,
    g_context.multiviewMonitorWebrtcValve,
    g_context.multiviewMonitorH264Pay,
    g_context.pgmCompositor,
    g_context.pgmRecordingCompositor,
    g_context.pvwCompositor,
    g_context.multiviewCompositor,
    g_context.graphicsPgmAppsrc,
    g_context.graphicsPvwAppsrc
  };
  for (int i = g_context.firstWebrtcSourceIndex; i < g_context.sourceCount; i++) {
    if (valid_webrtc_source_index(i) && g_context.webrtcSelectors) {
      refs.elementRefs.push_back(&g_context.webrtcSelectors[i]);
    }
    if (valid_webrtc_source_index(i) && g_context.webrtcRecordingSelectors) {
      refs.elementRefs.push_back(&g_context.webrtcRecordingSelectors[i]);
    }
  }
  for (int i = 0; i < g_context.sourceCount; i++) {
    if (g_context.pgmMonitorSourceValves) refs.elementRefs.push_back(&g_context.pgmMonitorSourceValves[i]);
    if (g_context.pvwMonitorSourceValves) refs.elementRefs.push_back(&g_context.pvwMonitorSourceValves[i]);
    if (g_context.pgmSelectorSourceValves) refs.elementRefs.push_back(&g_context.pgmSelectorSourceValves[i]);
    if (g_context.pvwSelectorSourceValves) refs.elementRefs.push_back(&g_context.pvwSelectorSourceValves[i]);
    if (g_context.pgmAbTransitionSourceValves) {
      refs.elementRefs.push_back(&g_context.pgmAbTransitionSourceValves[i]);
    }
    if (g_context.pgmRecordingSourceValves) {
      refs.elementRefs.push_back(&g_context.pgmRecordingSourceValves[i]);
    }
    if (g_context.multiviewSourceValves) refs.elementRefs.push_back(&g_context.multiviewSourceValves[i]);
    if (g_context.thumbSourceValves) refs.elementRefs.push_back(&g_context.thumbSourceValves[i]);
    if (g_context.thumbAppsinks) refs.elementRefs.push_back(&g_context.thumbAppsinks[i]);
  }

  return refs;
}
