#include "graphics_overlay_controls.h"

#include <memory>
#include <vector>

namespace {

GraphicsOverlayControlsContext g_context;

bool controls_context_ready()
{
  return static_cast<bool>(g_context.makeRuntimeContext);
}

bool parse_graphics_overlay_target(
  const Napi::Value& value,
  GraphicsOverlayTarget& outTarget)
{
  if (!value.IsString()) {
    return false;
  }

  return parse_graphics_overlay_target_name(
    value.As<Napi::String>().Utf8Value(),
    outTarget);
}

} // namespace

void set_graphics_overlay_controls_context(
  const GraphicsOverlayControlsContext& context)
{
  g_context = context;
}

Napi::Value set_graphics_overlay_enabled_control(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de grafismo nativo no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBoolean()) {
    Napi::Error::New(env, "setGraphicsOverlayEnabled(target: 'program' | 'preview', enabled: boolean)")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GraphicsOverlayTarget target;
  if (!parse_graphics_overlay_target(info[0], target)) {
    Napi::Error::New(env, "Target de overlay inválido. Usa 'program' o 'preview'.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const bool enabled = info[1].As<Napi::Boolean>().Value();
  bool shouldJoinPump = false;
  {
    GraphicsOverlayRuntimeContext graphicsContext =
      g_context.makeRuntimeContext();
    if (!graphicsContext.mutex) {
      return Napi::Boolean::New(env, false);
    }

    std::lock_guard<std::mutex> lock(*graphicsContext.mutex);
    if (!graphicsContext.branchesEnabled) {
      return Napi::Boolean::New(env, false);
    }

    set_graphics_overlay_enabled(graphicsContext, target, enabled);
    if (enabled) {
      start_graphics_overlay_pump(graphicsContext);
    } else if (graphics_overlay_pump_can_stop_when_inactive(graphicsContext)) {
      shouldJoinPump = request_graphics_overlay_pump_stop(graphicsContext);
    }
  }

  if (shouldJoinPump) {
    join_graphics_overlay_pump_after_unlock(g_context.makeRuntimeContext());
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value push_graphics_overlay_frame(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!controls_context_ready()) {
    Napi::Error::New(env, "Contexto de grafismo nativo no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsBuffer() ||
      !info[2].IsNumber() || !info[3].IsNumber()) {
    Napi::Error::New(
      env,
      "pushGraphicsOverlayFrame(target: 'program' | 'preview', data: Buffer, width: number, height: number)"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  GraphicsOverlayTarget target;
  if (!parse_graphics_overlay_target(info[0], target)) {
    Napi::Error::New(env, "Target de overlay inválido. Usa 'program' o 'preview'.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int width = info[2].As<Napi::Number>().Int32Value();
  int height = info[3].As<Napi::Number>().Int32Value();
  if (width <= 0 || height <= 0) {
    Napi::Error::New(env, "El frame de overlay debe tener dimensiones positivas")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> data = info[1].As<Napi::Buffer<uint8_t>>();
  size_t expectedSize = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  if (data.Length() != expectedSize) {
    Napi::Error::New(env, "El buffer del overlay no coincide con width * height * 4")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // La copia grande del frame BGRA se hace fuera de g_mutex. Durante una
  // animacion pueden llegar muchos paints de Chromium; si copiamos dentro del
  // mutex, el hilo nativo que da cadencia al appsrc puede quedarse esperando y
  // provocar justo los microtirones que intentamos eliminar.
  auto nextFrame = std::make_shared<std::vector<uint8_t>>(
    data.Data(),
    data.Data() + expectedSize);

  {
    GraphicsOverlayRuntimeContext graphicsContext =
      g_context.makeRuntimeContext();
    if (!graphicsContext.mutex) {
      return Napi::Boolean::New(env, false);
    }

    std::lock_guard<std::mutex> lock(*graphicsContext.mutex);
    if (!graphicsContext.branchesEnabled) {
      return Napi::Boolean::New(env, false);
    }

    if (!store_graphics_overlay_frame(
          graphicsContext,
          target,
          nextFrame,
          width,
          height)) {
      return Napi::Boolean::New(env, false);
    }
  }

  // Esta llamada viene del paint de Chromium y puede llegar con jitter o en
  // rafagas durante animaciones CSS. No empujamos aqui al appsrc: solo
  // actualizamos el ultimo raster. El hilo nativo graphics_overlay_pump_loop
  // es el unico escritor del appsrc y mantiene la cadencia estable de 30fps.
  return Napi::Boolean::New(env, true);
}
