#include "mixer_runtime_config_internal.h"

#include "env_utils.h"
#include "mixer_runtime_config.h"

#include <glib.h>

#include <cstdio>

namespace {

const char* multiview_bars_mode_label()
{
  switch (g_multiviewBarsMode) {
    case MULTIVIEW_BARS_STATIC:
      return "static";
    case MULTIVIEW_BARS_OFF:
      return "off";
    case MULTIVIEW_BARS_LIVE:
    default:
      return "live";
  }
}

void sync_multiview_overlay_bars_mode()
{
  g_multiviewStaticBarsOverlayEnabled = g_multiviewBarsMode == MULTIVIEW_BARS_STATIC;
}

} // namespace

namespace openmix::mixer_runtime_config {

void configure_multiview_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MULTIVIEW");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "true") == 0 ||
      g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_multiviewEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_multiviewEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MULTIVIEW=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_multiviewEnabled = true;
  }

  printf("[Mixer] Multiview nativa: %s\n", g_multiviewEnabled ? "on" : "off");
}

void configure_multiview_hud_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MULTIVIEW_HUD");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "true") == 0 ||
      g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_multiviewHudEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_multiviewHudEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MULTIVIEW_HUD=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_multiviewHudEnabled = true;
  }

  printf("[Mixer] HUD multiview nativa: %s\n", g_multiviewHudEnabled ? "on" : "off");
}

void configure_multiview_active_slots_mode()
{
  g_multiviewActiveSlotsEnabled = parse_env_bool_with_default(
    "OPENMIX_MULTIVIEW_ACTIVE_SLOTS",
    true,
    "Mixer");

  printf("[Mixer] Slots activos multiview: %s\n",
    g_multiviewActiveSlotsEnabled ? "on" : "off");
}

void configure_multiview_bars_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MULTIVIEW_BARS");
  if (!rawMode || rawMode[0] == '\0') {
    const bool useLiveBars = parse_env_bool_with_default(
      "OPENMIX_MULTIVIEW_LIVE_BARS",
      true,
      "Mixer");
    g_multiviewBarsMode = useLiveBars ? MULTIVIEW_BARS_LIVE : MULTIVIEW_BARS_OFF;
    sync_multiview_overlay_bars_mode();
    printf("[Mixer] Barras multiview: %s\n", multiview_bars_mode_label());
    return;
  }

  if (g_ascii_strcasecmp(rawMode, "live") == 0 ||
      g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "true") == 0 ||
      g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_multiviewBarsMode = MULTIVIEW_BARS_LIVE;
  } else if (g_ascii_strcasecmp(rawMode, "static") == 0 ||
             g_ascii_strcasecmp(rawMode, "still") == 0) {
    g_multiviewBarsMode = MULTIVIEW_BARS_STATIC;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_multiviewBarsMode = MULTIVIEW_BARS_OFF;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MULTIVIEW_BARS=%s no reconocido; usando live "
      "(valores validos: live, static, off)\n",
      rawMode);
    g_multiviewBarsMode = MULTIVIEW_BARS_LIVE;
  }

  sync_multiview_overlay_bars_mode();
  printf("[Mixer] Barras multiview: %s\n", multiview_bars_mode_label());
}

void configure_multiview_bars_cache_mode()
{
  g_multiviewBarsCacheEnabled = parse_env_bool_with_default(
    "OPENMIX_MULTIVIEW_BARS_CACHE",
    false,
    "Mixer");

  printf("[Mixer] Cache barras multiview: %s\n",
    g_multiviewBarsCacheEnabled ? "on" : "off");
}

void configure_multiview_source_fps()
{
  g_multiviewSourceFps = parse_env_int_clamped("OPENMIX_MULTIVIEW_SOURCE_FPS", 15, 0, 30);
  if (g_multiviewSourceFps <= 0) {
    printf("[Mixer] FPS entrada multiview: sin limite previo\n");
  } else {
    printf("[Mixer] FPS entrada multiview: %dfps antes de escalar/componer\n", g_multiviewSourceFps);
  }
}

} // namespace openmix::mixer_runtime_config
