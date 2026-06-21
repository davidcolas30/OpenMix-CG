#include "mixer_pipeline_creation.h"

#include <string>

#include "graphics_overlay_runtime.h"
#include "gst_utils.h"
#include "mixer_pipeline_builder.h"
#include "mixer_pipeline_callbacks.h"
#include "mixer_pipeline_diagnostics.h"
#include "mixer_pipeline_handles.h"
#include "mixer_pipeline_js_callbacks.h"
#include "mixer_pipeline_pads.h"
#include "mixer_pipeline_runtime_refs.h"
#include "recording_overlay.h"
#include "recording_raw_probe.h"

namespace {

MixerPipelineCreationContext g_context;

GstElement* current(GstElement** element)
{
  return element ? *element : nullptr;
}

GstPad* current(GstPad** pad)
{
  return pad ? *pad : nullptr;
}

template <typename T>
T value_or(T* value, T fallback)
{
  return value ? *value : fallback;
}

GraphicsOverlayRuntimeContext make_graphics_runtime_context()
{
  return g_context.makeGraphicsRuntimeContext
    ? g_context.makeGraphicsRuntimeContext()
    : GraphicsOverlayRuntimeContext{};
}

bool has_required_creation_context()
{
  return g_context.mixerMutex &&
    g_context.pipeline &&
    g_context.monitorWidth &&
    g_context.monitorHeight &&
    g_context.webrtcBridgeWidth &&
    g_context.webrtcBridgeHeight &&
    g_context.programSource &&
    g_context.previewSource &&
    g_context.programSourceForOverlay &&
    g_context.previewSourceForOverlay &&
    g_context.programRecordingEnabled &&
    g_context.syncBufferDecodedPeerCount &&
    g_context.lastThumbTime &&
    g_context.makeGraphicsRuntimeContext &&
    g_context.resetMultiviewSourceActivity &&
    g_context.updateCompositorAlphas &&
    g_context.resetSyncBufferNtpAlignmentState &&
    g_context.setRecordingCompositorSleeping &&
    g_context.setMonitorCompositorsSleeping;
}

void unlock_existing_compositors_for_shutdown()
{
  unlock_compositor_for_shutdown(current(g_context.pgmCompositor));
  unlock_compositor_for_shutdown(current(g_context.pvwCompositor));
  unlock_compositor_for_shutdown(current(g_context.multiviewCompositor));
  unlock_compositor_for_shutdown(current(g_context.combinedMonitorCompositor));
  unlock_compositor_for_shutdown(current(g_context.pgmRecordingCompositor));
}

MixerPipelineBuildConfig make_pipeline_build_config(int monitorWidth, int monitorHeight)
{
  MixerPipelineBuildConfig pipelineConfig;
  pipelineConfig.monitorWidth = monitorWidth;
  pipelineConfig.monitorHeight = monitorHeight;
  pipelineConfig.internalWidth = g_context.internalWidth;
  pipelineConfig.internalHeight = g_context.internalHeight;
  pipelineConfig.monitorCallbacksEnabled =
    value_or(g_context.monitorCallbacksEnabled, false);
  pipelineConfig.monitorIpcMode =
    value_or(g_context.monitorIpcMode, MONITOR_IPC_NONE);
  pipelineConfig.monitorRendererMode =
    value_or(g_context.monitorRendererMode, MONITOR_RENDERER_AB_COMPOSITOR);
  pipelineConfig.monitorGlZeroCopyEnabled =
    value_or(g_context.monitorGlZeroCopyEnabled, false);
  pipelineConfig.monitorCompositorBackend =
    value_or(g_context.monitorCompositorBackend, MONITOR_COMPOSITOR_BACKEND_CPU);
  pipelineConfig.monitorCompositorFormatMode =
    value_or(
      g_context.monitorCompositorFormatMode,
      MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420);
  pipelineConfig.nativeMonitorWindowsEnabled =
    value_or(g_context.nativeMonitorWindowsEnabled, false);
  pipelineConfig.nativeMonitorSinkSyncEnabled =
    value_or(g_context.nativeMonitorSinkSyncEnabled, false);
  pipelineConfig.nativeMonitorSinkFactory =
    g_context.nativeMonitorSinkFactory && *g_context.nativeMonitorSinkFactory
      ? *g_context.nativeMonitorSinkFactory
      : "fakesink";
  pipelineConfig.multiviewHudEnabled =
    value_or(g_context.multiviewHudEnabled, true);
  pipelineConfig.multiviewBarsMode =
    value_or(g_context.multiviewBarsMode, MULTIVIEW_BARS_STATIC);
  pipelineConfig.multiviewSourceFps =
    value_or(g_context.multiviewSourceFps, 15);
  return pipelineConfig;
}

MixerPipelineHandleConfig make_pipeline_handle_config()
{
  MixerPipelineHandleConfig handleConfig;
  handleConfig.sourceCount = g_context.sourceCount;
  handleConfig.firstWebrtcSourceIndex = g_context.firstWebrtcSourceIndex;
  handleConfig.monitorWidth = value_or(g_context.monitorWidth, 960);
  handleConfig.monitorHeight = value_or(g_context.monitorHeight, 540);
  handleConfig.internalWidth = g_context.internalWidth;
  handleConfig.internalHeight = g_context.internalHeight;
  handleConfig.thumbnailsEnabled = value_or(g_context.thumbnailsEnabled, false);
  const MultiviewBarsMode barsMode =
    value_or(g_context.multiviewBarsMode, MULTIVIEW_BARS_STATIC);
  handleConfig.requireMultiviewOverlay =
    value_or(g_context.multiviewHudEnabled, true) ||
    barsMode == MULTIVIEW_BARS_STATIC;
  return handleConfig;
}

MixerPipelinePadElements make_pipeline_pad_elements()
{
  MixerPipelinePadElements padElements;
  padElements.pgmCompositor = current(g_context.pgmCompositor);
  padElements.pgmRecordingCompositor = current(g_context.pgmRecordingCompositor);
  padElements.pvwCompositor = current(g_context.pvwCompositor);
  padElements.multiviewCompositor = current(g_context.multiviewCompositor);
  padElements.pgmMonitorSelector = current(g_context.pgmMonitorSelector);
  padElements.pvwMonitorSelector = current(g_context.pvwMonitorSelector);
  padElements.pgmAbTransitionSelector = current(g_context.pgmAbTransitionSelector);
  padElements.combinedMonitorCompositor = current(g_context.combinedMonitorCompositor);
  return padElements;
}

MixerPipelinePadConfig make_pipeline_pad_config()
{
  MixerPipelinePadConfig padConfig;
  padConfig.sourceCount = g_context.sourceCount;
  padConfig.monitorWidth = value_or(g_context.monitorWidth, 960);
  padConfig.monitorHeight = value_or(g_context.monitorHeight, 540);
  padConfig.multiviewColumns = g_context.multiviewColumns;
  padConfig.multiviewGutter = g_context.multiviewGutter;
  padConfig.multiviewSlotWidth = g_context.multiviewSlotWidth;
  padConfig.multiviewSlotHeight = g_context.multiviewSlotHeight;
  return padConfig;
}

bool handle_error_and_clear_pipeline(Napi::Env env, const std::string& message)
{
  if (g_context.pipeline) {
    clear_gst_element(*g_context.pipeline);
  }
  Napi::Error::New(env, message).ThrowAsJavaScriptException();
  return false;
}

void configure_recording_raw_diagnostics()
{
  GstElement* recordingCompositor = current(g_context.pgmRecordingCompositor);
  log_compositor_sink_pad_mapping_if_requested(
    recordingCompositor,
    "comp_pgm_record");
  if (g_context.pgmRecordingPads) {
    attach_recording_raw_probe_if_requested(
      g_context.pgmRecordingPads[0],
      "comp_pgm_record.sink_0");
  }
  if (GstPad* recordingCompositorSrcPad =
        gst_element_get_static_pad(recordingCompositor, "src")) {
    attach_recording_raw_probe_if_requested(
      recordingCompositorSrcPad,
      "comp_pgm_record.src");
    gst_object_unref(recordingCompositorSrcPad);
  }
}

bool configure_ab_monitor_mode_if_needed(Napi::Env env)
{
  const bool abRenderer =
    value_or(g_context.monitorRendererMode, MONITOR_RENDERER_COMPOSITOR) ==
    MONITOR_RENDERER_AB_COMPOSITOR;
  if (!abRenderer) {
    return true;
  }

  detach_legacy_monitor_compositor_pads_for_ab_mode(
    true,
    g_context.sourceCount,
    current(g_context.pgmCompositor),
    g_context.pgmPads,
    current(g_context.pvwCompositor),
    g_context.pvwPads);
  if (!current(g_context.pgmAbPrimaryPad) ||
      !current(g_context.pgmAbSecondaryPad) ||
      !current(g_context.pvwAbPrimaryPad)) {
    if (g_context.pipeline && *g_context.pipeline) {
      gst_object_unref(*g_context.pipeline);
      *g_context.pipeline = nullptr;
    }
    Napi::Error::New(env, "No se encontraron los pads A/B de monitorizacion")
      .ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

void configure_graphics_monitor_pads()
{
  if (!value_or(g_context.graphicsOverlayBranchesEnabled, true)) {
    detach_graphics_overlay_compositor_pad(
      current(g_context.pgmCompositor),
      g_context.graphicsPgmPad,
      "Graphics PGM monitor");
    detach_graphics_overlay_compositor_pad(
      current(g_context.pvwCompositor),
      g_context.graphicsPvwPad,
      "Graphics PVW monitor");
  }

  GstPad* graphicsPgmPad = current(g_context.graphicsPgmPad);
  if (graphicsPgmPad) {
    g_object_set(graphicsPgmPad,
      "alpha", 0.0,
      "xpos", 0,
      "ypos", 0,
      "width", value_or(g_context.monitorWidth, 960),
      "height", value_or(g_context.monitorHeight, 540),
      "zorder", 10u,
      NULL);
  }
  GstPad* graphicsPvwPad = current(g_context.graphicsPvwPad);
  if (graphicsPvwPad) {
    g_object_set(graphicsPvwPad,
      "alpha", 0.0,
      "xpos", 0,
      "ypos", 0,
      "width", value_or(g_context.monitorWidth, 960),
      "height", value_or(g_context.monitorHeight, 540),
      "zorder", 10u,
      NULL);
  }
}

void configure_initial_program_preview_state()
{
  *g_context.programSource = 0;
  *g_context.previewSource = 1;
  g_context.programSourceForOverlay->store(
    *g_context.programSource,
    std::memory_order_relaxed);
  g_context.previewSourceForOverlay->store(
    *g_context.previewSource,
    std::memory_order_relaxed);
  g_context.updateCompositorAlphas();
}

void reset_thumbnails_and_sync_state()
{
  const auto now = std::chrono::steady_clock::now();
  for (int i = 0; i < g_context.sourceCount; i++) {
    g_context.lastThumbTime[i] = now;
  }
  g_context.syncBufferDecodedPeerCount->store(0);
  g_context.resetSyncBufferNtpAlignmentState();
}

void configure_pipeline_diagnostics()
{
  MixerPipelineDiagnosticsConfig diagnosticsConfig;
  diagnosticsConfig.sourceCount = g_context.sourceCount;
  MixerPipelineDiagnosticsState diagnosticsState =
    create_mixer_pipeline_diagnostics_state_refs();
  reset_mixer_pipeline_diagnostics(diagnosticsConfig, diagnosticsState);
  attach_mixer_pipeline_diagnostics_probes(
    diagnosticsConfig,
    create_mixer_pipeline_diagnostics_elements_refs(),
    diagnosticsState);
}

} // namespace

void set_mixer_pipeline_creation_context(
  const MixerPipelineCreationContext& context)
{
  g_context = context;
}

Napi::Value create_mixer_pipeline_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (!has_required_creation_context()) {
    Napi::Error::New(env, "Contexto de creación del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  MixerPipelineCreateRequest request;
  if (!parse_mixer_pipeline_create_request(info, request)) {
    return env.Undefined();
  }

  const int monitorWidth = request.monitorWidth;
  const int monitorHeight = request.monitorHeight;

  // Si el pipeline anterior tenía el repetidor de grafismo activo, lo
  // detenemos antes de tomar el mutex. El hilo también usa ese mutex para leer
  // appsrcs, así evitamos un deadlock durante recreaciones del mixer.
  stop_graphics_overlay_pump(make_graphics_runtime_context());

  *g_context.monitorWidth = monitorWidth;
  *g_context.monitorHeight = monitorHeight;
  *g_context.webrtcBridgeWidth = monitorWidth;
  *g_context.webrtcBridgeHeight = monitorHeight;

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);

  if (*g_context.pipeline) {
    unlock_existing_compositors_for_shutdown();
    gst_element_set_state(*g_context.pipeline, GST_STATE_NULL);
    gst_object_unref(*g_context.pipeline);
    *g_context.pipeline = nullptr;
  }
  reset_and_prime_graphics_overlay_frames(make_graphics_runtime_context());

  const std::string pipelineDesc =
    build_mixer_pipeline_description(
      make_pipeline_build_config(monitorWidth, monitorHeight));

  GError* error = nullptr;
  *g_context.pipeline = gst_parse_launch(pipelineDesc.c_str(), &error);
  if (error) {
    std::string errMsg =
      std::string("Error creando pipeline del mixer: ") + error->message;
    g_error_free(error);
    Napi::Error::New(env, errMsg).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  MixerPipelineHandles pipelineHandles;
  std::string handleError;
  if (!resolve_mixer_pipeline_handles(
        *g_context.pipeline,
        make_pipeline_handle_config(),
        pipelineHandles,
        handleError)) {
    handle_error_and_clear_pipeline(env, handleError);
    return env.Undefined();
  }
  adopt_mixer_pipeline_handles_refs(pipelineHandles);

  g_context.resetMultiviewSourceActivity();
  configure_graphics_overlay_appsrc_caps(make_graphics_runtime_context());
  add_recording_program_overlay_probe(
    current(g_context.pgmRecordingTee),
    g_context.recordingOverlayProbeContext);

  MixerPipelinePads pipelinePads;
  std::string padError;
  if (!resolve_mixer_pipeline_pads(
        make_pipeline_pad_config(),
        make_pipeline_pad_elements(),
        pipelinePads,
        padError)) {
    handle_error_and_clear_pipeline(env, padError);
    return env.Undefined();
  }
  adopt_mixer_pipeline_pads_refs(pipelinePads);

  configure_recording_raw_diagnostics();
  if (!configure_ab_monitor_mode_if_needed(env)) {
    return env.Undefined();
  }
  configure_graphics_monitor_pads();
  configure_initial_program_preview_state();

  if (!create_mixer_pipeline_js_callbacks(info, g_context.callbackTargets)) {
    return env.Undefined();
  }

  MixerPipelineCallbackConfig callbackConfig;
  callbackConfig.sourceCount = g_context.sourceCount;
  callbackConfig.monitorCallbacksEnabled =
    value_or(g_context.monitorCallbacksEnabled, false);
  callbackConfig.monitorRendererMode =
    value_or(g_context.monitorRendererMode, MONITOR_RENDERER_COMPOSITOR);
  configure_mixer_pipeline_callbacks(
    callbackConfig,
    create_mixer_pipeline_callback_elements_refs());

  reset_thumbnails_and_sync_state();
  configure_pipeline_diagnostics();

  *g_context.programRecordingEnabled = false;
  g_context.setRecordingCompositorSleeping(true);
  const bool shouldSleepPrimaryMonitors =
    value_or(g_context.monitorInputMode, MONITOR_INPUTS_BOTH) == MONITOR_INPUTS_NONE ||
    !value_or(g_context.monitorCompositorsEnabled, true) ||
    value_or(g_context.monitorRendererMode, MONITOR_RENDERER_COMPOSITOR) ==
      MONITOR_RENDERER_SELECTOR;
  g_context.setMonitorCompositorsSleeping(shouldSleepPrimaryMonitors);
  start_graphics_overlay_pump(make_graphics_runtime_context());

  return env.Undefined();
}
