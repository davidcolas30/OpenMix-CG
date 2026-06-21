#pragma once

#include "mixer_runtime_config.h"

#include <gst/gst.h>

#include <atomic>

struct MultiviewSourceControlContext {
  int sourceCount = 0;
  bool enabled = false;
  bool activeSlotsEnabled = false;
  MultiviewBarsMode barsMode = MULTIVIEW_BARS_LIVE;
  std::atomic<bool>* sourceActive = nullptr;
  GstElement** sourceValves = nullptr;
};

void refresh_multiview_source_valves(
  const MultiviewSourceControlContext& context);

void set_multiview_source_active(
  const MultiviewSourceControlContext& context,
  int sourceIndex,
  bool active);

void reset_multiview_source_activity(
  const MultiviewSourceControlContext& context);
