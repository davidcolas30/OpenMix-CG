#include "mixer_route_controls.h"

#include "gst_utils.h"
#include "mixer_source_routing.h"

#include <vector>

namespace {

MixerRouteControlsContext g_context;

int read_int(const int* value, int fallback = 0)
{
  return value ? *value : fallback;
}

bool read_bool(const bool* value, bool fallback = false)
{
  return value ? *value : fallback;
}

GstElement* read_element(GstElement** element)
{
  return element ? *element : nullptr;
}

GstPad* read_pad(GstPad** pad)
{
  return pad ? *pad : nullptr;
}

bool route_controls_uses_selector_monitor_inputs()
{
  return g_context.usesSelectorMonitorInputs
    ? g_context.usesSelectorMonitorInputs()
    : false;
}

bool route_controls_is_ab_compositor_monitor_renderer()
{
  return g_context.isAbCompositorMonitorRenderer
    ? g_context.isAbCompositorMonitorRenderer()
    : false;
}

MixerSourceRoutingContext make_source_routing_context()
{
  MixerSourceRoutingContext context;
  context.sourceCount = g_context.sourceCount;
  context.firstWebrtcSourceIndex = g_context.firstWebrtcSourceIndex;
  context.programSource = read_int(g_context.programSource);
  context.previewSource = read_int(g_context.previewSource);
  context.monitorWidth = read_int(g_context.monitorWidth);
  context.monitorHeight = read_int(g_context.monitorHeight);
  context.internalWidth = g_context.internalWidth;
  context.internalHeight = g_context.internalHeight;
  context.localVideoPrewarmEnabled = read_bool(g_context.localVideoPrewarmEnabled);
  context.selectorMonitorInputs = route_controls_uses_selector_monitor_inputs();
  context.abCompositorMonitorRenderer = route_controls_is_ab_compositor_monitor_renderer();
  context.monitorInputMode = g_context.monitorInputMode
    ? *g_context.monitorInputMode
    : MONITOR_INPUTS_BOTH;

  context.localVideoSourcePresent.resize(g_context.sourceCount, false);
  for (int i = 0; i < g_context.sourceCount; i++) {
    context.localVideoSourcePresent[i] =
      g_context.localVideoSources && g_context.localVideoSources[i] != nullptr;
  }

  context.recordingKeepWarmSources = g_context.recordingKeepWarmSources;
  context.pgmSelectorSourceValves = g_context.pgmSelectorSourceValves;
  context.pvwSelectorSourceValves = g_context.pvwSelectorSourceValves;
  context.pgmMonitorSourceValves = g_context.pgmMonitorSourceValves;
  context.pvwMonitorSourceValves = g_context.pvwMonitorSourceValves;
  context.pgmRecordingSourceValves = g_context.pgmRecordingSourceValves;
  context.pgmAbTransitionSourceValves = g_context.pgmAbTransitionSourceValves;

  context.pgmMonitorSelector = read_element(g_context.pgmMonitorSelector);
  context.pvwMonitorSelector = read_element(g_context.pvwMonitorSelector);
  context.pgmAbTransitionSelector = read_element(g_context.pgmAbTransitionSelector);
  context.pgmAbPrimaryCompositorValve =
    read_element(g_context.pgmAbPrimaryCompositorValve);
  context.pgmAbSecondaryCompositorValve =
    read_element(g_context.pgmAbSecondaryCompositorValve);
  context.pvwAbPrimaryCompositorValve =
    read_element(g_context.pvwAbPrimaryCompositorValve);

  context.pgmMonitorSelectorPads = g_context.pgmMonitorSelectorPads;
  context.pvwMonitorSelectorPads = g_context.pvwMonitorSelectorPads;
  context.pgmAbTransitionSelectorPads = g_context.pgmAbTransitionSelectorPads;
  context.pgmRecordingPads = g_context.pgmRecordingPads;
  context.recordingBranchRouter = g_context.recordingBranchRouter;
  return context;
}

} // namespace

void set_mixer_route_controls_context(const MixerRouteControlsContext& context)
{
  g_context = context;
}

void mixer_route_control_set_webrtc_slot_to_fallback(int sourceIndex)
{
  if (sourceIndex < g_context.firstWebrtcSourceIndex ||
      sourceIndex >= g_context.sourceCount) {
    return;
  }

  /*
   * Al liberar una fuente no dejamos el input-selector sin pad activo: una
   * entrada negra live sustituye al ultimo frame real y evita que Program,
   * Preview o multiview conserven un buffer obsoleto.
   */
  set_selector_active_pad(
    g_context.webrtcSelectors[sourceIndex],
    g_context.webrtcSelectorFallbackPads[sourceIndex]);
  set_selector_active_pad(
    g_context.webrtcRecordingSelectors[sourceIndex],
    g_context.webrtcRecordingSelectorFallbackPads[sourceIndex]);
}

bool mixer_route_control_is_local_video_source(int sourceIndex)
{
  return mixer_route_has_local_video_source(make_source_routing_context(), sourceIndex);
}

bool mixer_route_control_source_matches_recording_keepwarm_selection(
  int sourceIndex,
  int firstSource,
  int secondSource)
{
  return mixer_route_source_matches_recording_keepwarm_selection(
    make_source_routing_context(),
    sourceIndex,
    firstSource,
    secondSource);
}

void mixer_route_control_set_program_selector_valves_for_source(int sourceIndex)
{
  set_mixer_program_selector_valves_for_source(make_source_routing_context(), sourceIndex);
}

void mixer_route_control_set_preview_selector_valves_for_source(int sourceIndex)
{
  set_mixer_preview_selector_valves_for_source(make_source_routing_context(), sourceIndex);
}

void mixer_route_control_set_program_ab_transition_selector_for_source(int sourceIndex)
{
  set_mixer_program_ab_transition_selector_for_source(
    make_source_routing_context(),
    sourceIndex);
}

void mixer_route_control_close_program_ab_transition_selector()
{
  close_mixer_program_ab_transition_selector(make_source_routing_context());
}

void mixer_route_control_set_program_monitor_valves_for_sources(
  int firstSource,
  int secondSource)
{
  set_mixer_program_monitor_valves_for_sources(
    make_source_routing_context(),
    firstSource,
    secondSource);
}

void mixer_route_control_set_preview_monitor_valves_for_source(int sourceIndex)
{
  set_mixer_preview_monitor_valves_for_source(make_source_routing_context(), sourceIndex);
}

void mixer_route_control_set_recording_source_valves_for_sources(
  bool enabled,
  int firstSource,
  int secondSource)
{
  set_mixer_recording_source_valves_for_sources(
    make_source_routing_context(),
    enabled,
    firstSource,
    secondSource);
}

void mixer_route_control_apply_recording_steady_program_layout_locked()
{
  apply_mixer_recording_steady_program_layout(make_source_routing_context());
}

void mixer_route_control_apply_program_transition_frame(
  MixerTransitionType transitionType,
  int outgoingSource,
  int incomingSource,
  double progress)
{
  // En transición PGM necesita dos entradas vivas. Si REC está activo,
  // la rama 1080p replica esa misma selección para grabar la mezcla real
  // sin procesar fuentes invisibles.
  mixer_route_control_set_program_monitor_valves_for_sources(outgoingSource, incomingSource);
  if (route_controls_is_ab_compositor_monitor_renderer()) {
    mixer_route_control_set_program_selector_valves_for_source(outgoingSource);
    mixer_route_control_set_program_ab_transition_selector_for_source(incomingSource);
  }
  if (read_bool(g_context.programRecordingEnabled)) {
    mixer_route_control_set_recording_source_valves_for_sources(
      true,
      outgoingSource,
      incomingSource);
  }

  const int monitorWidth = read_int(g_context.monitorWidth);
  const int monitorHeight = read_int(g_context.monitorHeight);

  if (route_controls_is_ab_compositor_monitor_renderer()) {
    apply_program_transition_frame_to_ab_pads(
      read_pad(g_context.pgmAbPrimaryPad),
      read_pad(g_context.pgmAbSecondaryPad),
      monitorWidth,
      monitorHeight,
      transitionType,
      progress);
  } else {
    apply_program_transition_frame_to_pads(
      g_context.pgmPads,
      g_context.sourceCount,
      monitorWidth,
      monitorHeight,
      transitionType,
      outgoingSource,
      incomingSource,
      progress);
  }

  apply_program_transition_frame_to_pads(
    g_context.pgmRecordingPads,
    g_context.sourceCount,
    g_context.internalWidth,
    g_context.internalHeight,
    transitionType,
    outgoingSource,
    incomingSource,
    progress);
}

void mixer_route_control_update_compositor_alphas()
{
  // alpha=0 oculta la imagen, pero no detiene el trabajo upstream.
  // Estas valves sí cortan escalado/conversión antes del compositor.
  const int programSource = read_int(g_context.programSource);
  const int previewSource = read_int(g_context.previewSource);
  const int monitorWidth = read_int(g_context.monitorWidth);
  const int monitorHeight = read_int(g_context.monitorHeight);

  mixer_route_control_set_program_monitor_valves_for_sources(programSource);
  mixer_route_control_set_preview_monitor_valves_for_source(previewSource);
  mixer_route_control_set_program_selector_valves_for_source(programSource);
  mixer_route_control_set_preview_selector_valves_for_source(previewSource);

  const bool routeLocalProgramOnAbSecondary =
    route_controls_is_ab_compositor_monitor_renderer() &&
    mixer_route_control_is_local_video_source(programSource);
  if (routeLocalProgramOnAbSecondary) {
    /*
     * En modo A/B los videos locales usan la rama secundaria tambien en
     * estado estable. Asi pausa, CUT y reproduccion vuelven por el mismo
     * selector, evitando que una rama conserve el frame congelado mientras
     * otra intenta arrancar sin buffer reciente.
     */
    mixer_route_control_set_program_ab_transition_selector_for_source(programSource);
  } else {
    mixer_route_control_close_program_ab_transition_selector();
  }
  if (read_bool(g_context.programRecordingEnabled)) {
    mixer_route_control_set_recording_source_valves_for_sources(true, programSource);
  }

  for (int i = 0; i < g_context.sourceCount; i++) {
    // PGM monitor: trabaja directamente al raster configurado (540p/720p).
    // Esto evita componer 1080p solo para acabar reduciendo a la UI.
    const double pgmAlpha = (i == programSource) ? 1.0 : 0.0;
    apply_source_pad_layout(
      g_context.pgmPads[i],
      pgmAlpha,
      0,
      0,
      monitorWidth,
      monitorHeight,
      0);

    // PGM grabación: ruta separada a 1080p. Sus valves de entrada se
    // mantienen cerradas mientras REC está apagado, así que esta geometría
    // solo cuesta de verdad cuando la salida final necesita Full HD.
    apply_source_pad_layout(
      g_context.pgmRecordingPads[i],
      pgmAlpha,
      0,
      0,
      g_context.internalWidth,
      g_context.internalHeight,
      0);

    // PVW es una salida de monitorizacion, no una ruta final. Mantener
    // sus pads al raster de monitor evita componer Preview completo a
    // 1080p cuando solo se muestra a 540p/720p en la UI.
    const double pvwAlpha = (i == previewSource) ? 1.0 : 0.0;
    apply_source_pad_layout(
      g_context.pvwPads[i],
      pvwAlpha,
      0,
      0,
      monitorWidth,
      monitorHeight,
      0);
  }

  if (route_controls_is_ab_compositor_monitor_renderer()) {
    // Modo A/B: los pads por fuente del compositor de monitor se han soltado
    // y la imagen llega por selectores. Esto reduce el numero de entradas live
    // que GstAggregator debe calendarizar sin tocar la ruta 1080p de REC.
    apply_source_pad_layout(
      read_pad(g_context.pgmAbPrimaryPad),
      routeLocalProgramOnAbSecondary ? 0.0 : 1.0,
      0,
      0,
      monitorWidth,
      monitorHeight,
      0);
    apply_source_pad_layout(
      read_pad(g_context.pgmAbSecondaryPad),
      routeLocalProgramOnAbSecondary ? 1.0 : 0.0,
      0,
      0,
      monitorWidth,
      monitorHeight,
      1);
    apply_source_pad_layout(
      read_pad(g_context.pvwAbPrimaryPad),
      1.0,
      0,
      0,
      monitorWidth,
      monitorHeight,
      0);
  }
}

void mixer_route_control_set_monitor_compositors_sleeping(bool shouldSleepPrimaryMonitors)
{
  // Solo para diagnostico/optimizacion: si una salida no se muestra, su
  // compositor force-live no debe producir negro a 30fps "para nadie".
  set_compositor_sleeping(
    read_element(g_context.pgmCompositor),
    shouldSleepPrimaryMonitors);
  set_compositor_sleeping(
    read_element(g_context.pvwCompositor),
    shouldSleepPrimaryMonitors);
  set_compositor_sleeping(
    read_element(g_context.combinedMonitorCompositor),
    shouldSleepPrimaryMonitors || !read_bool(g_context.combinedMonitorEnabled));
  set_compositor_sleeping(
    read_element(g_context.multiviewCompositor),
    shouldSleepPrimaryMonitors || !read_bool(g_context.multiviewEnabled));
}
