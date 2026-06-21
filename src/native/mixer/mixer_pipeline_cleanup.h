#pragma once

#include "multiview_overlay.h"

#include <gst/gst.h>
#include <vector>

struct MixerPipelineCleanupRefs {
  GstElement** pipeline = nullptr;
  GstElement** multiviewOverlay = nullptr;
  MultiviewOverlayState* multiviewOverlayState = nullptr;
  std::vector<GstPad**> padRefs;
  std::vector<GstElement**> elementRefs;
};

void release_mixer_pipeline_gstreamer_refs(MixerPipelineCleanupRefs& refs);
