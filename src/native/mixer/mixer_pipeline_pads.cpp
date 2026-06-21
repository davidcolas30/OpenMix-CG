#include "mixer_pipeline_pads.h"

#include "gst_utils.h"

#include <cstdio>

static GstPad* get_static_pad(GstElement* element, const char* padName)
{
  if (!element) {
    return nullptr;
  }
  return gst_element_get_static_pad(element, padName);
}

static bool validate_pipeline_pad_config(
  const MixerPipelinePadConfig& config,
  std::string& errorMessage)
{
  if (config.sourceCount < 1 ||
      config.sourceCount > kMixerPipelinePadMaxSources ||
      config.multiviewColumns < 1 ||
      config.multiviewGutter < 0 ||
      config.multiviewSlotWidth < 1 ||
      config.multiviewSlotHeight < 1 ||
      config.monitorWidth < 1 ||
      config.monitorHeight < 1) {
    errorMessage = "Configuracion de pads del mixer no soportada";
    return false;
  }
  return true;
}

static void configure_combined_monitor_pads(
  MixerPipelinePads& pads,
  const MixerPipelinePadConfig& config)
{
  if (pads.combinedMonitorPvwPad) {
    g_object_set(pads.combinedMonitorPvwPad,
      "alpha", 1.0,
      "xpos", 0,
      "ypos", 0,
      "width", config.monitorWidth,
      "height", config.monitorHeight,
      "zorder", 0u,
      NULL);
  }

  if (pads.combinedMonitorPgmPad) {
    g_object_set(pads.combinedMonitorPgmPad,
      "alpha", 1.0,
      "xpos", config.monitorWidth,
      "ypos", 0,
      "width", config.monitorWidth,
      "height", config.monitorHeight,
      "zorder", 1u,
      NULL);
  }
}

static void configure_multiview_pads(
  MixerPipelinePads& pads,
  const MixerPipelinePadConfig& config)
{
  for (int i = 0; i < config.sourceCount; i++) {
    if (!pads.multiviewPads[i]) {
      continue;
    }

    const int column = i % config.multiviewColumns;
    const int row = i / config.multiviewColumns;
    const int xpos =
      config.multiviewGutter +
      column * (config.multiviewSlotWidth + config.multiviewGutter);
    const int ypos =
      config.multiviewGutter +
      row * (config.multiviewSlotHeight + config.multiviewGutter);

    // La multiview viaja como un unico monitor, pero el layout nativo mantiene
    // gutters internos para distinguir slots sin depender de HTML superpuesto.
    g_object_set(pads.multiviewPads[i],
      "alpha", 1.0,
      "xpos", xpos,
      "ypos", ypos,
      "width", config.multiviewSlotWidth,
      "height", config.multiviewSlotHeight,
      "zorder", static_cast<guint>(i),
      NULL);
  }
}

bool resolve_mixer_pipeline_pads(
  const MixerPipelinePadConfig& config,
  const MixerPipelinePadElements& elements,
  MixerPipelinePads& pads,
  std::string& errorMessage)
{
  pads = MixerPipelinePads{};

  if (!validate_pipeline_pad_config(config, errorMessage)) {
    return false;
  }

  pads.combinedMonitorPgmPad =
    get_static_pad(elements.combinedMonitorCompositor, "sink_0");
  pads.combinedMonitorPvwPad =
    get_static_pad(elements.combinedMonitorCompositor, "sink_1");
  configure_combined_monitor_pads(pads, config);

  for (int i = 0; i < config.sourceCount; i++) {
    char padName[16];
    snprintf(padName, sizeof(padName), "sink_%d", i);

    pads.pgmPads[i] = find_sink_pad_by_name(elements.pgmCompositor, padName);
    pads.pgmRecordingPads[i] =
      find_sink_pad_by_name(elements.pgmRecordingCompositor, padName);
    pads.pvwPads[i] = find_sink_pad_by_name(elements.pvwCompositor, padName);
    pads.multiviewPads[i] = find_sink_pad_by_name(elements.multiviewCompositor, padName);
    pads.pgmMonitorSelectorPads[i] =
      find_sink_pad_by_name(elements.pgmMonitorSelector, padName);
    pads.pvwMonitorSelectorPads[i] =
      find_sink_pad_by_name(elements.pvwMonitorSelector, padName);
    pads.pgmAbTransitionSelectorPads[i] =
      find_sink_pad_by_name(elements.pgmAbTransitionSelector, padName);
  }

  configure_multiview_pads(pads, config);

  pads.graphicsPgmPad = get_static_pad(elements.pgmCompositor, "sink_4");
  pads.graphicsPvwPad = get_static_pad(elements.pvwCompositor, "sink_4");
  pads.pgmAbPrimaryPad = get_static_pad(elements.pgmCompositor, "sink_5");
  pads.pgmAbSecondaryPad = get_static_pad(elements.pgmCompositor, "sink_6");
  pads.pvwAbPrimaryPad = get_static_pad(elements.pvwCompositor, "sink_5");

  return true;
}

void detach_graphics_overlay_compositor_pad(
  GstElement* compositor,
  GstPad** storedPad,
  const char* label)
{
  detach_compositor_request_pad(compositor, storedPad, label);
}

void detach_legacy_monitor_compositor_pads_for_ab_mode(
  bool abCompositorMonitorRenderer,
  int sourceCount,
  GstElement* pgmCompositor,
  GstPad** pgmPads,
  GstElement* pvwCompositor,
  GstPad** pvwPads)
{
  if (!abCompositorMonitorRenderer) {
    return;
  }

  for (int i = 0; i < sourceCount; i++) {
    char label[64];
    snprintf(label, sizeof(label), "PGM legacy source %d", i);
    detach_compositor_request_pad(pgmCompositor, &pgmPads[i], label);

    snprintf(label, sizeof(label), "PVW legacy source %d", i);
    detach_compositor_request_pad(pvwCompositor, &pvwPads[i], label);
  }
}
