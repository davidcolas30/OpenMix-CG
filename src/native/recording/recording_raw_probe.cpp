#include "recording_raw_probe.h"

#include "env_utils.h"

#include <algorithm>
#include <cinttypes>
#include <cstdint>
#include <cstdio>
#include <string>

struct RecordingRawProbeState {
  std::string label;
  int framesLogged = 0;
};

static void destroy_recording_raw_probe_state(gpointer userData)
{
  delete static_cast<RecordingRawProbeState*>(userData);
}

static GstPadProbeReturn recording_raw_pixel_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  auto* state = static_cast<RecordingRawProbeState*>(userData);
  if (!state) {
    return GST_PAD_PROBE_REMOVE;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  GstMapInfo mapInfo = {};
  if (!gst_buffer_map(buffer, &mapInfo, GST_MAP_READ)) {
    return GST_PAD_PROBE_OK;
  }

  /*
   * Diagnostico puntual para REC: muestreamos unos pocos bytes BGRA/RGBA.
   * No se usa para el producto, solo para saber si una rama entra negra al
   * compositor o si el negro aparece despues, en la salida compuesta.
   */
  const gsize pixelCount = mapInfo.size / 4;
  const gsize sampleCount = std::min<gsize>(pixelCount, 256);
  gsize nonBlackSamples = 0;
  uint64_t bSum = 0;
  uint64_t gSum = 0;
  uint64_t rSum = 0;
  uint64_t aSum = 0;
  if (sampleCount > 0) {
    const gsize step = std::max<gsize>(1, pixelCount / sampleCount);
    for (gsize i = 0; i < sampleCount; i++) {
      const gsize offset = std::min((i * step) * 4, mapInfo.size - 4);
      const guint8 b = mapInfo.data[offset + 0];
      const guint8 g = mapInfo.data[offset + 1];
      const guint8 r = mapInfo.data[offset + 2];
      const guint8 a = mapInfo.data[offset + 3];
      bSum += b;
      gSum += g;
      rSum += r;
      aSum += a;
      if (r > 8 || g > 8 || b > 8) {
        nonBlackSamples++;
      }
    }
  }

  printf(
    "[RecordingProbe] %s frame=%d pts=%" GST_TIME_FORMAT
    " dur=%" GST_TIME_FORMAT " size=%" G_GSIZE_FORMAT
    " nonblack=%" G_GSIZE_FORMAT "/%" G_GSIZE_FORMAT
    " avgBGRA=%" PRIu64 ",%" PRIu64 ",%" PRIu64 ",%" PRIu64 "\n",
    state->label.c_str(),
    state->framesLogged,
    GST_TIME_ARGS(GST_BUFFER_PTS(buffer)),
    GST_TIME_ARGS(GST_BUFFER_DURATION(buffer)),
    mapInfo.size,
    nonBlackSamples,
    sampleCount,
    sampleCount ? bSum / sampleCount : 0,
    sampleCount ? gSum / sampleCount : 0,
    sampleCount ? rSum / sampleCount : 0,
    sampleCount ? aSum / sampleCount : 0);

  gst_buffer_unmap(buffer, &mapInfo);
  state->framesLogged++;
  return state->framesLogged >= 5 ? GST_PAD_PROBE_REMOVE : GST_PAD_PROBE_OK;
}

void attach_recording_raw_probe_if_requested(
  GstPad* pad,
  const char* label)
{
  if (!pad || !label ||
      !parse_env_bool_with_default("OPENMIX_RECORDING_SOURCE0_PROBE", false, "[RecordingProbe]")) {
    return;
  }

  auto* state = new RecordingRawProbeState();
  state->label = label;
  gst_pad_add_probe(
    pad,
    GST_PAD_PROBE_TYPE_BUFFER,
    recording_raw_pixel_probe,
    state,
    destroy_recording_raw_probe_state);
}
