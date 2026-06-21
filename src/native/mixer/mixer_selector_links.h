#pragma once

#include <gst/gst.h>

struct LocalVideoSource;
struct WebRTCPeer;

bool link_webrtc_branches_to_mixer_selectors(
  WebRTCPeer* peer,
  GstElement* monitorLastElement,
  GstElement* recordingLastElement);

bool link_local_video_branch_to_selector(
  LocalVideoSource* source,
  GstElement* lastElement,
  GstElement* selector,
  GstPad** selectorPad,
  const char* ghostPadName,
  const char* label);
