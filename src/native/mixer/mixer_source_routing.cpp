#include "mixer_source_routing.h"

#include "gst_utils.h"
#include "mixer_transition.h"

static bool mixer_route_source_matches_selection(
  int sourceIndex,
  int firstSource,
  int secondSource)
{
  return sourceIndex == firstSource || sourceIndex == secondSource;
}

static bool should_prewarm_local_video_for_program(
  const MixerSourceRoutingContext& context,
  int sourceIndex,
  int selectedProgramSource)
{
  return context.localVideoPrewarmEnabled &&
    sourceIndex >= context.firstWebrtcSourceIndex &&
    sourceIndex < context.sourceCount &&
    sourceIndex != selectedProgramSource &&
    sourceIndex == context.previewSource &&
    mixer_route_has_local_video_source(context, sourceIndex);
}

bool mixer_route_has_local_video_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex)
{
  return sourceIndex >= context.firstWebrtcSourceIndex &&
    sourceIndex < context.sourceCount &&
    sourceIndex < static_cast<int>(context.localVideoSourcePresent.size()) &&
    context.localVideoSourcePresent[sourceIndex];
}

void set_mixer_program_selector_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex)
{
  if (context.monitorInputMode == MONITOR_INPUTS_NONE ||
      !context.selectorMonitorInputs) {
    // La ruta selector es un renderer alternativo de diagnostico/optimizacion.
    // Si el monitor activo usa compositor, abrir estas valves duplicaria
    // escalado/conversion sin aportar imagen visible al operador.
    for (int i = 0; i < context.sourceCount; i++) {
      set_source_valve_drop(context.pgmSelectorSourceValves[i], true);
    }
    set_source_valve_drop(context.pgmAbPrimaryCompositorValve, true);
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    const bool shouldKeepOpen =
      i == sourceIndex || should_prewarm_local_video_for_program(context, i, sourceIndex);
    set_source_valve_drop(context.pgmSelectorSourceValves[i], !shouldKeepOpen);
  }
  set_selector_active_pad(context.pgmMonitorSelector, context.pgmMonitorSelectorPads[sourceIndex]);
  set_source_valve_drop(
    context.pgmAbPrimaryCompositorValve,
    !context.abCompositorMonitorRenderer);
}

void set_mixer_preview_selector_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex)
{
  if (context.monitorInputMode == MONITOR_INPUTS_NONE ||
      !context.selectorMonitorInputs) {
    // Igual que en Program: el selector solo debe consumir CPU cuando
    // OPENMIX_MONITOR_RENDERER=selector lo convierte en la salida real.
    for (int i = 0; i < context.sourceCount; i++) {
      set_source_valve_drop(context.pvwSelectorSourceValves[i], true);
    }
    set_source_valve_drop(context.pvwAbPrimaryCompositorValve, true);
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    set_source_valve_drop(context.pvwSelectorSourceValves[i], i != sourceIndex);
  }
  set_selector_active_pad(context.pvwMonitorSelector, context.pvwMonitorSelectorPads[sourceIndex]);
  set_source_valve_drop(
    context.pvwAbPrimaryCompositorValve,
    !context.abCompositorMonitorRenderer);
}

void set_mixer_program_ab_transition_selector_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex)
{
  if (!context.abCompositorMonitorRenderer ||
      context.monitorInputMode == MONITOR_INPUTS_NONE ||
      sourceIndex < 0 ||
      sourceIndex >= context.sourceCount) {
    const int prewarmSource = context.previewSource;
    const bool shouldPrewarm =
      context.abCompositorMonitorRenderer &&
      context.monitorInputMode != MONITOR_INPUTS_NONE &&
      should_prewarm_local_video_for_program(
        context,
        prewarmSource,
        context.programSource);

    for (int i = 0; i < context.sourceCount; i++) {
      set_source_valve_drop(
        context.pgmAbTransitionSourceValves[i],
        !(shouldPrewarm && i == prewarmSource));
    }
    if (shouldPrewarm) {
      set_selector_active_pad(
        context.pgmAbTransitionSelector,
        context.pgmAbTransitionSelectorPads[prewarmSource]);
    }
    set_source_valve_drop(context.pgmAbSecondaryCompositorValve, true);
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    set_source_valve_drop(context.pgmAbTransitionSourceValves[i], i != sourceIndex);
  }
  set_selector_active_pad(
    context.pgmAbTransitionSelector,
    context.pgmAbTransitionSelectorPads[sourceIndex]);
  set_source_valve_drop(context.pgmAbSecondaryCompositorValve, false);
}

void close_mixer_program_ab_transition_selector(
  const MixerSourceRoutingContext& context)
{
  set_mixer_program_ab_transition_selector_for_source(context, -1);
}

void set_mixer_program_monitor_valves_for_sources(
  const MixerSourceRoutingContext& context,
  int firstSource,
  int secondSource)
{
  if (context.monitorInputMode == MONITOR_INPUTS_NONE ||
      context.selectorMonitorInputs) {
    for (int i = 0; i < context.sourceCount; i++) {
      set_source_valve_drop(context.pgmMonitorSourceValves[i], true);
    }
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    const bool shouldKeepOpen =
      (i == firstSource) ||
      (i == secondSource) ||
      should_prewarm_local_video_for_program(context, i, firstSource);
    set_source_valve_drop(context.pgmMonitorSourceValves[i], !shouldKeepOpen);
  }
}

void set_mixer_preview_monitor_valves_for_source(
  const MixerSourceRoutingContext& context,
  int sourceIndex)
{
  if (context.monitorInputMode == MONITOR_INPUTS_NONE ||
      context.selectorMonitorInputs) {
    for (int i = 0; i < context.sourceCount; i++) {
      set_source_valve_drop(context.pvwMonitorSourceValves[i], true);
    }
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    set_source_valve_drop(context.pvwMonitorSourceValves[i], i != sourceIndex);
  }
}

bool mixer_route_source_matches_recording_keepwarm_selection(
  const MixerSourceRoutingContext& context,
  int sourceIndex,
  int firstSource,
  int secondSource)
{
  /*
   * REC graba Program, pero una fuente que ya ha estado al aire durante la toma
   * queda caliente hasta parar REC. Asi evitamos cerrar la camara cuando pasa a
   * Preview tras un CUT y tener que despertar de nuevo su rama 1080p al volver a
   * pincharla. No abrimos Preview por adelantado al iniciar REC: eso meteria una
   * segunda rama 1080p justo en el arranque de la grabacion.
   */
  const bool keepWarm =
    context.recordingKeepWarmSources &&
    sourceIndex >= 0 &&
    sourceIndex < context.sourceCount &&
    context.recordingKeepWarmSources[sourceIndex];
  return mixer_route_source_matches_selection(sourceIndex, firstSource, secondSource) ||
    keepWarm;
}

void set_mixer_recording_source_valves_for_sources(
  const MixerSourceRoutingContext& context,
  bool enabled,
  int firstSource,
  int secondSource)
{
  if (context.recordingKeepWarmSources) {
    if (!enabled) {
      for (int i = 0; i < context.sourceCount; i++) {
        context.recordingKeepWarmSources[i] = false;
      }
    } else {
      for (int i = 0; i < context.sourceCount; i++) {
        if (mixer_route_source_matches_selection(i, firstSource, secondSource)) {
          context.recordingKeepWarmSources[i] = true;
        }
      }
    }
  }

  for (int i = 0; i < context.sourceCount; i++) {
    /*
     * REC reconstituye Program en un compositor 1080p que duerme cuando no se
     * esta grabando. No dejamos ni siquiera las barras internas empujando hacia
     * ese compositor dormido: algunas fuentes live pueden quedarse en flushing
     * al encontrar downstream en READY y luego despertar como negro. Al abrir
     * solo la seleccion de Program, el fichero ve la misma fuente logica que el
     * monitor sin pagar composicion 1080p en reposo.
     */
    const bool shouldKeepOpen =
      enabled &&
      mixer_route_source_matches_recording_keepwarm_selection(
        context,
        i,
        firstSource,
        secondSource);
    set_source_valve_drop(context.pgmRecordingSourceValves[i], !shouldKeepOpen);
  }

  if (context.recordingBranchRouter) {
    context.recordingBranchRouter(enabled, firstSource, secondSource);
  }
}

void apply_mixer_recording_steady_program_layout(
  const MixerSourceRoutingContext& context)
{
  for (int i = 0; i < context.sourceCount; i++) {
    const double alpha = (i == context.programSource) ? 1.0 : 0.0;
    apply_source_pad_layout(
      context.pgmRecordingPads[i],
      alpha,
      0,
      0,
      context.internalWidth,
      context.internalHeight,
      0);
  }
}
