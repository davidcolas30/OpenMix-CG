#include "recording_overlay.h"

#include <gst/gst.h>
#include <memory>
#include <vector>

static GstPadProbeReturn blend_recording_graphics_overlay_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  auto* context = static_cast<RecordingGraphicsOverlayProbeContext*>(userData);
  if (!context ||
      !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }
  if (!context->overlayActive ||
      !context->overlayActive->load(std::memory_order_relaxed)) {
    return GST_PAD_PROBE_OK;
  }

  std::shared_ptr<std::vector<uint8_t>> overlayData;
  int overlayWidth = 0;
  int overlayHeight = 0;
  int alphaMinX = 0;
  int alphaMinY = 0;
  int alphaMaxX = 0;
  int alphaMaxY = 0;

  {
    if (!context->stateMutex || !context->programFrame ||
        !context->programRecordingEnabled || !context->graphicsOverlayBranchesEnabled) {
      return GST_PAD_PROBE_OK;
    }

    std::lock_guard<std::mutex> lock(*context->stateMutex);
    const GraphicsOverlayLatestFrame& frame = *context->programFrame;
    if (!*context->programRecordingEnabled ||
        !*context->graphicsOverlayBranchesEnabled ||
        !frame.enabled ||
        !frame.hasFrame ||
        !frame.hasAlphaBounds ||
        !frame.data ||
        frame.data->empty() ||
        frame.width <= 0 ||
        frame.height <= 0) {
      return GST_PAD_PROBE_OK;
    }

    overlayData = frame.data;
    overlayWidth = frame.width;
    overlayHeight = frame.height;
    alphaMinX = frame.alphaMinX;
    alphaMinY = frame.alphaMinY;
    alphaMaxX = frame.alphaMaxX;
    alphaMaxY = frame.alphaMaxY;
  }

  const size_t overlayExpectedSize =
    static_cast<size_t>(overlayWidth) * static_cast<size_t>(overlayHeight) * 4;
  if (!overlayData || overlayData->size() < overlayExpectedSize) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = gst_pad_probe_info_get_buffer(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  buffer = gst_buffer_make_writable(buffer);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }
  GST_PAD_PROBE_INFO_DATA(info) = buffer;

  GstMapInfo mapInfo = {};
  if (!gst_buffer_map(buffer, &mapInfo, GST_MAP_WRITE)) {
    return GST_PAD_PROBE_OK;
  }

  blend_scaled_bgra_overlay(
    mapInfo.data,
    mapInfo.size,
    context->outputWidth,
    context->outputHeight,
    overlayData->data(),
    overlayData->size(),
    overlayWidth,
    overlayHeight,
    BgraAlphaBounds{alphaMinX, alphaMinY, alphaMaxX, alphaMaxY, true});

  gst_buffer_unmap(buffer, &mapInfo);
  return GST_PAD_PROBE_OK;
}

void add_recording_program_overlay_probe(
  GstElement* tee,
  RecordingGraphicsOverlayProbeContext* context)
{
  if (!tee || !context) {
    return;
  }

  GstPad* pad = gst_element_get_static_pad(tee, "sink");
  if (!pad) {
    return;
  }

  /*
   * La grabacion consume Program compuesto. Aplicar aqui el grafismo evita
   * una segunda entrada live en el compositor REC y mantiene el mismo criterio
   * que OBS/CasparCG: primero se forma la escena/canal, despues lo consumen
   * salidas como REC o streaming.
   */
  gst_pad_add_probe(
    pad,
    GST_PAD_PROBE_TYPE_BUFFER,
    blend_recording_graphics_overlay_probe,
    context,
    nullptr);
  gst_object_unref(pad);
}
