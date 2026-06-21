#pragma once

#include <gst/gst.h>

void attach_recording_raw_probe_if_requested(
  GstPad* pad,
  const char* label);
