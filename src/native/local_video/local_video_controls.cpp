#include "local_video_controls.h"

#include <cstdio>
#include <string>

#include "gst_utils.h"
#include "local_video_source.h"
#include "mixer_selector_links.h"

namespace {

LocalVideoControlsContext g_context;

bool is_valid_local_source_index(int sourceIndex)
{
  return sourceIndex >= g_context.firstSourceIndex &&
    sourceIndex < g_context.sourceCount;
}

GstElement* current_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

int current_monitor_width()
{
  return g_context.monitorWidth ? *g_context.monitorWidth : 960;
}

int current_monitor_height()
{
  return g_context.monitorHeight ? *g_context.monitorHeight : 540;
}

bool is_program_recording_enabled()
{
  return g_context.programRecordingEnabled && *g_context.programRecordingEnabled;
}

int current_program_source()
{
  return g_context.programSource ? *g_context.programSource : 0;
}

void configure_local_video_source_runtime_context()
{
  LocalVideoSourceRuntimeContext context;
  context.mixerMutex = g_context.mixerMutex;
  context.sources = g_context.sources;
  context.firstSourceIndex = g_context.firstSourceIndex;
  context.sourceCount = g_context.sourceCount;
  context.frameRateNum = g_context.frameRateNum;
  context.frameRateDen = g_context.frameRateDen;
  context.getRunningTime = g_context.getRunningTime;
  context.restartSourceLocked = restart_local_video_source_locked;
  set_local_video_source_runtime_context(context);
}

} // namespace

void set_local_video_controls_context(const LocalVideoControlsContext& context)
{
  g_context = context;
  configure_local_video_source_runtime_context();
}

Napi::Value load_local_video_source(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsString()) {
    Napi::Error::New(env, "loadLocalVideoSource(sourceIndex: number, uri: string)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int sourceIndex = info[0].As<Napi::Number>().Int32Value();
  const std::string uri = info[1].As<Napi::String>().Utf8Value();
  if (!is_valid_local_source_index(sourceIndex)) {
    Napi::Error::New(env, "Índice de fuente local fuera de rango")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
  if (uri.empty()) {
    Napi::Error::New(env, "URI de vídeo local vacía")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (!g_context.mixerMutex || !g_context.sources ||
      !g_context.webrtcSelectors || !g_context.webrtcRecordingSelectors) {
    Napi::Error::New(env, "Contexto de vídeo local no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  GstElement* pipeline = current_pipeline();
  if (!pipeline ||
      !g_context.webrtcSelectors[sourceIndex] ||
      !g_context.webrtcRecordingSelectors[sourceIndex]) {
    Napi::Error::New(env, "El mixer no tiene selectores disponibles para vídeo local")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  clear_local_video_source_locked(sourceIndex);

  LocalVideoSourceBranchConfig localVideoConfig;
  localVideoConfig.instanceId = g_context.instanceCounter
    ? ++(*g_context.instanceCounter)
    : 0;
  localVideoConfig.sourceIndex = sourceIndex;
  localVideoConfig.uri = uri;
  localVideoConfig.monitorWidth = current_monitor_width();
  localVideoConfig.monitorHeight = current_monitor_height();
  localVideoConfig.internalWidth = g_context.internalWidth;
  localVideoConfig.internalHeight = g_context.internalHeight;
  localVideoConfig.frameRateNum = g_context.frameRateNum;
  localVideoConfig.frameRateDen = g_context.frameRateDen;
  localVideoConfig.recordingRawQueueBuffers = g_context.recordingRawQueueBuffers;
  localVideoConfig.recordingValveOpen =
    is_program_recording_enabled() &&
    g_context.sourceMatchesRecordingKeepWarmSelection &&
    g_context.sourceMatchesRecordingKeepWarmSelection(
      sourceIndex,
      current_program_source(),
      -1);
  localVideoConfig.retimeBufferProbe = on_local_video_retime_buffer_probe;
  localVideoConfig.branchEventProbe = on_local_video_branch_event_probe;
  localVideoConfig.decodebinPadAddedCallback = G_CALLBACK(on_local_video_decodebin_pad_added);

  LocalVideoSourceBranch localVideoBranch =
    create_local_video_source_branch(localVideoConfig);
  LocalVideoSource* source = localVideoBranch.source;
  if (!source || !localVideoBranch.monitorOutQueue || !localVideoBranch.recordingOutQueue) {
    Napi::Error::New(env, "No se pudieron crear los elementos GStreamer del vídeo local")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  g_context.sources[sourceIndex] = source;
  gst_bin_add(GST_BIN(pipeline), source->bin);

  if (!link_local_video_branch_to_selector(
        source,
        localVideoBranch.monitorOutQueue,
        g_context.webrtcSelectors[sourceIndex],
        &source->mixerSelectorPad,
        "monitor_video_src",
        "monitor") ||
      !link_local_video_branch_to_selector(
        source,
        localVideoBranch.recordingOutQueue,
        g_context.webrtcRecordingSelectors[sourceIndex],
        &source->mixerRecordingSelectorPad,
        "recording_video_src",
        "recording")) {
    clear_local_video_source_locked(sourceIndex);
    Napi::Error::New(env, "No se pudo conectar el vídeo local a los selectores del mixer")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  gst_element_sync_state_with_parent(source->bin);
  if (g_context.setSourceActive) {
    g_context.setSourceActive(sourceIndex, true);
  }
  if (g_context.updateCompositorAlphas) {
    g_context.updateCompositorAlphas();
  }
  printf("[LocalVideo] Fuente %d cargada desde %s\n", sourceIndex, uri.c_str());
  return Napi::Boolean::New(env, true);
}

Napi::Value clear_local_video_source(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::Error::New(env, "clearLocalVideoSource(sourceIndex: number)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int sourceIndex = info[0].As<Napi::Number>().Int32Value();
  if (!g_context.mixerMutex) {
    return Napi::Boolean::New(env, false);
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  return Napi::Boolean::New(env, clear_local_video_source_locked(sourceIndex));
}

Napi::Value restart_local_video_source(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::Error::New(env, "restartLocalVideoSource(sourceIndex: number)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int sourceIndex = info[0].As<Napi::Number>().Int32Value();
  if (!g_context.mixerMutex) {
    return Napi::Boolean::New(env, false);
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  return Napi::Boolean::New(env, restart_local_video_source_locked(sourceIndex));
}

Napi::Value set_local_video_paused(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
    Napi::Error::New(env, "setLocalVideoPaused(sourceIndex: number, paused: boolean)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int sourceIndex = info[0].As<Napi::Number>().Int32Value();
  const bool paused = info[1].As<Napi::Boolean>().Value();
  if (!g_context.mixerMutex) {
    return Napi::Boolean::New(env, false);
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  return Napi::Boolean::New(env, set_local_video_paused_locked(sourceIndex, paused));
}

Napi::Value set_local_video_loop(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsBoolean()) {
    Napi::Error::New(env, "setLocalVideoLoop(sourceIndex: number, loop: boolean)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int sourceIndex = info[0].As<Napi::Number>().Int32Value();
  const bool loopEnabled = info[1].As<Napi::Boolean>().Value();
  if (!g_context.mixerMutex) {
    return Napi::Boolean::New(env, false);
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  return Napi::Boolean::New(env, set_local_video_loop_locked(sourceIndex, loopEnabled));
}

bool clear_local_video_source_locked(int sourceIndex)
{
  if (!is_valid_local_source_index(sourceIndex) || !g_context.sources) {
    return false;
  }

  if (g_context.setSourceActive) {
    g_context.setSourceActive(sourceIndex, false);
  }

  LocalVideoSource* source = g_context.sources[sourceIndex];
  if (!source) {
    return true;
  }

  if (source->bin) {
    remove_local_video_pause_gate(source);
    if (g_context.setSlotToFallback) {
      g_context.setSlotToFallback(sourceIndex);
    }
    gst_element_set_state(source->bin, GST_STATE_NULL);

    GstPad* monitorGhostSrcPad = gst_element_get_static_pad(source->bin, "monitor_video_src");
    if (monitorGhostSrcPad) {
      if (source->mixerSelectorPad) {
        gst_pad_unlink(monitorGhostSrcPad, source->mixerSelectorPad);
      }
      gst_object_unref(monitorGhostSrcPad);
    }

    GstPad* recordingGhostSrcPad = gst_element_get_static_pad(source->bin, "recording_video_src");
    if (recordingGhostSrcPad) {
      if (source->mixerRecordingSelectorPad) {
        gst_pad_unlink(recordingGhostSrcPad, source->mixerRecordingSelectorPad);
      }
      gst_object_unref(recordingGhostSrcPad);
    }

    if (source->mixerSelectorPad && g_context.webrtcSelectors &&
        g_context.webrtcSelectors[sourceIndex]) {
      gst_element_release_request_pad(
        g_context.webrtcSelectors[sourceIndex],
        source->mixerSelectorPad);
      gst_object_unref(source->mixerSelectorPad);
      source->mixerSelectorPad = nullptr;
    }

    if (source->mixerRecordingSelectorPad && g_context.webrtcRecordingSelectors &&
        g_context.webrtcRecordingSelectors[sourceIndex]) {
      gst_element_release_request_pad(
        g_context.webrtcRecordingSelectors[sourceIndex],
        source->mixerRecordingSelectorPad);
      gst_object_unref(source->mixerRecordingSelectorPad);
      source->mixerRecordingSelectorPad = nullptr;
    }

    GstElement* pipeline = current_pipeline();
    if (pipeline && GST_IS_BIN(pipeline)) {
      gst_bin_remove(GST_BIN(pipeline), source->bin);
    }
  }

  if (source->retimeSrcPad) {
    gst_object_unref(source->retimeSrcPad);
    source->retimeSrcPad = nullptr;
  }
  if (source->pauseGatePad) {
    gst_object_unref(source->pauseGatePad);
    source->pauseGatePad = nullptr;
  }

  printf("[LocalVideo] Fuente local %d liberada\n", sourceIndex);
  g_context.sources[sourceIndex] = nullptr;
  if (g_context.updateCompositorAlphas) {
    g_context.updateCompositorAlphas();
  }
  delete source;
  return true;
}

bool restart_local_video_source_locked(int sourceIndex)
{
  if (!is_valid_local_source_index(sourceIndex) || !g_context.sources) {
    return false;
  }

  LocalVideoSource* source = g_context.sources[sourceIndex];
  if (!source || !source->bin) {
    return false;
  }

  remove_local_video_pause_gate(source);
  if (source->clockSync) {
    g_signal_emit_by_name(source->clockSync, "resync");
  }
  reset_local_video_timeline_anchor(source);
  source->loopSeekPending.store(false);

  const gboolean seekOk = gst_element_seek_simple(
    source->bin,
    GST_FORMAT_TIME,
    static_cast<GstSeekFlags>(GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_KEY_UNIT),
    0);
  if (!seekOk) {
    fprintf(stderr, "[LocalVideo] No se pudo reiniciar la fuente %d\n", sourceIndex);
    return false;
  }

  const GstStateChangeReturn stateRet = gst_element_set_state(source->bin, GST_STATE_PLAYING);
  if (stateRet == GST_STATE_CHANGE_FAILURE) {
    fprintf(stderr, "[LocalVideo] No se pudo reanudar la fuente %d tras reiniciar\n", sourceIndex);
    return false;
  }

  source->paused = false;
  if (g_context.webrtcSelectors) {
    set_selector_active_pad(g_context.webrtcSelectors[sourceIndex], source->mixerSelectorPad);
  }
  if (g_context.webrtcRecordingSelectors) {
    set_selector_active_pad(
      g_context.webrtcRecordingSelectors[sourceIndex],
      source->mixerRecordingSelectorPad);
  }
  printf("[LocalVideo] Fuente %d reiniciada desde el comienzo\n", sourceIndex);
  return true;
}

bool set_local_video_paused_locked(int sourceIndex, bool paused)
{
  if (!is_valid_local_source_index(sourceIndex) || !g_context.sources) {
    return false;
  }

  LocalVideoSource* source = g_context.sources[sourceIndex];
  if (!source || !source->bin) {
    return false;
  }

  if (paused) {
    uint64_t retimedFrames = 0;
    {
      std::lock_guard<std::mutex> timelineLock(source->timelineMutex);
      retimedFrames = source->retimedFrames;
    }

    if (retimedFrames == 0) {
      std::lock_guard<std::mutex> pauseLock(source->pauseGateMutex);
      if (source->pauseGateProbeId == 0) {
        /*
         * Si el usuario carga y pausa antes de que decodebin haya publicado el
         * primer frame, no bloqueamos el primer buffer: dejamos pasar al menos
         * uno para que Preview/Program tengan una referencia visual.
         */
        source->pauseGateTargetRetimedFrame = 1;
      }
    } else {
      schedule_local_video_pause_gate(source);
    }

    source->paused = true;
  } else {
    remove_local_video_pause_gate(source);
    if (source->clockSync) {
      g_signal_emit_by_name(source->clockSync, "resync");
    }
    reset_local_video_timeline_anchor(source);
    const GstStateChangeReturn stateRet = gst_element_set_state(source->bin, GST_STATE_PLAYING);
    if (stateRet == GST_STATE_CHANGE_FAILURE) {
      fprintf(stderr, "[LocalVideo] No se pudo reanudar la fuente %d\n", sourceIndex);
      return false;
    }
    source->paused = false;
    source->loopSeekPending.store(false);
    if (g_context.webrtcSelectors) {
      set_selector_active_pad(g_context.webrtcSelectors[sourceIndex], source->mixerSelectorPad);
    }
    if (g_context.webrtcRecordingSelectors) {
      set_selector_active_pad(
        g_context.webrtcRecordingSelectors[sourceIndex],
        source->mixerRecordingSelectorPad);
    }
    if (g_context.updateCompositorAlphas) {
      g_context.updateCompositorAlphas();
    }
  }

  printf("[LocalVideo] Fuente %d %s\n", sourceIndex, paused ? "pausada" : "reanudada");
  return true;
}

bool set_local_video_loop_locked(int sourceIndex, bool loopEnabled)
{
  if (!is_valid_local_source_index(sourceIndex) || !g_context.sources) {
    return false;
  }

  LocalVideoSource* source = g_context.sources[sourceIndex];
  if (!source || !source->bin) {
    return false;
  }

  source->loopEnabled = loopEnabled;
  source->loopSeekPending.store(false);
  printf("[LocalVideo] Fuente %d loop=%s\n", sourceIndex, loopEnabled ? "on" : "off");
  return true;
}

void clear_all_local_video_sources_locked()
{
  for (int i = g_context.firstSourceIndex; i < g_context.sourceCount; i++) {
    clear_local_video_source_locked(i);
  }
}
