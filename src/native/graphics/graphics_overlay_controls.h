#pragma once

#include <napi.h>

#include <functional>

#include "graphics_overlay_runtime.h"

using GraphicsOverlayRuntimeProvider =
  std::function<GraphicsOverlayRuntimeContext()>;

struct GraphicsOverlayControlsContext {
  GraphicsOverlayRuntimeProvider makeRuntimeContext;
};

void set_graphics_overlay_controls_context(
  const GraphicsOverlayControlsContext& context);

Napi::Value set_graphics_overlay_enabled_control(const Napi::CallbackInfo& info);
Napi::Value push_graphics_overlay_frame(const Napi::CallbackInfo& info);
