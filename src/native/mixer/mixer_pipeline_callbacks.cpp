#include "mixer_pipeline_callbacks.h"

#include "monitor_frame_bridge.h"

#include <gst/app/gstappsink.h>

static GstElement* choose_monitor_sink(
  MonitorRendererMode rendererMode,
  GstElement* compositorSink,
  GstElement* selectorSink)
{
  return rendererMode == MONITOR_RENDERER_SELECTOR
    ? selectorSink
    : compositorSink;
}

static void configure_monitor_appsink_callbacks(
  const MixerPipelineCallbackConfig& config,
  const MixerPipelineCallbackElements& elements)
{
  if (!config.monitorCallbacksEnabled) {
    return;
  }

  GstAppSinkCallbacks pgmCallbacks = {};
  pgmCallbacks.new_sample = on_monitor_frame_bridge_pgm_sample;
  if (GstElement* pgmMonitorSink = choose_monitor_sink(
        config.monitorRendererMode,
        elements.pgmAppsink,
        elements.pgmSelectorAppsink)) {
    gst_app_sink_set_callbacks(
      GST_APP_SINK(pgmMonitorSink),
      &pgmCallbacks,
      nullptr,
      nullptr);
  }

  GstAppSinkCallbacks pvwCallbacks = {};
  pvwCallbacks.new_sample = on_monitor_frame_bridge_pvw_sample;
  if (GstElement* pvwMonitorSink = choose_monitor_sink(
        config.monitorRendererMode,
        elements.pvwAppsink,
        elements.pvwSelectorAppsink)) {
    gst_app_sink_set_callbacks(
      GST_APP_SINK(pvwMonitorSink),
      &pvwCallbacks,
      nullptr,
      nullptr);
  }
}

static void configure_output_appsink_callbacks(
  const MixerPipelineCallbackElements& elements)
{
  if (elements.pgmRecordingAppsink) {
    GstAppSinkCallbacks pgmRecordingCallbacks = {};
    pgmRecordingCallbacks.new_sample = on_monitor_frame_bridge_pgm_recording_sample;
    gst_app_sink_set_callbacks(
      GST_APP_SINK(elements.pgmRecordingAppsink),
      &pgmRecordingCallbacks,
      nullptr,
      nullptr);
  }

  if (elements.audioReferenceAppsink) {
    GstAppSinkCallbacks audioReferenceCallbacks = {};
    audioReferenceCallbacks.new_sample = on_monitor_frame_bridge_audio_reference_sample;
    gst_app_sink_set_callbacks(
      GST_APP_SINK(elements.audioReferenceAppsink),
      &audioReferenceCallbacks,
      nullptr,
      nullptr);
  }
}

static void configure_thumbnail_callbacks(
  const MixerPipelineCallbackConfig& config,
  const MixerPipelineCallbackElements& elements)
{
  if (config.sourceCount < 1 ||
      config.sourceCount > kMixerPipelineCallbackMaxSources) {
    return;
  }

  for (int i = 0; i < config.sourceCount; i++) {
    if (!elements.thumbAppsinks[i]) {
      continue;
    }

    GstAppSinkCallbacks thumbCallbacks = {};
    thumbCallbacks.new_sample = on_monitor_frame_bridge_thumb_sample;
    gst_app_sink_set_callbacks(
      GST_APP_SINK(elements.thumbAppsinks[i]),
      &thumbCallbacks,
      GINT_TO_POINTER(i),
      nullptr);
  }
}

static void configure_multiview_overlay_callback(
  const MixerPipelineCallbackElements& elements)
{
  if (!elements.multiviewOverlay || !elements.multiviewOverlayState) {
    return;
  }

  g_signal_connect(
    elements.multiviewOverlay,
    "draw",
    G_CALLBACK(draw_multiview_overlay),
    elements.multiviewOverlayState);
}

static void configure_bus_sync_handler(GstElement* pipeline)
{
  if (!pipeline) {
    return;
  }

  GstBus* bus = gst_element_get_bus(pipeline);
  if (!bus) {
    return;
  }
  gst_bus_set_sync_handler(bus, on_monitor_frame_bridge_bus_sync_message, nullptr, nullptr);
  gst_object_unref(bus);
}

void configure_mixer_pipeline_callbacks(
  const MixerPipelineCallbackConfig& config,
  const MixerPipelineCallbackElements& elements)
{
  configure_monitor_appsink_callbacks(config, elements);
  configure_output_appsink_callbacks(elements);
  configure_thumbnail_callbacks(config, elements);
  configure_multiview_overlay_callback(elements);
  configure_bus_sync_handler(elements.pipeline);
}
