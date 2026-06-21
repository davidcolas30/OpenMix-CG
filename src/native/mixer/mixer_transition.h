#pragma once

#include <napi.h>
#include <gst/gst.h>

enum MixerTransitionType {
  MIXER_TRANSITION_CUT,
  MIXER_TRANSITION_MIX,
  MIXER_TRANSITION_DIP_TO_BLACK,
  MIXER_TRANSITION_SLIDE_LEFT,
  MIXER_TRANSITION_SLIDE_RIGHT
};

int clamp_transition_duration_ms(int requestedDurationMs);

bool parse_mixer_transition_type(
  const Napi::Value& value,
  MixerTransitionType& outTransitionType);

void apply_source_pad_layout(
  GstPad* pad,
  double alpha,
  int xpos,
  int ypos,
  int width,
  int height,
  unsigned int zorder);

void apply_program_transition_frame_to_pads(
  GstPad** pads,
  int sourceCount,
  int outputWidth,
  int outputHeight,
  MixerTransitionType transitionType,
  int outgoingSource,
  int incomingSource,
  double progress);

void apply_program_transition_frame_to_ab_pads(
  GstPad* outgoingPad,
  GstPad* incomingPad,
  int outputWidth,
  int outputHeight,
  MixerTransitionType transitionType,
  double progress);
