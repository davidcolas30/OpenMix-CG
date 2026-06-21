#include "mixer_selector_links.h"

#include <cstdio>

#include "local_video_source.h"
#include "webrtc_peer.h"

namespace {

GstPad* request_mixer_selector_pad(GstElement* selector, GstPad** storedPad)
{
  if (!selector || !storedPad) {
    return nullptr;
  }

  if (*storedPad) {
    return *storedPad;
  }

  GstPadTemplate* padTemplate =
    gst_element_class_get_pad_template(GST_ELEMENT_GET_CLASS(selector), "sink_%u");
  *storedPad = gst_element_request_pad(selector, padTemplate, nullptr, nullptr);
  return *storedPad;
}

bool link_bin_branch_to_selector(
  GstElement* bin,
  GstElement* lastElement,
  GstElement* selector,
  GstPad** selectorPad,
  const char* ghostPadName,
  const char* label,
  const char* logPrefix,
  const char* ownerLabel,
  int sourceIndex)
{
  if (!bin || !lastElement || !selector || !selectorPad) {
    return false;
  }

  GstPad* internalSrcPad = gst_element_get_static_pad(lastElement, "src");
  GstPad* requestedSelectorPad = request_mixer_selector_pad(selector, selectorPad);
  if (!internalSrcPad || !requestedSelectorPad) {
    if (internalSrcPad) {
      gst_object_unref(internalSrcPad);
    }
    return false;
  }

  /*
   * Las ramas dinamicas viven dentro de un GstBin propio. Para conectarlas con
   * el mixer padre publicamos primero un ghost pad: ese pad es la salida
   * estable del bin hacia el input-selector de Program/Preview o REC.
   */
  GstPad* ghostSrcPad = gst_ghost_pad_new(ghostPadName, internalSrcPad);
  gst_object_unref(internalSrcPad);

  if (!ghostSrcPad) {
    fprintf(stderr,
      "[%s] Error creando ghost pad %s para %s\n",
      logPrefix,
      ghostPadName,
      ownerLabel);
    return false;
  }

  if (!gst_element_add_pad(bin, ghostSrcPad)) {
    fprintf(stderr,
      "[%s] Error publicando ghost pad %s para %s\n",
      logPrefix,
      ghostPadName,
      ownerLabel);
    gst_object_unref(ghostSrcPad);
    return false;
  }

  GstPadLinkReturn ret = gst_pad_link(ghostSrcPad, requestedSelectorPad);
  if (ret != GST_PAD_LINK_OK) {
    fprintf(stderr,
      "[%s] Error enlazando rama %s de %s al selector de fuente %d: %d\n",
      logPrefix,
      label,
      ownerLabel,
      sourceIndex,
      ret);
    gst_element_remove_pad(bin, ghostSrcPad);
    return false;
  }

  g_object_set(selector, "active-pad", requestedSelectorPad, NULL);
  return true;
}

bool link_webrtc_branch_to_selector(
  WebRTCPeer* peer,
  GstElement* lastElement,
  GstElement* selector,
  GstPad** selectorPad,
  const char* ghostPadName,
  const char* label)
{
  if (!peer) {
    return false;
  }

  return link_bin_branch_to_selector(
    peer->pipeline,
    lastElement,
    selector,
    selectorPad,
    ghostPadName,
    label,
    "WebRTC",
    peer->peerId.c_str(),
    peer->mixerSourceIndex);
}

} // namespace

bool link_webrtc_branches_to_mixer_selectors(
  WebRTCPeer* peer,
  GstElement* monitorLastElement,
  GstElement* recordingLastElement)
{
  if (!peer) {
    return false;
  }

  if (!link_webrtc_branch_to_selector(
        peer,
        monitorLastElement,
        peer->mixerSelector,
        &peer->mixerSelectorPad,
        "monitor_video_src",
        "monitor")) {
    return false;
  }

  return link_webrtc_branch_to_selector(
    peer,
    recordingLastElement,
    peer->mixerRecordingSelector,
    &peer->mixerRecordingSelectorPad,
    "recording_video_src",
    "recording");
}

bool link_local_video_branch_to_selector(
  LocalVideoSource* source,
  GstElement* lastElement,
  GstElement* selector,
  GstPad** selectorPad,
  const char* ghostPadName,
  const char* label)
{
  if (!source) {
    return false;
  }

  char ownerLabel[64];
  std::snprintf(ownerLabel, sizeof(ownerLabel), "fuente %d", source->sourceIndex);

  return link_bin_branch_to_selector(
    source->bin,
    lastElement,
    selector,
    selectorPad,
    ghostPadName,
    label,
    "LocalVideo",
    ownerLabel,
    source->sourceIndex);
}
