#include "native_monitor_controls.h"

#include <gst/video/videooverlay.h>

#include <cstring>
#include <string>

namespace {

NativeMonitorControlsContext g_context;

GstElement* current(GstElement** element)
{
  return element ? *element : nullptr;
}

GstElement* current_pipeline()
{
  return current(g_context.pipeline);
}

bool native_monitor_windows_enabled()
{
  return g_context.nativeMonitorWindowsEnabled && *g_context.nativeMonitorWindowsEnabled;
}

bool use_selector_renderer()
{
  return g_context.monitorRendererMode &&
    *g_context.monitorRendererMode == MONITOR_RENDERER_SELECTOR;
}

static bool is_audio_reference_target(const std::string& target)
{
  return target == "audio-reference" ||
    target == "audio_reference" ||
    target == "audio";
}

static GstElement* get_native_monitor_sink_for_target(
  const std::string& target,
  const NativeMonitorControlsContext& context)
{
  if (target == "program" || target == "pgm") {
    return use_selector_renderer()
      ? current(context.pgmSelectorSink)
      : current(context.pgmDirectSink);
  }
  if (target == "preview" || target == "pvw") {
    return use_selector_renderer()
      ? current(context.pvwSelectorSink)
      : current(context.pvwDirectSink);
  }
  if (target == "multiview" || target == "mv") {
    return current(context.multiviewSink);
  }
  if (is_audio_reference_target(target)) {
    return current(context.audioReferenceSink);
  }
  return nullptr;
}

static GstElement* get_native_monitor_valve_for_target(
  const std::string& target,
  const NativeMonitorControlsContext& context)
{
  if (target == "program" || target == "pgm") {
    return use_selector_renderer()
      ? current(context.pgmSelectorValve)
      : current(context.pgmDirectValve);
  }
  if (target == "preview" || target == "pvw") {
    return use_selector_renderer()
      ? current(context.pvwSelectorValve)
      : current(context.pvwDirectValve);
  }
  if (target == "multiview" || target == "mv") {
    return current(context.multiviewValve);
  }
  if (is_audio_reference_target(target)) {
    return current(context.audioReferenceValve);
  }
  return nullptr;
}

} // namespace

void set_native_monitor_controls_context(const NativeMonitorControlsContext& context)
{
  g_context = context;
}

Napi::Value set_native_monitor_window_handle(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBuffer()) {
    Napi::Error::New(env, "setNativeMonitorWindowHandle(target: string, nativeHandle: Buffer)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (!current_pipeline()) {
    Napi::Error::New(env, "El pipeline del mixer no existe")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (!native_monitor_windows_enabled()) {
    return Napi::Boolean::New(env, false);
  }

  const std::string target = info[0].As<Napi::String>().Utf8Value();
  GstElement* sink = get_native_monitor_sink_for_target(target, g_context);
  GstElement* valve = get_native_monitor_valve_for_target(target, g_context);
  if (!sink || !valve) {
    Napi::Error::New(env, "Monitor nativo no disponible para el target indicado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  Napi::Buffer<uint8_t> handleBuffer = info[1].As<Napi::Buffer<uint8_t>>();
  if (handleBuffer.Length() < sizeof(guintptr)) {
    Napi::Error::New(env, "Handle nativo demasiado corto")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  guintptr nativeHandle = 0;
  std::memcpy(&nativeHandle, handleBuffer.Data(), sizeof(guintptr));
  if (nativeHandle == 0) {
    Napi::Error::New(env, "Handle nativo nulo")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (!GST_IS_VIDEO_OVERLAY(sink)) {
    Napi::Error::New(env, "El sink nativo no implementa GstVideoOverlay")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(sink), nativeHandle);
  gst_video_overlay_handle_events(GST_VIDEO_OVERLAY(sink), FALSE);

  printf("[Mixer] Monitor nativo %s conectado a handle 0x%llx\n",
    target.c_str(),
    static_cast<unsigned long long>(nativeHandle));

  return Napi::Boolean::New(env, true);
}

Napi::Value set_native_monitor_visible(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBoolean()) {
    Napi::Error::New(env, "setNativeMonitorVisible(target: string, visible: boolean)")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const std::string target = info[0].As<Napi::String>().Utf8Value();
  GstElement* valve = get_native_monitor_valve_for_target(target, g_context);
  if (!valve) {
    return Napi::Boolean::New(env, false);
  }

  const bool visible = info[1].As<Napi::Boolean>().Value();
  if (!native_monitor_windows_enabled()) {
    g_object_set(valve, "drop", TRUE, nullptr);
    GstElement* audioReferenceFrameValve = current(g_context.audioReferenceFrameValve);
    if (is_audio_reference_target(target) && audioReferenceFrameValve) {
      g_object_set(audioReferenceFrameValve, "drop", TRUE, nullptr);
    }
    return Napi::Boolean::New(env, false);
  }

  g_object_set(valve, "drop", visible ? FALSE : TRUE, nullptr);
  GstElement* audioReferenceFrameValve = current(g_context.audioReferenceFrameValve);
  if (is_audio_reference_target(target) && audioReferenceFrameValve) {
    g_object_set(audioReferenceFrameValve, "drop", visible ? FALSE : TRUE, nullptr);
  }
  return Napi::Boolean::New(env, true);
}
