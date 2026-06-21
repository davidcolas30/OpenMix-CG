#pragma once

#include "mixer_runtime_config.h"

#include <string>

struct MixerPipelineBuildConfig {
  int monitorWidth = 960;
  int monitorHeight = 540;
  int internalWidth = 1920;
  int internalHeight = 1080;
  bool monitorCallbacksEnabled = false;
  MonitorIpcMode monitorIpcMode = MONITOR_IPC_NONE;
  MonitorRendererMode monitorRendererMode = MONITOR_RENDERER_AB_COMPOSITOR;
  bool monitorGlZeroCopyEnabled = false;
  MonitorCompositorBackend monitorCompositorBackend = MONITOR_COMPOSITOR_BACKEND_CPU;
  MonitorCompositorFormatMode monitorCompositorFormatMode =
    MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420;
  bool nativeMonitorWindowsEnabled = false;
  bool nativeMonitorSinkSyncEnabled = false;
  const char* nativeMonitorSinkFactory = "fakesink";
  bool multiviewHudEnabled = true;
  MultiviewBarsMode multiviewBarsMode = MULTIVIEW_BARS_STATIC;
  int multiviewSourceFps = 15;
};

std::string build_mixer_pipeline_description(const MixerPipelineBuildConfig& config);
