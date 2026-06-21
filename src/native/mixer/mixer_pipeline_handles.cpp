#include "mixer_pipeline_handles.h"

#include "gst_utils.h"

#include <cstdio>

static GstElement* get_pipeline_element(GstElement* pipeline, const char* name)
{
  return gst_bin_get_by_name(GST_BIN(pipeline), name);
}

static void configure_monitor_webrtcbin(GstElement* webrtcbin)
{
  if (!webrtcbin) {
    return;
  }

  gst_util_set_object_arg(G_OBJECT(webrtcbin), "bundle-policy", "max-bundle");
  g_object_set(webrtcbin, "stun-server", "stun://stun.l.google.com:19302", NULL);
}

static void release_element_array(
  std::array<GstElement*, kMixerPipelineHandleMaxSources>& elements)
{
  for (GstElement*& element : elements) {
    clear_gst_element(element);
  }
}

static void release_pad_array(
  std::array<GstPad*, kMixerPipelineHandleMaxSources>& pads)
{
  for (GstPad*& pad : pads) {
    clear_gst_pad(pad);
  }
}

static bool has_required_key_elements(
  const MixerPipelineHandles& handles,
  bool requireMultiviewOverlay)
{
  return handles.pgmCompositor &&
    handles.pgmRecordingCompositor &&
    handles.pvwCompositor &&
    handles.multiviewCompositor &&
    handles.pgmAppsink &&
    handles.pgmRecordingAppsink &&
    handles.pgmRecordingValve &&
    handles.pgmRecordingTee &&
    handles.pvwAppsink &&
    handles.pgmMonitorSelector &&
    handles.pvwMonitorSelector &&
    handles.pgmSelectorAppsink &&
    handles.pvwSelectorAppsink &&
    handles.pgmSelectorNativeMonitorValve &&
    handles.pgmSelectorNativeMonitorSink &&
    handles.pvwSelectorNativeMonitorValve &&
    handles.pvwSelectorNativeMonitorSink &&
    handles.pgmAbTransitionSelector &&
    handles.pgmAbPrimaryCompositorValve &&
    handles.pgmAbSecondaryCompositorValve &&
    handles.pvwAbPrimaryCompositorValve &&
    handles.pgmMonitorWebrtc &&
    handles.pgmMonitorWebrtcValve &&
    handles.pgmMonitorH264Pay &&
    handles.pvwMonitorWebrtc &&
    handles.pvwMonitorWebrtcValve &&
    handles.pvwMonitorH264Pay &&
    handles.pgmNativeMonitorValve &&
    handles.pgmNativeMonitorSink &&
    handles.pvwNativeMonitorValve &&
    handles.pvwNativeMonitorSink &&
    (!requireMultiviewOverlay || handles.multiviewOverlay) &&
    handles.multiviewNativeMonitorValve &&
    handles.multiviewNativeMonitorSink &&
    handles.audioReferenceNativeMonitorValve &&
    handles.audioReferenceNativeMonitorSink &&
    handles.audioReferenceFrameValve &&
    handles.audioReferenceAppsink &&
    handles.combinedMonitorCompositor &&
    handles.combinedMonitorWebrtc &&
    handles.combinedMonitorWebrtcValve &&
    handles.combinedMonitorPvwInputValve &&
    handles.combinedMonitorPgmInputValve &&
    handles.combinedMonitorH264Pay &&
    handles.multiviewMonitorWebrtc &&
    handles.multiviewMonitorWebrtcValve &&
    handles.multiviewMonitorH264Pay &&
    handles.graphicsPgmAppsrc &&
    handles.graphicsPvwAppsrc;
}

static bool has_required_source_valves(
  const MixerPipelineHandles& handles,
  int sourceCount)
{
  for (int i = 0; i < sourceCount; i++) {
    if (!handles.pgmMonitorSourceValves[i] ||
        !handles.pvwMonitorSourceValves[i] ||
        !handles.multiviewSourceValves[i] ||
        !handles.pgmSelectorSourceValves[i] ||
        !handles.pvwSelectorSourceValves[i] ||
        !handles.pgmAbTransitionSourceValves[i] ||
        !handles.pgmRecordingSourceValves[i]) {
      return false;
    }
  }
  return true;
}

static bool has_required_webrtc_selectors(
  const MixerPipelineHandles& handles,
  int firstWebrtcSourceIndex,
  int sourceCount)
{
  for (int i = firstWebrtcSourceIndex; i < sourceCount; i++) {
    if (!handles.webrtcSelectors[i] ||
        !handles.webrtcRecordingSelectors[i] ||
        !handles.webrtcSelectorFallbackPads[i] ||
        !handles.webrtcRecordingSelectorFallbackPads[i]) {
      return false;
    }
  }
  return true;
}

static bool validate_pipeline_handle_config(
  const MixerPipelineHandleConfig& config,
  std::string& errorMessage)
{
  if (config.sourceCount < 1 ||
      config.sourceCount > kMixerPipelineHandleMaxSources ||
      config.firstWebrtcSourceIndex < 0 ||
      config.firstWebrtcSourceIndex > config.sourceCount) {
    errorMessage = "Configuracion de fuentes del mixer no soportada";
    return false;
  }
  return true;
}

bool resolve_mixer_pipeline_handles(
  GstElement* pipeline,
  const MixerPipelineHandleConfig& config,
  MixerPipelineHandles& handles,
  std::string& errorMessage)
{
  handles = MixerPipelineHandles{};

  if (!pipeline) {
    errorMessage = "Pipeline del mixer no disponible";
    return false;
  }

  if (!validate_pipeline_handle_config(config, errorMessage)) {
    return false;
  }

  handles.pgmCompositor = get_pipeline_element(pipeline, "comp_pgm");
  handles.pgmRecordingCompositor = get_pipeline_element(pipeline, "comp_pgm_record");
  handles.pvwCompositor = get_pipeline_element(pipeline, "comp_pvw");
  handles.multiviewCompositor = get_pipeline_element(pipeline, "comp_multiview");
  handles.pgmAppsink = get_pipeline_element(pipeline, "pgm_sink");
  handles.pgmRecordingAppsink = get_pipeline_element(pipeline, "pgm_record_sink");
  handles.pgmRecordingValve = get_pipeline_element(pipeline, "pgm_record_valve");
  handles.pgmRecordingTee = get_pipeline_element(pipeline, "pgm_record_tee");
  handles.pvwAppsink = get_pipeline_element(pipeline, "pvw_sink");
  handles.pgmMonitorSelector = get_pipeline_element(pipeline, "pgm_monitor_selector");
  handles.pvwMonitorSelector = get_pipeline_element(pipeline, "pvw_monitor_selector");
  handles.pgmSelectorAppsink = get_pipeline_element(pipeline, "pgm_selector_sink");
  handles.pvwSelectorAppsink = get_pipeline_element(pipeline, "pvw_selector_sink");
  handles.pgmSelectorNativeMonitorValve =
    get_pipeline_element(pipeline, "pgm_selector_native_monitor_valve");
  handles.pgmSelectorNativeMonitorSink =
    get_pipeline_element(pipeline, "pgm_selector_native_monitor_sink");
  handles.pvwSelectorNativeMonitorValve =
    get_pipeline_element(pipeline, "pvw_selector_native_monitor_valve");
  handles.pvwSelectorNativeMonitorSink =
    get_pipeline_element(pipeline, "pvw_selector_native_monitor_sink");
  handles.pgmAbTransitionSelector =
    get_pipeline_element(pipeline, "pgm_ab_transition_selector");
  handles.pgmAbPrimaryCompositorValve =
    get_pipeline_element(pipeline, "pgm_ab_primary_compositor_valve");
  handles.pgmAbSecondaryCompositorValve =
    get_pipeline_element(pipeline, "pgm_ab_secondary_compositor_valve");
  handles.pvwAbPrimaryCompositorValve =
    get_pipeline_element(pipeline, "pvw_ab_primary_compositor_valve");

  handles.pgmMonitorWebrtc = get_pipeline_element(pipeline, "pgm_monitor_webrtc");
  handles.pgmMonitorWebrtcValve = get_pipeline_element(pipeline, "pgm_monitor_webrtc_valve");
  handles.pgmMonitorH264Pay = get_pipeline_element(pipeline, "pgm_monitor_h264pay");
  handles.pvwMonitorWebrtc = get_pipeline_element(pipeline, "pvw_monitor_webrtc");
  handles.pvwMonitorWebrtcValve = get_pipeline_element(pipeline, "pvw_monitor_webrtc_valve");
  handles.pvwMonitorH264Pay = get_pipeline_element(pipeline, "pvw_monitor_h264pay");
  handles.pgmNativeMonitorValve = get_pipeline_element(pipeline, "pgm_native_monitor_valve");
  handles.pgmNativeMonitorSink = get_pipeline_element(pipeline, "pgm_native_monitor_sink");
  handles.pvwNativeMonitorValve = get_pipeline_element(pipeline, "pvw_native_monitor_valve");
  handles.pvwNativeMonitorSink = get_pipeline_element(pipeline, "pvw_native_monitor_sink");
  handles.multiviewOverlay = get_pipeline_element(pipeline, "multiview_overlay");
  handles.multiviewNativeMonitorValve =
    get_pipeline_element(pipeline, "multiview_native_monitor_valve");
  handles.multiviewNativeMonitorSink =
    get_pipeline_element(pipeline, "multiview_native_monitor_sink");
  handles.audioReferenceNativeMonitorValve =
    get_pipeline_element(pipeline, "audio_reference_native_monitor_valve");
  handles.audioReferenceNativeMonitorSink =
    get_pipeline_element(pipeline, "audio_reference_native_monitor_sink");
  handles.audioReferenceFrameValve =
    get_pipeline_element(pipeline, "audio_reference_frame_valve");
  handles.audioReferenceAppsink = get_pipeline_element(pipeline, "audio_reference_sink");

  handles.combinedMonitorCompositor = get_pipeline_element(pipeline, "comp_combined_monitor");
  handles.combinedMonitorWebrtc = get_pipeline_element(pipeline, "combined_monitor_webrtc");
  handles.combinedMonitorWebrtcValve =
    get_pipeline_element(pipeline, "combined_monitor_webrtc_valve");
  handles.combinedMonitorPvwInputValve =
    get_pipeline_element(pipeline, "combined_monitor_pvw_input_valve");
  handles.combinedMonitorPgmInputValve =
    get_pipeline_element(pipeline, "combined_monitor_pgm_input_valve");
  handles.combinedMonitorH264Pay = get_pipeline_element(pipeline, "combined_monitor_h264pay");
  handles.multiviewMonitorWebrtc = get_pipeline_element(pipeline, "multiview_monitor_webrtc");
  handles.multiviewMonitorWebrtcValve =
    get_pipeline_element(pipeline, "multiview_monitor_webrtc_valve");
  handles.multiviewMonitorH264Pay =
    get_pipeline_element(pipeline, "multiview_monitor_h264pay");
  handles.graphicsPgmAppsrc = get_pipeline_element(pipeline, "graphics_pgm_src");
  handles.graphicsPvwAppsrc = get_pipeline_element(pipeline, "graphics_pvw_src");

  configure_monitor_webrtcbin(handles.pgmMonitorWebrtc);
  configure_monitor_webrtcbin(handles.pvwMonitorWebrtc);
  configure_monitor_webrtcbin(handles.combinedMonitorWebrtc);
  configure_monitor_webrtcbin(handles.multiviewMonitorWebrtc);

  for (int i = 0; i < config.sourceCount; i++) {
    char elementName[48];
    snprintf(elementName, sizeof(elementName), "pgm_monitor_src_valve%d", i);
    handles.pgmMonitorSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "pvw_monitor_src_valve%d", i);
    handles.pvwMonitorSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "pgm_record_src_valve%d", i);
    handles.pgmRecordingSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "multiview_src_valve%d", i);
    handles.multiviewSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "thumb_src_valve%d", i);
    handles.thumbSourceValves[i] = get_pipeline_element(pipeline, elementName);
    set_source_valve_drop(handles.thumbSourceValves[i], !config.thumbnailsEnabled);

    snprintf(elementName, sizeof(elementName), "pgm_selector_src_valve%d", i);
    handles.pgmSelectorSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "pvw_selector_src_valve%d", i);
    handles.pvwSelectorSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "pgm_ab_transition_src_valve%d", i);
    handles.pgmAbTransitionSourceValves[i] = get_pipeline_element(pipeline, elementName);

    snprintf(elementName, sizeof(elementName), "thumb%d", i);
    handles.thumbAppsinks[i] = get_pipeline_element(pipeline, elementName);
  }

  for (int i = config.firstWebrtcSourceIndex; i < config.sourceCount; i++) {
    char selectorName[48];
    snprintf(selectorName, sizeof(selectorName), "webrtc_selector%d", i);
    handles.webrtcSelectors[i] = get_pipeline_element(pipeline, selectorName);
    if (handles.webrtcSelectors[i]) {
      handles.webrtcSelectorFallbackPads[i] =
        find_sink_pad_by_name(handles.webrtcSelectors[i], "sink_0");
      set_selector_active_pad(handles.webrtcSelectors[i], handles.webrtcSelectorFallbackPads[i]);
      printf("[Mixer] selector WebRTC monitor (fuente %d) configurado, direct-monitor=%dx%d I420\n",
        i,
        config.monitorWidth,
        config.monitorHeight);
    }

    snprintf(selectorName, sizeof(selectorName), "webrtc_record_selector%d", i);
    handles.webrtcRecordingSelectors[i] = get_pipeline_element(pipeline, selectorName);
    if (handles.webrtcRecordingSelectors[i]) {
      handles.webrtcRecordingSelectorFallbackPads[i] =
        find_sink_pad_by_name(handles.webrtcRecordingSelectors[i], "sink_0");
      set_selector_active_pad(
        handles.webrtcRecordingSelectors[i],
        handles.webrtcRecordingSelectorFallbackPads[i]);
      printf("[Mixer] selector WebRTC REC (fuente %d) configurado, direct-record=%dx%d I420\n",
        i,
        config.internalWidth,
        config.internalHeight);
    }
  }

  if (!has_required_key_elements(handles, config.requireMultiviewOverlay)) {
    errorMessage = "No se encontraron elementos clave en el pipeline";
    release_mixer_pipeline_handles(handles);
    return false;
  }

  if (!has_required_source_valves(handles, config.sourceCount)) {
    errorMessage = "No se encontraron las valves de entrada del mixer";
    release_mixer_pipeline_handles(handles);
    return false;
  }

  if (!has_required_webrtc_selectors(
        handles,
        config.firstWebrtcSourceIndex,
        config.sourceCount)) {
    errorMessage = "No se encontraron los selectores WebRTC del mixer o sus entradas de reposo";
    release_mixer_pipeline_handles(handles);
    return false;
  }

  return true;
}

void release_mixer_pipeline_handles(MixerPipelineHandles& handles)
{
  clear_gst_element(handles.pgmCompositor);
  clear_gst_element(handles.pgmRecordingCompositor);
  clear_gst_element(handles.pvwCompositor);
  clear_gst_element(handles.multiviewCompositor);
  clear_gst_element(handles.pgmAppsink);
  clear_gst_element(handles.pvwAppsink);
  clear_gst_element(handles.pgmRecordingAppsink);
  clear_gst_element(handles.pgmRecordingValve);
  clear_gst_element(handles.pgmRecordingTee);
  release_element_array(handles.pgmMonitorSourceValves);
  release_element_array(handles.pvwMonitorSourceValves);
  release_element_array(handles.pgmRecordingSourceValves);
  release_element_array(handles.multiviewSourceValves);
  release_element_array(handles.thumbSourceValves);
  release_element_array(handles.pgmSelectorSourceValves);
  release_element_array(handles.pvwSelectorSourceValves);
  release_element_array(handles.pgmAbTransitionSourceValves);
  release_element_array(handles.thumbAppsinks);
  clear_gst_element(handles.graphicsPgmAppsrc);
  clear_gst_element(handles.graphicsPvwAppsrc);
  release_pad_array(handles.webrtcSelectorFallbackPads);
  release_pad_array(handles.webrtcRecordingSelectorFallbackPads);
  release_element_array(handles.webrtcSelectors);
  release_element_array(handles.webrtcRecordingSelectors);
  clear_gst_element(handles.pgmMonitorSelector);
  clear_gst_element(handles.pvwMonitorSelector);
  clear_gst_element(handles.pgmSelectorAppsink);
  clear_gst_element(handles.pvwSelectorAppsink);
  clear_gst_element(handles.pgmSelectorNativeMonitorValve);
  clear_gst_element(handles.pgmSelectorNativeMonitorSink);
  clear_gst_element(handles.pvwSelectorNativeMonitorValve);
  clear_gst_element(handles.pvwSelectorNativeMonitorSink);
  clear_gst_element(handles.pgmAbTransitionSelector);
  clear_gst_element(handles.pgmAbPrimaryCompositorValve);
  clear_gst_element(handles.pgmAbSecondaryCompositorValve);
  clear_gst_element(handles.pvwAbPrimaryCompositorValve);
  clear_gst_element(handles.pgmMonitorWebrtc);
  clear_gst_element(handles.pgmMonitorWebrtcValve);
  clear_gst_element(handles.pgmMonitorH264Pay);
  clear_gst_element(handles.pvwMonitorWebrtc);
  clear_gst_element(handles.pvwMonitorWebrtcValve);
  clear_gst_element(handles.pvwMonitorH264Pay);
  clear_gst_element(handles.pgmNativeMonitorValve);
  clear_gst_element(handles.pgmNativeMonitorSink);
  clear_gst_element(handles.pvwNativeMonitorValve);
  clear_gst_element(handles.pvwNativeMonitorSink);
  clear_gst_element(handles.multiviewNativeMonitorValve);
  clear_gst_element(handles.multiviewNativeMonitorSink);
  clear_gst_element(handles.multiviewOverlay);
  clear_gst_element(handles.audioReferenceNativeMonitorValve);
  clear_gst_element(handles.audioReferenceNativeMonitorSink);
  clear_gst_element(handles.audioReferenceFrameValve);
  clear_gst_element(handles.audioReferenceAppsink);
  clear_gst_element(handles.combinedMonitorCompositor);
  clear_gst_element(handles.combinedMonitorWebrtc);
  clear_gst_element(handles.combinedMonitorWebrtcValve);
  clear_gst_element(handles.combinedMonitorPvwInputValve);
  clear_gst_element(handles.combinedMonitorPgmInputValve);
  clear_gst_element(handles.combinedMonitorH264Pay);
  clear_gst_element(handles.multiviewMonitorWebrtc);
  clear_gst_element(handles.multiviewMonitorWebrtcValve);
  clear_gst_element(handles.multiviewMonitorH264Pay);
}
