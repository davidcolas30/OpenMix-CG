#pragma once

#include <napi.h>

Napi::Object register_gstreamer_addon_exports(
  Napi::Env env,
  Napi::Object exports,
  Napi::Function initializeFunction);
