#include "mixer_pipeline_diagnostics.h"

static bool is_valid_source_count(int sourceCount)
{
  return sourceCount >= 0 && sourceCount <= kMixerPipelineDiagnosticsMaxSources;
}

static void reset_native_if_present(NativeMonitorDiagnostics* diagnostics)
{
  if (diagnostics) {
    reset_native_monitor_diagnostics(*diagnostics);
  }
}

static void reset_rtp_timeline_if_present(RtpTimelineDiagnostics* diagnostics)
{
  if (diagnostics) {
    reset_rtp_timeline_diagnostics(*diagnostics);
  }
}

void reset_mixer_pipeline_diagnostics(
  const MixerPipelineDiagnosticsConfig& config,
  MixerPipelineDiagnosticsState& state)
{
  if (!is_valid_source_count(config.sourceCount)) {
    return;
  }

  if (state.pgmDiagnostics) {
    reset_stream_diagnostics(*state.pgmDiagnostics);
  }
  if (state.pvwDiagnostics) {
    reset_stream_diagnostics(*state.pvwDiagnostics);
  }

  reset_native_if_present(state.pgmNativeMonitorDiagnostics);
  reset_native_if_present(state.pvwNativeMonitorDiagnostics);
  reset_native_if_present(state.pgmCompositorDiagnostics);
  reset_native_if_present(state.pvwCompositorDiagnostics);

  for (int i = 0; i < config.sourceCount; i++) {
    reset_native_if_present(state.pgmMonitorSourceDiagnostics[i]);
    reset_native_if_present(state.pvwMonitorSourceDiagnostics[i]);
    reset_native_if_present(state.webrtcRtpDiagnostics[i]);
    reset_native_if_present(state.webrtcEncodedDiagnostics[i]);
    reset_native_if_present(state.webrtcDecodedDiagnostics[i]);
    reset_native_if_present(state.webrtcMonitorOutDiagnostics[i]);
    reset_rtp_timeline_if_present(state.webrtcRtpTimelineDiagnostics[i]);
  }

  if (state.lastPgmMonitorFrameTime) {
    *state.lastPgmMonitorFrameTime = {};
  }
  if (state.lastPvwMonitorFrameTime) {
    *state.lastPvwMonitorFrameTime = {};
  }
}

void attach_mixer_pipeline_diagnostics_probes(
  const MixerPipelineDiagnosticsConfig& config,
  const MixerPipelineDiagnosticsElements& elements,
  MixerPipelineDiagnosticsState& state)
{
  if (!is_valid_source_count(config.sourceCount)) {
    return;
  }

  if (state.pgmNativeMonitorDiagnostics) {
    attach_native_monitor_diagnostics_probe(
      elements.pgmNativeMonitorSink,
      *state.pgmNativeMonitorDiagnostics);
  }
  if (state.pvwNativeMonitorDiagnostics) {
    attach_native_monitor_diagnostics_probe(
      elements.pvwNativeMonitorSink,
      *state.pvwNativeMonitorDiagnostics);
  }
  if (state.pgmCompositorDiagnostics) {
    attach_element_pad_diagnostics_probe(
      elements.pgmCompositor,
      "src",
      *state.pgmCompositorDiagnostics);
  }
  if (state.pvwCompositorDiagnostics) {
    attach_element_pad_diagnostics_probe(
      elements.pvwCompositor,
      "src",
      *state.pvwCompositorDiagnostics);
  }

  for (int i = 0; i < config.sourceCount; i++) {
    if (state.pgmMonitorSourceDiagnostics[i]) {
      attach_element_pad_diagnostics_probe(
        elements.pgmMonitorSourceValves[i],
        "src",
        *state.pgmMonitorSourceDiagnostics[i]);
    }
    if (state.pvwMonitorSourceDiagnostics[i]) {
      attach_element_pad_diagnostics_probe(
        elements.pvwMonitorSourceValves[i],
        "src",
        *state.pvwMonitorSourceDiagnostics[i]);
    }
  }
}
