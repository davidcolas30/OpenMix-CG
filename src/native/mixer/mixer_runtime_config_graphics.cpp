#include "mixer_runtime_config_internal.h"

#include "env_utils.h"
#include "mixer_runtime_config.h"
#include "mixer_runtime_config_defaults.h"

#include <glib.h>

#include <cstdio>

namespace {

namespace defaults = openmix::mixer_runtime_config_defaults;

const char* get_graphics_overlay_pump_mode_label(GraphicsOverlayPumpMode mode)
{
  switch (mode) {
    case GRAPHICS_OVERLAY_PUMP_OFF:
      return "off";
    case GRAPHICS_OVERLAY_PUMP_ALWAYS:
      return "always";
    case GRAPHICS_OVERLAY_PUMP_ACTIVE:
    default:
      return "active";
  }
}

} // namespace

namespace openmix::mixer_runtime_config {

void configure_graphics_overlay_raster()
{
  g_graphicsOverlayWidth = parse_env_int_clamped(
    "OPENMIX_GRAPHICS_OVERLAY_WIDTH",
    defaults::kDefaultGraphicsOverlayWidth,
    320,
    defaults::kMixerInternalWidth
  );
  g_graphicsOverlayHeight = parse_env_int_clamped(
    "OPENMIX_GRAPHICS_OVERLAY_HEIGHT",
    defaults::kDefaultGraphicsOverlayHeight,
    180,
    defaults::kMixerInternalHeight
  );

  printf("[Mixer] Raster grafismo nativo: %dx%d BGRA\n",
    g_graphicsOverlayWidth,
    g_graphicsOverlayHeight);
}

void configure_graphics_overlay_pump_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_GRAPHICS_OVERLAY_PUMP");
  if (!rawMode || rawMode[0] == '\0') {
    g_graphicsOverlayPumpMode = is_stutter_isolation_enabled()
      ? GRAPHICS_OVERLAY_PUMP_OFF
      : GRAPHICS_OVERLAY_PUMP_ACTIVE;
  } else if (g_ascii_strcasecmp(rawMode, "active") == 0 ||
      g_ascii_strcasecmp(rawMode, "auto") == 0) {
    g_graphicsOverlayPumpMode = GRAPHICS_OVERLAY_PUMP_ACTIVE;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_graphicsOverlayPumpMode = GRAPHICS_OVERLAY_PUMP_OFF;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "always") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_graphicsOverlayPumpMode = GRAPHICS_OVERLAY_PUMP_ALWAYS;
  } else {
    fprintf(stderr,
      "[Graphics Overlay] OPENMIX_GRAPHICS_OVERLAY_PUMP=%s no reconocido; usando active "
      "(valores validos: active, always, off)\n",
      rawMode);
    g_graphicsOverlayPumpMode = GRAPHICS_OVERLAY_PUMP_ACTIVE;
  }

  printf("[Graphics Overlay] Bomba nativa: %s\n",
    get_graphics_overlay_pump_mode_label(g_graphicsOverlayPumpMode));
}

void configure_graphics_overlay_branches_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_GRAPHICS_BRANCHES");
  if (!rawMode || rawMode[0] == '\0') {
    g_graphicsOverlayBranchesEnabled = !is_stutter_isolation_enabled();
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "true") == 0 ||
      g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_graphicsOverlayBranchesEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_graphicsOverlayBranchesEnabled = false;
  } else {
    fprintf(stderr,
      "[Graphics Overlay] OPENMIX_GRAPHICS_BRANCHES=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_graphicsOverlayBranchesEnabled = true;
  }

  printf("[Graphics Overlay] Ramas hacia compositores: %s\n",
    g_graphicsOverlayBranchesEnabled ? "on" : "off");
}

} // namespace openmix::mixer_runtime_config
