#pragma once

#include <napi.h>
#include <gst/gst.h>

#include "mixer_runtime_config.h"

struct NativeMonitorControlsContext {
  GstElement** pipeline = nullptr;
  bool* nativeMonitorWindowsEnabled = nullptr;
  MonitorRendererMode* monitorRendererMode = nullptr;

  GstElement** pgmSelectorSink = nullptr;
  GstElement** pgmSelectorValve = nullptr;
  GstElement** pvwSelectorSink = nullptr;
  GstElement** pvwSelectorValve = nullptr;

  GstElement** pgmDirectSink = nullptr;
  GstElement** pgmDirectValve = nullptr;
  GstElement** pvwDirectSink = nullptr;
  GstElement** pvwDirectValve = nullptr;

  GstElement** multiviewSink = nullptr;
  GstElement** multiviewValve = nullptr;

  GstElement** audioReferenceSink = nullptr;
  GstElement** audioReferenceValve = nullptr;
  GstElement** audioReferenceFrameValve = nullptr;
};

void set_native_monitor_controls_context(const NativeMonitorControlsContext& context);

Napi::Value set_native_monitor_window_handle(const Napi::CallbackInfo& info);
Napi::Value set_native_monitor_visible(const Napi::CallbackInfo& info);
