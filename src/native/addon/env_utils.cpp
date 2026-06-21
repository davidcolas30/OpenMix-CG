#include "env_utils.h"

#include <glib.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>

int parse_env_int_clamped(
  const char* envName,
  int defaultValue,
  int minValue,
  int maxValue)
{
  const gchar* rawValue = g_getenv(envName);
  if (!rawValue || rawValue[0] == '\0') {
    return defaultValue;
  }

  char* parseEnd = nullptr;
  long parsedValue = std::strtol(rawValue, &parseEnd, 10);
  if (parseEnd == rawValue) {
    fprintf(stderr,
      "[Mixer] %s=%s no es un numero valido; usando %d\n",
      envName,
      rawValue,
      defaultValue);
    return defaultValue;
  }

  return static_cast<int>(std::max(
    static_cast<long>(minValue),
    std::min(static_cast<long>(maxValue), parsedValue)
  ));
}

bool parse_env_bool_with_default(
  const char* envName,
  bool defaultValue,
  const char* logPrefix)
{
  const gchar* rawValue = g_getenv(envName);
  if (!rawValue || rawValue[0] == '\0') {
    return defaultValue;
  }

  if (g_ascii_strcasecmp(rawValue, "on") == 0 ||
      g_ascii_strcasecmp(rawValue, "enabled") == 0 ||
      g_ascii_strcasecmp(rawValue, "true") == 0 ||
      g_ascii_strcasecmp(rawValue, "1") == 0) {
    return true;
  }

  if (g_ascii_strcasecmp(rawValue, "off") == 0 ||
      g_ascii_strcasecmp(rawValue, "none") == 0 ||
      g_ascii_strcasecmp(rawValue, "disabled") == 0 ||
      g_ascii_strcasecmp(rawValue, "false") == 0 ||
      g_ascii_strcasecmp(rawValue, "0") == 0) {
    return false;
  }

  fprintf(stderr,
    "[%s] %s=%s no reconocido; usando %s "
    "(valores validos: on, off)\n",
    logPrefix,
    envName,
    rawValue,
    defaultValue ? "on" : "off");
  return defaultValue;
}

bool is_stutter_isolation_enabled()
{
  const gchar* rawMode = g_getenv("OPENMIX_STUTTER_ISOLATION");
  return rawMode && rawMode[0] != '\0' &&
    (g_ascii_strcasecmp(rawMode, "on") == 0 ||
     g_ascii_strcasecmp(rawMode, "true") == 0 ||
     g_ascii_strcasecmp(rawMode, "1") == 0 ||
     g_ascii_strcasecmp(rawMode, "monitors") == 0 ||
     g_ascii_strcasecmp(rawMode, "minimal") == 0 ||
     g_ascii_strcasecmp(rawMode, "big-monitors") == 0);
}

void configure_gstreamer_environment_for_electron()
{
  // Asegurar que GStreamer encuentra los plugins de Homebrew.
  // En macOS con Homebrew ARM, los plugins están en:
  //   /opt/homebrew/lib/gstreamer-1.0
  // Electron no hereda PATH/DYLD completos del shell, así que lo
  // configuramos explícitamente antes de gst_init().
  const char* existingPath = g_getenv("GST_PLUGIN_SYSTEM_PATH");
  if (!existingPath || existingPath[0] == '\0') {
    // Rutas estándar de Homebrew ARM + Intel + sistema.
    g_setenv("GST_PLUGIN_SYSTEM_PATH",
      "/opt/homebrew/lib/gstreamer-1.0:"
      "/usr/local/lib/gstreamer-1.0:"
      "/usr/lib/gstreamer-1.0",
      FALSE);
    printf("[GStreamer] GST_PLUGIN_SYSTEM_PATH configurado para Homebrew\n");
  }

  // gst-plugin-scanner es un proceso hijo. En Electron no siempre hereda
  // las rutas de Homebrew necesarias para resolver typelibs de GObject/Gst,
  // lo que genera warnings ruidosos aunque el pipeline principal funcione.
  if (!g_getenv("GI_TYPELIB_PATH")) {
    g_setenv("GI_TYPELIB_PATH",
      "/opt/homebrew/lib/girepository-1.0:"
      "/usr/local/lib/girepository-1.0",
      FALSE);
  }
  if (!g_getenv("DYLD_FALLBACK_LIBRARY_PATH")) {
    g_setenv("DYLD_FALLBACK_LIBRARY_PATH",
      "/opt/homebrew/lib:"
      "/usr/local/lib:"
      "/usr/lib",
      FALSE);
  }
}
