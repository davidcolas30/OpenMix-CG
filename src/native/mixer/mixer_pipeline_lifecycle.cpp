#include "mixer_pipeline_lifecycle.h"

#include <cstdio>

#include "gst_utils.h"
#include "local_video_controls.h"
#include "recording_controls.h"

namespace {

MixerPipelineLifecycleContext g_context;

GstElement* current_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

void unlock_compositors_for_shutdown()
{
  for (GstElement** compositorRef : g_context.compositorRefs) {
    if (compositorRef) {
      unlock_compositor_for_shutdown(*compositorRef);
    }
  }
}

void stop_active_recording_locked()
{
  if (g_context.nativeProgramRecordingActive && *g_context.nativeProgramRecordingActive) {
    set_recording_inputs_enabled_locked(false);
    destroy_native_recording_branch_locked(true);
  }
}

void release_thread_safe_functions()
{
  for (Napi::ThreadSafeFunction* tsfn : g_context.threadSafeFunctions) {
    if (tsfn) {
      tsfn->Release();
    }
  }
}

void reset_monitor_webrtc_endpoints()
{
  for (MonitorWebRtcEndpoint* endpoint : g_context.monitorWebRtcEndpoints) {
    if (endpoint) {
      reset_monitor_webrtc_endpoint_after_pipeline_destroy(*endpoint);
    }
  }
}

void reset_runtime_state_after_destroy()
{
  if (g_context.programRecordingEnabled) {
    *g_context.programRecordingEnabled = false;
  }
  if (g_context.nativeProgramRecordingActive) {
    *g_context.nativeProgramRecordingActive = false;
  }
  if (g_context.transitionInProgress) {
    *g_context.transitionInProgress = false;
  }
  if (g_context.graphicsProgramFrame) {
    *g_context.graphicsProgramFrame = GraphicsOverlayLatestFrame{};
  }
  if (g_context.graphicsPreviewFrame) {
    *g_context.graphicsPreviewFrame = GraphicsOverlayLatestFrame{};
  }
  if (g_context.activeWebrtcPeerCount) {
    g_context.activeWebrtcPeerCount->store(0);
  }
  if (g_context.syncBufferDecodedPeerCount) {
    g_context.syncBufferDecodedPeerCount->store(0);
  }
  if (g_context.mediaPlaneActive) {
    g_context.mediaPlaneActive->store(false);
  }
}

} // namespace

void set_mixer_pipeline_lifecycle_context(
  const MixerPipelineLifecycleContext& context)
{
  g_context = context;
}

Napi::Value start_pipeline_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (!g_context.mixerMutex) {
    Napi::Error::New(env, "Contexto de lifecycle del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  GstElement* pipeline = current_pipeline();

  if (!pipeline) {
    Napi::Error::New(env, "No hay pipeline creado. Llama a createMixerPipeline primero.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GstStateChangeReturn ret = gst_element_set_state(pipeline, GST_STATE_PLAYING);
  if (ret == GST_STATE_CHANGE_FAILURE) {
    Napi::Error::New(env, "No se pudo iniciar el pipeline")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_context.mediaPlaneActive) {
    g_context.mediaPlaneActive->store(true);
  }

  GstState currentState = GST_STATE_NULL;
  GstState pendingState = GST_STATE_VOID_PENDING;
  GstStateChangeReturn stateRet =
    gst_element_get_state(pipeline, &currentState, &pendingState, 2 * GST_SECOND);
  printf("[Mixer] Estado tras start: setState=%d getState=%d current=%s pending=%s\n",
    ret,
    stateRet,
    gst_element_state_get_name(currentState),
    gst_element_state_get_name(pendingState));

  if (g_context.seedGraphicsOverlayInputs) {
    g_context.seedGraphicsOverlayInputs();
  }

  return env.Undefined();
}

Napi::Value stop_pipeline_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (!g_context.mixerMutex) {
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  GstElement* pipeline = current_pipeline();

  if (pipeline) {
    if (g_context.cancelTransitionLocked) {
      g_context.cancelTransitionLocked();
    }
    stop_active_recording_locked();
    unlock_compositors_for_shutdown();
    gst_element_set_state(pipeline, GST_STATE_NULL);
    if (g_context.mediaPlaneActive) {
      g_context.mediaPlaneActive->store(false);
    }
  }

  return env.Undefined();
}

Napi::Value destroy_pipeline_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (g_context.stopGraphicsOverlayPump) {
    g_context.stopGraphicsOverlayPump();
  }

  if (!g_context.mixerMutex) {
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  GstElement* pipeline = current_pipeline();

  if (pipeline) {
    if (g_context.cancelTransitionLocked) {
      g_context.cancelTransitionLocked();
    }
    stop_active_recording_locked();
    clear_all_local_video_sources_locked();
    unlock_compositors_for_shutdown();
    gst_element_set_state(pipeline, GST_STATE_NULL);

    release_thread_safe_functions();
    reset_monitor_webrtc_endpoints();

    if (g_context.makeCleanupRefs) {
      MixerPipelineCleanupRefs cleanupRefs = g_context.makeCleanupRefs();
      release_mixer_pipeline_gstreamer_refs(cleanupRefs);
    }
    reset_runtime_state_after_destroy();
  }

  return env.Undefined();
}
