#include "mixer_control_actions.h"

#include <chrono>
#include <thread>

namespace {

MixerControlActionsContext g_context;

bool controls_context_ready()
{
  return g_context.mixerMutex &&
    g_context.programSource &&
    g_context.previewSource &&
    g_context.programSourceForOverlay &&
    g_context.previewSourceForOverlay &&
    g_context.transitionInProgress &&
    g_context.transitionGeneration;
}

bool is_valid_source_index(int sourceIndex)
{
  return sourceIndex >= 0 && sourceIndex < g_context.sourceCount;
}

bool is_ab_compositor_renderer()
{
  return g_context.isAbCompositorMonitorRenderer &&
    g_context.isAbCompositorMonitorRenderer();
}

GstElement* current_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

GstPad* current_pad(GstPad** padRef)
{
  return padRef ? *padRef : nullptr;
}

void store_overlay_sources()
{
  g_context.programSourceForOverlay->store(
    *g_context.programSource,
    std::memory_order_relaxed);
  g_context.previewSourceForOverlay->store(
    *g_context.previewSource,
    std::memory_order_relaxed);
}

void update_routes_locked()
{
  if (g_context.updateCompositorAlphas) {
    g_context.updateCompositorAlphas();
  }
}

void refresh_local_video_route_locked(int sourceIndex)
{
  if (g_context.refreshPausedLocalVideoAfterRouteChange) {
    g_context.refreshPausedLocalVideoAfterRouteChange(sourceIndex);
  }
}

void apply_transition_frame_locked(
  MixerTransitionType transitionType,
  int outgoingSource,
  int incomingSource,
  double progress)
{
  if (g_context.applyProgramTransitionFrame) {
    g_context.applyProgramTransitionFrame(
      transitionType,
      outgoingSource,
      incomingSource,
      progress);
  }
}

bool has_transition_pads(int outgoingSource, int incomingSource)
{
  if (is_ab_compositor_renderer()) {
    return current_pad(g_context.pgmAbPrimaryPad) &&
      current_pad(g_context.pgmAbSecondaryPad);
  }

  return g_context.pgmPads &&
    g_context.pgmPads[outgoingSource] &&
    g_context.pgmPads[incomingSource];
}

void swap_program_preview_locked()
{
  const int previousProgramSource = *g_context.programSource;
  *g_context.programSource = *g_context.previewSource;
  *g_context.previewSource = previousProgramSource;
  store_overlay_sources();
}

void throw_source_index_error(Napi::Env env)
{
  Napi::Error::New(env, "Índice de fuente fuera de rango (0-3)")
    .ThrowAsJavaScriptException();
}

} // namespace

void set_mixer_control_actions_context(const MixerControlActionsContext& context)
{
  g_context = context;
}

void cancel_mixer_control_transition_locked()
{
  if (!g_context.transitionInProgress || !g_context.transitionGeneration) {
    return;
  }

  if (!*g_context.transitionInProgress) {
    return;
  }

  *g_context.transitionInProgress = false;
  *g_context.transitionGeneration += 1;
}

Napi::Value set_program_source_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de control del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::Error::New(env, "setProgramSource requiere un índice numérico")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const int index = info[0].As<Napi::Number>().Int32Value();
  if (!is_valid_source_index(index)) {
    throw_source_index_error(env);
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  cancel_mixer_control_transition_locked();
  *g_context.programSource = index;
  store_overlay_sources();
  update_routes_locked();
  refresh_local_video_route_locked(*g_context.programSource);

  return env.Undefined();
}

Napi::Value set_preview_source_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de control del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::Error::New(env, "setPreviewSource requiere un índice numérico")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const int index = info[0].As<Napi::Number>().Int32Value();
  if (!is_valid_source_index(index)) {
    throw_source_index_error(env);
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  cancel_mixer_control_transition_locked();
  *g_context.previewSource = index;
  store_overlay_sources();
  update_routes_locked();
  refresh_local_video_route_locked(*g_context.previewSource);

  return env.Undefined();
}

Napi::Value cut_control(const Napi::CallbackInfo& info)
{
  if (!controls_context_ready()) {
    Napi::Error::New(info.Env(), "Contexto de control del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);

  cancel_mixer_control_transition_locked();
  swap_program_preview_locked();
  update_routes_locked();
  refresh_local_video_route_locked(*g_context.programSource);
  refresh_local_video_route_locked(*g_context.previewSource);

  return info.Env().Undefined();
}

Napi::Value auto_transition_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de control del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::Error::New(env, "autoTransition requiere (transitionId: string, durationMs: number)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  MixerTransitionType transitionType;
  if (!parse_mixer_transition_type(info[0], transitionType)) {
    Napi::Error::New(env, "ID de transición no soportado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const int durationMs = clamp_transition_duration_ms(info[1].As<Napi::Number>().Int32Value());
  uint64_t transitionGeneration = 0;
  int outgoingSource = 0;
  int incomingSource = 0;

  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);

    if (!current_pipeline()) {
      Napi::Error::New(env, "No hay pipeline creado. Llama a createMixerPipeline primero.")
        .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (*g_context.transitionInProgress) {
      Napi::Error::New(env, "Ya hay una transición AUTO en curso")
        .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (*g_context.programSource == *g_context.previewSource) {
      return env.Undefined();
    }

    outgoingSource = *g_context.programSource;
    incomingSource = *g_context.previewSource;

    if (!has_transition_pads(outgoingSource, incomingSource)) {
      Napi::Error::New(env, "No se encontraron los pads necesarios para ejecutar la transición")
        .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (transitionType == MIXER_TRANSITION_CUT) {
      swap_program_preview_locked();
      update_routes_locked();
      return env.Undefined();
    }

    *g_context.transitionInProgress = true;
    *g_context.transitionGeneration += 1;
    transitionGeneration = *g_context.transitionGeneration;
    apply_transition_frame_locked(transitionType, outgoingSource, incomingSource, 0.0);
  }

  std::thread([
    transitionType,
    durationMs,
    outgoingSource,
    incomingSource,
    transitionGeneration
  ]() {
    const auto startedAt = std::chrono::steady_clock::now();

    while (true) {
      auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt).count();
      double progress = static_cast<double>(elapsedMs) / static_cast<double>(durationMs);
      if (progress > 1.0) {
        progress = 1.0;
      }

      {
        std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
        if (!current_pipeline() || transitionGeneration != *g_context.transitionGeneration) {
          return;
        }

        apply_transition_frame_locked(transitionType, outgoingSource, incomingSource, progress);
      }

      if (progress >= 1.0) {
        break;
      }

      std::this_thread::sleep_for(std::chrono::milliseconds(g_context.transitionTickMs));
    }

    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    if (!current_pipeline() || transitionGeneration != *g_context.transitionGeneration) {
      return;
    }

    *g_context.programSource = incomingSource;
    *g_context.previewSource = outgoingSource;
    store_overlay_sources();
    *g_context.transitionInProgress = false;
    update_routes_locked();
  }).detach();

  return env.Undefined();
}

Napi::Value get_mixer_state_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de control del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  Napi::Object state = Napi::Object::New(env);

  state.Set("programSource", Napi::Number::New(env, *g_context.programSource));
  state.Set("previewSource", Napi::Number::New(env, *g_context.previewSource));
  state.Set("numSources", Napi::Number::New(env, g_context.sourceCount));
  state.Set("isTransitionInProgress",
    Napi::Boolean::New(env, *g_context.transitionInProgress));

  Napi::Array names = Napi::Array::New(env, g_context.sourceCount);
  for (int i = 0; i < g_context.sourceCount; i++) {
    names.Set(
      static_cast<uint32_t>(i),
      Napi::String::New(env, g_context.sourceNames ? g_context.sourceNames[i] : ""));
  }
  state.Set("sourceNames", names);

  return state;
}
