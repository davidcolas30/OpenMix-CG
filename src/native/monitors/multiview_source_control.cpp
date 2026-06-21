#include "multiview_source_control.h"

#include "gst_utils.h"

static bool should_keep_multiview_source_open(
  const MultiviewSourceControlContext& context,
  int sourceIndex)
{
  if (!context.enabled) {
    return false;
  }

  /*
   * La fuente 0 son barras SMPTE. En Preview/Program siguen existiendo como
   * rama live, pero la multiview puede sustituirlas por un dibujo estatico en
   * cairooverlay. Asi evitamos escalar/convertir una señal sintetica 1080p
   * solo como placeholder visual.
   */
  if (sourceIndex == 0) {
    return context.barsMode == MULTIVIEW_BARS_LIVE;
  }

  if (!context.activeSlotsEnabled) {
    return true;
  }

  /*
   * Las fuentes móviles/locales solo abren su rama cuando ya hay media real:
   * así evitamos escalar y convertir slots vacíos en cada frame.
   */
  return sourceIndex > 0 &&
    sourceIndex < context.sourceCount &&
    context.sourceActive &&
    context.sourceActive[sourceIndex].load(std::memory_order_relaxed);
}

void refresh_multiview_source_valves(
  const MultiviewSourceControlContext& context)
{
  if (!context.sourceValves) {
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    set_source_valve_drop(
      context.sourceValves[i],
      !should_keep_multiview_source_open(context, i));
  }
}

void set_multiview_source_active(
  const MultiviewSourceControlContext& context,
  int sourceIndex,
  bool active)
{
  if (!context.sourceActive ||
      sourceIndex < 0 ||
      sourceIndex >= context.sourceCount) {
    return;
  }

  context.sourceActive[sourceIndex].store(active, std::memory_order_relaxed);
  refresh_multiview_source_valves(context);
}

void reset_multiview_source_activity(
  const MultiviewSourceControlContext& context)
{
  if (!context.sourceActive) {
    return;
  }

  for (int i = 0; i < context.sourceCount; i++) {
    context.sourceActive[i].store(
      i == 0 && context.barsMode == MULTIVIEW_BARS_LIVE,
      std::memory_order_relaxed);
  }
  refresh_multiview_source_valves(context);
}
