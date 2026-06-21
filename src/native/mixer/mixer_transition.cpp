#include "mixer_transition.h"

#include <algorithm>
#include <cmath>
#include <string>

namespace {

static const int MIN_TRANSITION_DURATION_MS = 150;
static const int MAX_TRANSITION_DURATION_MS = 2000;

} // namespace

int clamp_transition_duration_ms(int requestedDurationMs)
{
  return std::max(MIN_TRANSITION_DURATION_MS,
    std::min(MAX_TRANSITION_DURATION_MS, requestedDurationMs));
}

bool parse_mixer_transition_type(
  const Napi::Value& value,
  MixerTransitionType& outTransitionType)
{
  if (!value.IsString()) {
    return false;
  }

  std::string transitionId = value.As<Napi::String>().Utf8Value();
  if (transitionId == "cut") {
    outTransitionType = MIXER_TRANSITION_CUT;
    return true;
  }

  if (transitionId == "mix") {
    outTransitionType = MIXER_TRANSITION_MIX;
    return true;
  }

  if (transitionId == "dip-to-black") {
    outTransitionType = MIXER_TRANSITION_DIP_TO_BLACK;
    return true;
  }

  if (transitionId == "slide-left") {
    outTransitionType = MIXER_TRANSITION_SLIDE_LEFT;
    return true;
  }

  if (transitionId == "slide-right") {
    outTransitionType = MIXER_TRANSITION_SLIDE_RIGHT;
    return true;
  }

  return false;
}

void apply_source_pad_layout(
  GstPad* pad,
  double alpha,
  int xpos,
  int ypos,
  int width,
  int height,
  unsigned int zorder)
{
  if (!pad) {
    return;
  }

  g_object_set(
    pad,
    "alpha", alpha,
    "xpos", xpos,
    "ypos", ypos,
    "width", width,
    "height", height,
    "zorder", zorder,
    NULL);
}

void apply_program_transition_frame_to_pads(
  GstPad** pads,
  int sourceCount,
  int outputWidth,
  int outputHeight,
  MixerTransitionType transitionType,
  int outgoingSource,
  int incomingSource,
  double progress)
{
  double clampedProgress = std::max(0.0, std::min(1.0, progress));

  for (int i = 0; i < sourceCount; i++) {
    apply_source_pad_layout(
      pads[i],
      0.0,
      0,
      0,
      outputWidth,
      outputHeight,
      0);
  }

  switch (transitionType) {
    case MIXER_TRANSITION_MIX: {
      apply_source_pad_layout(
        pads[outgoingSource],
        1.0 - clampedProgress,
        0,
        0,
        outputWidth,
        outputHeight,
        0);
      apply_source_pad_layout(
        pads[incomingSource],
        clampedProgress,
        0,
        0,
        outputWidth,
        outputHeight,
        1);
      break;
    }

    case MIXER_TRANSITION_DIP_TO_BLACK: {
      double outgoingAlpha = 0.0;
      double incomingAlpha = 0.0;

      if (clampedProgress < 0.5) {
        outgoingAlpha = 1.0 - (clampedProgress * 2.0);
      } else {
        incomingAlpha = (clampedProgress - 0.5) * 2.0;
      }

      apply_source_pad_layout(
        pads[outgoingSource],
        outgoingAlpha,
        0,
        0,
        outputWidth,
        outputHeight,
        0);
      apply_source_pad_layout(
        pads[incomingSource],
        incomingAlpha,
        0,
        0,
        outputWidth,
        outputHeight,
        1);
      break;
    }

    case MIXER_TRANSITION_SLIDE_LEFT: {
      int offset = static_cast<int>(std::round(outputWidth * clampedProgress));
      apply_source_pad_layout(
        pads[outgoingSource],
        1.0,
        -offset,
        0,
        outputWidth,
        outputHeight,
        0);
      apply_source_pad_layout(
        pads[incomingSource],
        1.0,
        outputWidth - offset,
        0,
        outputWidth,
        outputHeight,
        1);
      break;
    }

    case MIXER_TRANSITION_SLIDE_RIGHT: {
      int offset = static_cast<int>(std::round(outputWidth * clampedProgress));
      apply_source_pad_layout(
        pads[outgoingSource],
        1.0,
        offset,
        0,
        outputWidth,
        outputHeight,
        0);
      apply_source_pad_layout(
        pads[incomingSource],
        1.0,
        -outputWidth + offset,
        0,
        outputWidth,
        outputHeight,
        1);
      break;
    }

    case MIXER_TRANSITION_CUT:
    default: {
      apply_source_pad_layout(
        pads[incomingSource],
        1.0,
        0,
        0,
        outputWidth,
        outputHeight,
        1);
      break;
    }
  }
}

void apply_program_transition_frame_to_ab_pads(
  GstPad* outgoingPad,
  GstPad* incomingPad,
  int outputWidth,
  int outputHeight,
  MixerTransitionType transitionType,
  double progress)
{
  double clampedProgress = std::max(0.0, std::min(1.0, progress));

  apply_source_pad_layout(
    outgoingPad,
    0.0,
    0,
    0,
    outputWidth,
    outputHeight,
    0);
  apply_source_pad_layout(
    incomingPad,
    0.0,
    0,
    0,
    outputWidth,
    outputHeight,
    1);

  switch (transitionType) {
    case MIXER_TRANSITION_MIX:
      apply_source_pad_layout(outgoingPad, 1.0 - clampedProgress, 0, 0,
        outputWidth, outputHeight, 0);
      apply_source_pad_layout(incomingPad, clampedProgress, 0, 0,
        outputWidth, outputHeight, 1);
      break;

    case MIXER_TRANSITION_DIP_TO_BLACK: {
      const double outgoingAlpha = clampedProgress < 0.5
        ? 1.0 - (clampedProgress * 2.0)
        : 0.0;
      const double incomingAlpha = clampedProgress < 0.5
        ? 0.0
        : (clampedProgress - 0.5) * 2.0;
      apply_source_pad_layout(outgoingPad, outgoingAlpha, 0, 0,
        outputWidth, outputHeight, 0);
      apply_source_pad_layout(incomingPad, incomingAlpha, 0, 0,
        outputWidth, outputHeight, 1);
      break;
    }

    case MIXER_TRANSITION_SLIDE_LEFT: {
      const int offset = static_cast<int>(std::round(outputWidth * clampedProgress));
      apply_source_pad_layout(outgoingPad, 1.0, -offset, 0,
        outputWidth, outputHeight, 0);
      apply_source_pad_layout(incomingPad, 1.0, outputWidth - offset, 0,
        outputWidth, outputHeight, 1);
      break;
    }

    case MIXER_TRANSITION_SLIDE_RIGHT: {
      const int offset = static_cast<int>(std::round(outputWidth * clampedProgress));
      apply_source_pad_layout(outgoingPad, 1.0, offset, 0,
        outputWidth, outputHeight, 0);
      apply_source_pad_layout(incomingPad, 1.0, -outputWidth + offset, 0,
        outputWidth, outputHeight, 1);
      break;
    }

    case MIXER_TRANSITION_CUT:
    default:
      apply_source_pad_layout(incomingPad, 1.0, 0, 0,
        outputWidth, outputHeight, 1);
      break;
  }
}
