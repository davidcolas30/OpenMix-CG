#include "mixer_pipeline_js_callbacks.h"

namespace {

constexpr int kMinimumMonitorWidth = 320;
constexpr int kMaximumMonitorWidth = 1920;
constexpr int kMinimumMonitorHeight = 180;
constexpr int kMaximumMonitorHeight = 1080;

bool has_create_pipeline_signature(const Napi::CallbackInfo& info)
{
  return info.Length() >= 8 &&
    info[0].IsFunction() &&
    info[1].IsFunction() &&
    info[2].IsFunction() &&
    info[3].IsFunction() &&
    info[4].IsFunction() &&
    info[5].IsFunction() &&
    info[6].IsNumber() &&
    info[7].IsNumber();
}

bool are_valid_monitor_dimensions(int width, int height)
{
  return width >= kMinimumMonitorWidth &&
    width <= kMaximumMonitorWidth &&
    height >= kMinimumMonitorHeight &&
    height <= kMaximumMonitorHeight;
}

bool has_all_callback_targets(const MixerPipelineJsCallbackTargets& targets)
{
  return targets.pgmFrameCallback &&
    targets.pvwFrameCallback &&
    targets.thumbFrameCallback &&
    targets.busCallback &&
    targets.pgmRecordingFrameCallback &&
    targets.audioReferenceFrameCallback;
}

} // namespace

bool parse_mixer_pipeline_create_request(
  const Napi::CallbackInfo& info,
  MixerPipelineCreateRequest& request)
{
  Napi::Env env = info.Env();

  if (!has_create_pipeline_signature(info)) {
    Napi::Error::New(env,
      "Se necesitan 6 callbacks + 2 números: onPgmFrame, onPvwFrame, onThumbFrame, onBusMessage, onPgmRecordingFrame, onAudioReferenceFrame, monitorWidth, monitorHeight")
      .ThrowAsJavaScriptException();
    return false;
  }

  request.monitorWidth = info[6].As<Napi::Number>().Int32Value();
  request.monitorHeight = info[7].As<Napi::Number>().Int32Value();

  if (!are_valid_monitor_dimensions(request.monitorWidth, request.monitorHeight)) {
    Napi::Error::New(env,
      "Resolución de monitor fuera de rango válido (320×180 a 1920×1080)")
      .ThrowAsJavaScriptException();
    return false;
  }

  return true;
}

bool create_mixer_pipeline_js_callbacks(
  const Napi::CallbackInfo& info,
  const MixerPipelineJsCallbackTargets& targets)
{
  Napi::Env env = info.Env();
  if (!has_all_callback_targets(targets)) {
    Napi::Error::New(env, "Contexto de callbacks JS del mixer no inicializado")
      .ThrowAsJavaScriptException();
    return false;
  }

  // Cola de tamaño 1: como mucho un frame pendiente por destino.
  // Si JS se atrasa, descartamos el viejo y seguimos con el más nuevo.
  *targets.pgmFrameCallback = Napi::ThreadSafeFunction::New(
    env, info[0].As<Napi::Function>(), "PgmFrameCallback", 1, 1);

  *targets.pvwFrameCallback = Napi::ThreadSafeFunction::New(
    env, info[1].As<Napi::Function>(), "PvwFrameCallback", 1, 1);

  *targets.thumbFrameCallback = Napi::ThreadSafeFunction::New(
    env, info[2].As<Napi::Function>(), "ThumbFrameCallback", 1, 1);

  *targets.busCallback = Napi::ThreadSafeFunction::New(
    env, info[3].As<Napi::Function>(), "BusCallback", 0, 1);

  *targets.pgmRecordingFrameCallback = Napi::ThreadSafeFunction::New(
    env, info[4].As<Napi::Function>(), "PgmRecordingFrameCallback", 1, 1);

  *targets.audioReferenceFrameCallback = Napi::ThreadSafeFunction::New(
    env, info[5].As<Napi::Function>(), "AudioReferenceFrameCallback", 1, 1);

  return true;
}
