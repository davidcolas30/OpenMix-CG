#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <functional>
#include <mutex>

#include "mixer_transition.h"

using MixerRouteUpdateCallback = std::function<void()>;
using MixerLocalVideoRouteRefreshCallback = std::function<void(int sourceIndex)>;
using MixerTransitionFrameApplier =
  std::function<void(MixerTransitionType transitionType, int outgoingSource, int incomingSource, double progress)>;
using MixerMonitorRendererPredicate = std::function<bool()>;

struct MixerControlActionsContext {
  std::mutex* mixerMutex = nullptr;
  GstElement** pipeline = nullptr;
  int sourceCount = 0;
  const char** sourceNames = nullptr;
  int* programSource = nullptr;
  int* previewSource = nullptr;
  std::atomic<int>* programSourceForOverlay = nullptr;
  std::atomic<int>* previewSourceForOverlay = nullptr;
  bool* transitionInProgress = nullptr;
  uint64_t* transitionGeneration = nullptr;
  int transitionTickMs = 16;

  GstPad** pgmPads = nullptr;
  GstPad** pgmAbPrimaryPad = nullptr;
  GstPad** pgmAbSecondaryPad = nullptr;

  MixerMonitorRendererPredicate isAbCompositorMonitorRenderer;
  MixerRouteUpdateCallback updateCompositorAlphas;
  MixerLocalVideoRouteRefreshCallback refreshPausedLocalVideoAfterRouteChange;
  MixerTransitionFrameApplier applyProgramTransitionFrame;
};

void set_mixer_control_actions_context(const MixerControlActionsContext& context);

void cancel_mixer_control_transition_locked();

Napi::Value set_program_source_control(const Napi::CallbackInfo& info);
Napi::Value set_preview_source_control(const Napi::CallbackInfo& info);
Napi::Value cut_control(const Napi::CallbackInfo& info);
Napi::Value auto_transition_control(const Napi::CallbackInfo& info);
Napi::Value get_mixer_state_control(const Napi::CallbackInfo& info);
