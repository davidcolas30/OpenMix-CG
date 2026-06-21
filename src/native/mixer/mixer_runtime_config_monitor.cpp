#include "mixer_runtime_config_internal.h"

#include "env_utils.h"
#include "mixer_runtime_config.h"
#include "mixer_runtime_config_defaults.h"

#include <glib.h>

#include <algorithm>
#include <cstdio>
#include <cstring>

namespace {

namespace defaults = openmix::mixer_runtime_config_defaults;

const char* monitor_renderer_mode_label()
{
  switch (g_monitorRendererMode) {
    case MONITOR_RENDERER_SELECTOR:
      return "selector";
    case MONITOR_RENDERER_AB_COMPOSITOR:
      return "ab-compositor";
    case MONITOR_RENDERER_COMPOSITOR:
    default:
      return "compositor";
  }
}

const char* monitor_compositor_backend_label()
{
  switch (g_monitorCompositorBackend) {
    case MONITOR_COMPOSITOR_BACKEND_GL:
      return "glvideomixer";
    case MONITOR_COMPOSITOR_BACKEND_CPU:
    default:
      return "compositor";
  }
}

const char* monitor_compositor_format_label()
{
  switch (g_monitorCompositorFormatMode) {
    case MONITOR_COMPOSITOR_FORMAT_BGRA:
      return "bgra";
    case MONITOR_COMPOSITOR_FORMAT_I420:
      return "i420";
    case MONITOR_COMPOSITOR_FORMAT_I420_BASE_BGRA_GRAPHICS:
      return "i420-base-bgra-graphics";
    case MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420:
    default:
      return "bgra-to-i420";
  }
}

} // namespace

namespace openmix::mixer_runtime_config {

void configure_monitor_frame_intervals()
{
  g_monitorActiveFps = parse_env_int_clamped(
    "OPENMIX_MONITOR_ACTIVE_FPS",
    defaults::kDefaultMonitorActiveFps,
    defaults::kMinMonitorFps,
    defaults::kMaxMonitorFps
  );
  g_monitorIdleFps = parse_env_int_clamped(
    "OPENMIX_MONITOR_IDLE_FPS",
    defaults::kDefaultMonitorIdleFps,
    defaults::kMinMonitorFps,
    defaults::kMaxMonitorFps
  );

  g_monitorActiveIntervalMs = std::max(1, 1000 / g_monitorActiveFps);
  g_monitorIdleIntervalMs = std::max(1, 1000 / g_monitorIdleFps);

  printf("[Mixer] FPS monitores: activo=%dfps reposo=%dfps\n", g_monitorActiveFps, g_monitorIdleFps);
}

void configure_realtime_diagnostic_logs_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_REALTIME_DIAGNOSTICS");
  if (!rawMode || rawMode[0] == '\0') {
    /*
     * Los probes/logs de tiempo real viven dentro del plano de media. Son muy
     * útiles para diagnosticar, pero en pruebas visuales pueden introducir
     * exactamente el tipo de pulso periódico que intentamos medir.
     */
    g_realtimeDiagnosticLogsEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "true") == 0 ||
      g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_realtimeDiagnosticLogsEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_realtimeDiagnosticLogsEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_REALTIME_DIAGNOSTICS=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_realtimeDiagnosticLogsEnabled = false;
  }

  printf("[Mixer] Logs diagnostico tiempo real: %s\n",
    g_realtimeDiagnosticLogsEnabled ? "on" : "off");
}

void configure_native_monitor_sink_sync_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_NATIVE_MONITOR_SYNC");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_nativeMonitorSinkSyncEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "clock") == 0 ||
             g_ascii_strcasecmp(rawMode, "sync") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_nativeMonitorSinkSyncEnabled = true;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_NATIVE_MONITOR_SYNC=%s no reconocido; usando off "
      "(valores validos: off, clock)\n",
      rawMode);
    g_nativeMonitorSinkSyncEnabled = false;
  }

  // sync=false da menor latencia teorica, pero en algunos sinks de ventana
  // puede presentar frames en rafagas. Esta guarda permite probar si dejar
  // que GstClock marque la cadencia estabiliza los monitores nativos.
  printf("[Mixer] Sync sink monitor nativo: %s\n",
    g_nativeMonitorSinkSyncEnabled ? "clock" : "off");
}

void configure_monitor_ipc_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_IPC");
  if (!rawMode || rawMode[0] == '\0') {
    g_monitorIpcMode = is_stutter_isolation_enabled()
      ? MONITOR_IPC_NONE
      : MONITOR_IPC_BOTH;
  } else if (g_ascii_strcasecmp(rawMode, "both") == 0) {
    g_monitorIpcMode = MONITOR_IPC_BOTH;
  } else if (g_ascii_strcasecmp(rawMode, "pgm") == 0) {
    g_monitorIpcMode = MONITOR_IPC_PGM_ONLY;
  } else if (g_ascii_strcasecmp(rawMode, "pvw") == 0) {
    g_monitorIpcMode = MONITOR_IPC_PVW_ONLY;
  } else if (g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_monitorIpcMode = MONITOR_IPC_NONE;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_IPC=%s no reconocido; usando both "
      "(valores validos: both, pgm, pvw, none)\n",
      rawMode);
    g_monitorIpcMode = MONITOR_IPC_BOTH;
  }

  printf("[Mixer] IPC monitores: %s\n", monitor_ipc_mode_label(g_monitorIpcMode));
}

void configure_monitor_input_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_INPUTS");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "both") == 0) {
    g_monitorInputMode = MONITOR_INPUTS_BOTH;
  } else if (g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_monitorInputMode = MONITOR_INPUTS_NONE;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_INPUTS=%s no reconocido; usando both "
      "(valores validos: both, none)\n",
      rawMode);
    g_monitorInputMode = MONITOR_INPUTS_BOTH;
  }

  printf("[Mixer] Entradas monitores: %s\n",
    g_monitorInputMode == MONITOR_INPUTS_NONE ? "none" : "both");
}

void configure_thumbnail_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_THUMBNAILS");
  if (!rawMode || rawMode[0] == '\0') {
    g_thumbnailsEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_thumbnailsEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_thumbnailsEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_THUMBNAILS=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_thumbnailsEnabled = true;
  }

  printf("[Mixer] Thumbnails: %s\n", g_thumbnailsEnabled ? "on" : "off");
}

void configure_combined_monitor_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_COMBINED_MONITOR");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_combinedMonitorEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_combinedMonitorEnabled = true;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_COMBINED_MONITOR=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_combinedMonitorEnabled = false;
  }

  printf("[Mixer] Monitor combinado: %s\n",
    g_combinedMonitorEnabled ? "on" : "off");
}

void configure_monitor_compositors_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_COMPOSITORS");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_monitorCompositorsEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_monitorCompositorsEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_COMPOSITORS=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_monitorCompositorsEnabled = true;
  }

  printf("[Mixer] Compositores monitor: %s\n", g_monitorCompositorsEnabled ? "on" : "off");
}

void configure_monitor_callbacks_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_CALLBACKS");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_monitorCallbacksEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_monitorCallbacksEnabled = false;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_CALLBACKS=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_monitorCallbacksEnabled = true;
  }

  if (g_monitorIpcMode == MONITOR_IPC_NONE) {
    // Si el plano de media no debe cruzar Electron IPC, los appsinks de
    // monitor solo serían una rama heredada consumiendo frames para tirarlos.
    // Los dejamos sin callbacks y el pipeline cerrará además su válvula.
    g_monitorCallbacksEnabled = false;
  }

  printf("[Mixer] Callbacks appsink monitor: %s\n", g_monitorCallbacksEnabled ? "on" : "off");
}

void configure_monitor_renderer_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_RENDERER");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "compositor") == 0) {
    g_monitorRendererMode = MONITOR_RENDERER_COMPOSITOR;
  } else if (g_ascii_strcasecmp(rawMode, "selector") == 0 ||
             g_ascii_strcasecmp(rawMode, "fast-selector") == 0) {
    g_monitorRendererMode = MONITOR_RENDERER_SELECTOR;
  } else if (g_ascii_strcasecmp(rawMode, "ab-compositor") == 0 ||
             g_ascii_strcasecmp(rawMode, "ab") == 0) {
    g_monitorRendererMode = MONITOR_RENDERER_AB_COMPOSITOR;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_RENDERER=%s no reconocido; usando compositor "
      "(valores validos: compositor, selector, ab-compositor)\n",
      rawMode);
    g_monitorRendererMode = MONITOR_RENDERER_COMPOSITOR;
  }

  printf("[Mixer] Render monitores: %s\n", monitor_renderer_mode_label());
}

void configure_monitor_compositor_backend_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_COMPOSITOR_BACKEND");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "cpu") == 0 ||
      g_ascii_strcasecmp(rawMode, "software") == 0 ||
      g_ascii_strcasecmp(rawMode, "compositor") == 0) {
    g_monitorCompositorBackend = MONITOR_COMPOSITOR_BACKEND_CPU;
  } else if (g_ascii_strcasecmp(rawMode, "gl") == 0 ||
             g_ascii_strcasecmp(rawMode, "opengl") == 0 ||
             g_ascii_strcasecmp(rawMode, "glvideomixer") == 0) {
    g_monitorCompositorBackend = MONITOR_COMPOSITOR_BACKEND_GL;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_COMPOSITOR_BACKEND=%s no reconocido; usando compositor "
      "(valores validos: cpu, gl)\n",
      rawMode);
    g_monitorCompositorBackend = MONITOR_COMPOSITOR_BACKEND_CPU;
  }

  if (uses_gl_monitor_compositor_backend() &&
      g_monitorRendererMode != MONITOR_RENDERER_AB_COMPOSITOR) {
    // El spike GL solo se acota a PGM/PVW A/B: current + incoming + grafismo.
    // En legacy habria que portar las N entradas por fuente y perderiamos la
    // comparacion limpia con Voctomix/OBS: mezclar solo lo que esta visible.
    fprintf(stderr,
      "[Mixer] Backend glvideomixer requiere OPENMIX_MONITOR_RENDERER=ab-compositor; "
      "ajustando renderer para esta ejecucion\n");
    g_monitorRendererMode = MONITOR_RENDERER_AB_COMPOSITOR;
  }

  printf("[Mixer] Backend composicion monitores: %s\n",
    monitor_compositor_backend_label());
}

void configure_monitor_compositor_format_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_COMPOSITOR_FORMAT");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "bgra-to-i420") == 0 ||
      g_ascii_strcasecmp(rawMode, "legacy") == 0 ||
      g_ascii_strcasecmp(rawMode, "default") == 0) {
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420;
  } else if (g_ascii_strcasecmp(rawMode, "bgra") == 0 ||
             g_ascii_strcasecmp(rawMode, "bgra-output") == 0) {
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_BGRA;
  } else if (g_ascii_strcasecmp(rawMode, "i420") == 0 ||
             g_ascii_strcasecmp(rawMode, "i420-only") == 0) {
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_I420;
  } else if (g_ascii_strcasecmp(rawMode, "i420-base-bgra-graphics") == 0 ||
             g_ascii_strcasecmp(rawMode, "i420-base-bgra-gfx") == 0 ||
             g_ascii_strcasecmp(rawMode, "i420-video-bgra-graphics") == 0 ||
             g_ascii_strcasecmp(rawMode, "hybrid-alpha") == 0) {
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_I420_BASE_BGRA_GRAPHICS;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_COMPOSITOR_FORMAT=%s no reconocido; usando bgra-to-i420 "
      "(valores validos: bgra-to-i420, bgra, i420, i420-base-bgra-graphics)\n",
      rawMode);
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420;
  }

  if (uses_gl_monitor_compositor_backend() &&
      g_monitorCompositorFormatMode != MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420) {
    // Esta guarda solo perfila el compositor software. En GL el cuello actual
    // esta en upload/download; mezclarla con cambios de formato haria ilegible
    // la medicion.
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_COMPOSITOR_FORMAT solo aplica al backend CPU; "
      "usando bgra-to-i420 con glvideomixer\n");
    g_monitorCompositorFormatMode = MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420;
  }

  if (g_monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_I420) {
    fprintf(stderr,
      "[Mixer] Formato compositor i420 es diagnostico: no preserva alpha de grafismos. "
      "Usarlo solo con grafismos desactivados.\n");
  }
  if (g_monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_I420_BASE_BGRA_GRAPHICS) {
    fprintf(stderr,
      "[Mixer] Formato compositor hibrido experimental: video base I420, grafismo BGRA. "
      "Sirve para medir si podemos preservar alpha sin convertir cada frame de camara a BGRA.\n");
  }

  printf("[Mixer] Formato compositor monitores: %s\n",
    monitor_compositor_format_label());
}

void configure_native_monitor_windows_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_NATIVE_MONITOR_WINDOWS");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_nativeMonitorWindowsEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_nativeMonitorWindowsEnabled = true;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_NATIVE_MONITOR_WINDOWS=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_nativeMonitorWindowsEnabled = false;
  }

  printf("[Mixer] Ventanas nativas monitor: %s\n",
    g_nativeMonitorWindowsEnabled ? "on" : "off");

  const gchar* rawSink = g_getenv("OPENMIX_NATIVE_MONITOR_SINK");
  if (!rawSink || rawSink[0] == '\0' ||
      g_ascii_strcasecmp(rawSink, "osx") == 0 ||
      g_ascii_strcasecmp(rawSink, "osxvideo") == 0 ||
      g_ascii_strcasecmp(rawSink, "osxvideosink") == 0) {
    g_nativeMonitorSinkFactory = "osxvideosink";
  } else if (g_ascii_strcasecmp(rawSink, "gl") == 0 ||
             g_ascii_strcasecmp(rawSink, "opengl") == 0 ||
             g_ascii_strcasecmp(rawSink, "glimagesink") == 0) {
    g_nativeMonitorSinkFactory = "glimagesink";
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_NATIVE_MONITOR_SINK=%s no reconocido; usando osxvideosink "
      "(valores validos: osxvideosink, glimagesink)\n",
      rawSink);
    g_nativeMonitorSinkFactory = "osxvideosink";
  }

  printf("[Mixer] Sink monitor nativo: %s\n", g_nativeMonitorSinkFactory);
}

void configure_monitor_gl_zero_copy_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_MONITOR_GL_ZERO_COPY");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_monitorGlZeroCopyEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_monitorGlZeroCopyEnabled = true;
  } else {
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_GL_ZERO_COPY=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_monitorGlZeroCopyEnabled = false;
  }

  if (g_monitorGlZeroCopyEnabled && !uses_gl_monitor_compositor_backend()) {
    // Zero-copy GL solo tiene sentido si el compositor de monitores ya trabaja
    // en GLMemory. Con el compositor CPU no hay textura GL que preservar.
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_GL_ZERO_COPY requiere "
      "OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl; desactivando zero-copy\n");
    g_monitorGlZeroCopyEnabled = false;
  }

  if (g_monitorGlZeroCopyEnabled && g_nativeMonitorWindowsEnabled &&
      std::strcmp(g_nativeMonitorSinkFactory, "glimagesink") != 0) {
    // osxvideosink no consume GLMemory. Forzar zero-copy aqui provocaria una
    // negociacion falsa o una descarga implicita, justo lo que queremos medir.
    fprintf(stderr,
      "[Mixer] OPENMIX_MONITOR_GL_ZERO_COPY requiere "
      "OPENMIX_NATIVE_MONITOR_SINK=glimagesink con ventanas nativas; "
      "desactivando zero-copy\n");
    g_monitorGlZeroCopyEnabled = false;
  }

  printf("[Mixer] Zero-copy GL monitores: %s\n",
    g_monitorGlZeroCopyEnabled ? "on" : "off");
}

} // namespace openmix::mixer_runtime_config
