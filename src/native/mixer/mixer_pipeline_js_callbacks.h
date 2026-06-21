#pragma once

#include <napi.h>

struct MixerPipelineCreateRequest {
  int monitorWidth = 0;
  int monitorHeight = 0;
};

struct MixerPipelineJsCallbackTargets {
  Napi::ThreadSafeFunction* pgmFrameCallback = nullptr;
  Napi::ThreadSafeFunction* pvwFrameCallback = nullptr;
  Napi::ThreadSafeFunction* thumbFrameCallback = nullptr;
  Napi::ThreadSafeFunction* busCallback = nullptr;
  Napi::ThreadSafeFunction* pgmRecordingFrameCallback = nullptr;
  Napi::ThreadSafeFunction* audioReferenceFrameCallback = nullptr;
};

bool parse_mixer_pipeline_create_request(
  const Napi::CallbackInfo& info,
  MixerPipelineCreateRequest& request);
bool create_mixer_pipeline_js_callbacks(
  const Napi::CallbackInfo& info,
  const MixerPipelineJsCallbackTargets& targets);
