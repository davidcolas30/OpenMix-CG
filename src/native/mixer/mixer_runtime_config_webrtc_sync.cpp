#include "mixer_runtime_config_internal.h"

#include "env_utils.h"
#include "mixer_runtime_config.h"
#include "mixer_runtime_config_defaults.h"

#include <glib.h>

#include <cstdio>

namespace {

namespace defaults = openmix::mixer_runtime_config_defaults;

} // namespace

namespace openmix::mixer_runtime_config {

void configure_stutter_trace_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_STUTTER_TRACE");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_stutterTraceEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_stutterTraceEnabled = true;
  } else {
    fprintf(stderr,
      "[StutterTrace] OPENMIX_STUTTER_TRACE=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_stutterTraceEnabled = false;
  }

  printf("[StutterTrace] Traza microtirones: %s\n",
    g_stutterTraceEnabled ? "on" : "off");
}

void configure_h264_keyframe_trace_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_H264_KEYFRAME_TRACE");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_h264KeyframeTraceEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_h264KeyframeTraceEnabled = true;
  } else {
    fprintf(stderr,
      "[H264Trace] OPENMIX_H264_KEYFRAME_TRACE=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_h264KeyframeTraceEnabled = false;
  }

  printf("[H264Trace] Traza keyframes H264: %s\n",
    g_h264KeyframeTraceEnabled ? "on" : "off");
}

void configure_rtp_timeline_trace_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_RTP_TIMELINE_TRACE");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_rtpTimelineTraceEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_rtpTimelineTraceEnabled = true;
  } else {
    fprintf(stderr,
      "[RtpTimeline] OPENMIX_RTP_TIMELINE_TRACE=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_rtpTimelineTraceEnabled = false;
  }

  printf("[RtpTimeline] Traza timeline RTP: %s\n",
    g_rtpTimelineTraceEnabled ? "on" : "off");

  const gchar* rawSummaryMode = g_getenv("OPENMIX_RTP_TIMELINE_SUMMARY");
  if (!rawSummaryMode || rawSummaryMode[0] == '\0' ||
      g_ascii_strcasecmp(rawSummaryMode, "off") == 0 ||
      g_ascii_strcasecmp(rawSummaryMode, "none") == 0 ||
      g_ascii_strcasecmp(rawSummaryMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawSummaryMode, "false") == 0 ||
      g_ascii_strcasecmp(rawSummaryMode, "0") == 0) {
    g_rtpTimelineSummaryEnabled = false;
  } else if (g_ascii_strcasecmp(rawSummaryMode, "on") == 0 ||
             g_ascii_strcasecmp(rawSummaryMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawSummaryMode, "true") == 0 ||
             g_ascii_strcasecmp(rawSummaryMode, "1") == 0) {
    g_rtpTimelineSummaryEnabled = true;
  } else {
    fprintf(stderr,
      "[RtpTimeline] OPENMIX_RTP_TIMELINE_SUMMARY=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawSummaryMode);
    g_rtpTimelineSummaryEnabled = false;
  }

  printf("[RtpTimeline] Resumen timeline RTP al desconectar: %s\n",
    g_rtpTimelineSummaryEnabled ? "on" : "off");
}

void configure_webrtc_monitor_branch_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_MONITOR_BRANCH");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_webrtcMonitorBranchEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_webrtcMonitorBranchEnabled = false;
  } else {
    fprintf(stderr,
      "[WebRTC] OPENMIX_WEBRTC_MONITOR_BRANCH=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_webrtcMonitorBranchEnabled = true;
  }

  printf("[WebRTC] Rama monitor WebRTC: %s\n", g_webrtcMonitorBranchEnabled ? "on" : "off");
}

void configure_webrtc_decode_branch_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_DECODE_BRANCH");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "on") == 0 ||
      g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_webrtcDecodeBranchEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_webrtcDecodeBranchEnabled = false;
  } else {
    fprintf(stderr,
      "[WebRTC] OPENMIX_WEBRTC_DECODE_BRANCH=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_webrtcDecodeBranchEnabled = true;
  }

  printf("[WebRTC] Rama decode WebRTC: %s\n", g_webrtcDecodeBranchEnabled ? "on" : "off");
}

void configure_webrtc_rtp_direct_sink_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_RTP_DIRECT_SINK");
  g_webrtcRtpDirectSinkEnabled = rawMode &&
    (g_ascii_strcasecmp(rawMode, "on") == 0 ||
     g_ascii_strcasecmp(rawMode, "true") == 0 ||
     g_ascii_strcasecmp(rawMode, "1") == 0 ||
     g_ascii_strcasecmp(rawMode, "enabled") == 0);

  printf("[WebRTC] RTP directo a fakesink: %s\n",
    g_webrtcRtpDirectSinkEnabled ? "on" : "off");
}

void configure_webrtc_standalone_rx_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_STANDALONE_RX");
  g_webrtcStandaloneRxEnabled = rawMode &&
    (g_ascii_strcasecmp(rawMode, "on") == 0 ||
     g_ascii_strcasecmp(rawMode, "true") == 0 ||
     g_ascii_strcasecmp(rawMode, "1") == 0 ||
     g_ascii_strcasecmp(rawMode, "enabled") == 0);

  if (g_webrtcStandaloneRxEnabled && !g_webrtcRtpDirectSinkEnabled) {
    fprintf(stderr,
      "[WebRTC] OPENMIX_WEBRTC_STANDALONE_RX=on requiere "
      "OPENMIX_WEBRTC_RTP_DIRECT_SINK=on; se desactiva standalone.\n");
    g_webrtcStandaloneRxEnabled = false;
  }

  printf("[WebRTC] Recepcion standalone sin mixer: %s\n",
    g_webrtcStandaloneRxEnabled ? "on" : "off");
}

void configure_webrtc_receive_latency()
{
  g_webrtcReceiveLatencyMs = parse_env_int_clamped(
    "OPENMIX_WEBRTC_LATENCY_MS",
    defaults::kDefaultWebrtcReceiveLatencyMs,
    0,
    1000
  );

  // webrtcbin usa 200ms por defecto en sus jitterbuffers. Intentar bajar a
  // 50ms en 1080p30 por WiFi ha mostrado ráfagas periódicas en el propio pad
  // RTP de webrtcbin, antes de depay/parser/decoder. Dejamos el valor
  // parametrizable para comparar latencia vs estabilidad sin recompilar.
  printf("[WebRTC] Latencia jitterbuffer recepcion: %dms\n",
    g_webrtcReceiveLatencyMs);
}

void configure_webrtc_rtp_queue_limits()
{
  g_webrtcRtpQueueBuffers = parse_env_int_clamped(
    "OPENMIX_WEBRTC_RTP_QUEUE_BUFFERS",
    defaults::kDefaultWebrtcRtpQueueBuffers,
    128,
    8192
  );
  g_webrtcRtpQueueTimeMs = parse_env_int_clamped(
    "OPENMIX_WEBRTC_RTP_QUEUE_MS",
    defaults::kDefaultWebrtcRtpQueueTimeMs,
    0,
    2000
  );

  // Esta cola contiene paquetes RTP, no frames. Con H.264 1080p un frame
  // puede ocupar decenas de paquetes; si el limite temporal es bajo y la
  // cola bloquea, el jitterbuffer de webrtcbin entrega en pulsos visibles.
  // Por defecto quitamos el limite por tiempo y dejamos un limite por buffers.
  printf("[WebRTC] Cola RTP recepcion: buffers=%d time=%dms\n",
    g_webrtcRtpQueueBuffers,
    g_webrtcRtpQueueTimeMs);
}

void configure_webrtc_jitterbuffer_mode()
{
  resolve_webrtc_jitterbuffer_mode_from_env();

  /*
   * Usamos el valor numerico del enum de rtpjitterbuffer en vez de
   * gst_util_set_object_arg(). En las pruebas de microtirones vimos que
   * pedir "buffer" por string podia dejar el elemento en el valor por defecto
   * (slave=1), invalidando la prueba sin fallar de forma visible.
   */
  printf("[WebRTC] Modo jitterbuffer interno: %s (%d)\n",
    g_webrtcJitterBufferMode.c_str(),
    g_webrtcJitterBufferModeValue);
}

void configure_webrtc_rx_stats_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_RX_STATS");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
      g_ascii_strcasecmp(rawMode, "false") == 0 ||
      g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_webrtcRxStatsEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_webrtcRxStatsEnabled = true;
  } else {
    fprintf(stderr,
      "[WebRTC RX] OPENMIX_WEBRTC_RX_STATS=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_webrtcRxStatsEnabled = false;
  }

  g_webrtcRxStatsIntervalMs = parse_env_int_clamped(
    "OPENMIX_WEBRTC_RX_STATS_INTERVAL_MS",
    1000,
    250,
    10000
  );

  printf("[WebRTC RX] Stats recepcion: %s interval=%dms\n",
    g_webrtcRxStatsEnabled ? "on" : "off",
    g_webrtcRxStatsIntervalMs);
}

void configure_webrtc_monitor_normalize_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_MONITOR_NORMALIZE");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "deferred") == 0 ||
      g_ascii_strcasecmp(rawMode, "after-selector") == 0) {
    g_webrtcMonitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_DEFERRED;
  } else if (g_ascii_strcasecmp(rawMode, "pre") == 0 ||
             g_ascii_strcasecmp(rawMode, "pre-selector") == 0 ||
             g_ascii_strcasecmp(rawMode, "legacy") == 0) {
    g_webrtcMonitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_PRE_SELECTOR;
  } else {
    fprintf(stderr,
      "[WebRTC] OPENMIX_WEBRTC_MONITOR_NORMALIZE=%s no reconocido; usando deferred "
      "(valores validos: deferred, pre-selector)\n",
      rawMode);
    g_webrtcMonitorNormalizeMode = WEBRTC_MONITOR_NORMALIZE_DEFERRED;
  }

  printf("[WebRTC] Normalizacion monitor WebRTC: %s\n",
    g_webrtcMonitorNormalizeMode == WEBRTC_MONITOR_NORMALIZE_DEFERRED
      ? "deferred"
      : "pre-selector");
}

void configure_sync_buffer_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_SYNC_BUFFER");
  if (!rawMode || rawMode[0] == '\0') {
    /*
     * El modo de aislamiento de tirones se usa para medir WebRTC casi desnudo.
     * En ese caso no introducimos el nuevo smoother por defecto para que las
     * comparativas antiguas sigan midiendo la misma cadena.
     */
    g_syncBufferEnabled = !is_stutter_isolation_enabled();
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "true") == 0 ||
             g_ascii_strcasecmp(rawMode, "1") == 0) {
    g_syncBufferEnabled = true;
  } else if (g_ascii_strcasecmp(rawMode, "off") == 0 ||
             g_ascii_strcasecmp(rawMode, "none") == 0 ||
             g_ascii_strcasecmp(rawMode, "disabled") == 0 ||
             g_ascii_strcasecmp(rawMode, "false") == 0 ||
             g_ascii_strcasecmp(rawMode, "0") == 0) {
    g_syncBufferEnabled = false;
  } else {
    fprintf(stderr,
      "[SyncBuffer] OPENMIX_SYNC_BUFFER=%s no reconocido; usando on "
      "(valores validos: on, off)\n",
      rawMode);
    g_syncBufferEnabled = true;
  }

  const gchar* rawStats = g_getenv("OPENMIX_SYNC_BUFFER_STATS");
  g_syncBufferStatsEnabled = rawStats &&
    (g_ascii_strcasecmp(rawStats, "on") == 0 ||
     g_ascii_strcasecmp(rawStats, "enabled") == 0 ||
     g_ascii_strcasecmp(rawStats, "true") == 0 ||
     g_ascii_strcasecmp(rawStats, "1") == 0);
  g_syncBufferNtpEnabled = parse_env_bool_with_default(
    "OPENMIX_SYNC_BUFFER_NTP",
    true,
    "SyncBuffer");
  g_syncBufferNtpApplyEnabled = parse_env_bool_with_default(
    "OPENMIX_SYNC_BUFFER_NTP_APPLY",
    false,
    "SyncBuffer");
  g_syncBufferRetimerEnabled = parse_env_bool_with_default(
    "OPENMIX_SYNC_BUFFER_RETIMER",
    true,
    "SyncBuffer");
  g_syncBufferClockGateEnabled = parse_env_bool_with_default(
    "OPENMIX_SYNC_BUFFER_CLOCK",
    false,
    "SyncBuffer");
  g_syncBufferMinPeers = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_MIN_PEERS",
    defaults::kDefaultSyncBufferMinPeers,
    1,
    defaults::kNumRuntimeSources
  );

  g_syncBufferLatencyMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_LATENCY_MS",
    defaults::kDefaultSyncBufferLatencyMs,
    0,
    500
  );
  g_syncBufferMaxBuffers = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_MAX_BUFFERS",
    defaults::kDefaultSyncBufferMaxBuffers,
    2,
    60
  );
  g_syncBufferMaxTimeMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_MAX_TIME_MS",
    defaults::kDefaultSyncBufferMaxTimeMs,
    0,
    2000
  );
  g_syncBufferNtpMaxDelayMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_NTP_MAX_DELAY_MS",
    defaults::kDefaultSyncBufferNtpMaxDelayMs,
    0,
    500
  );
  g_syncBufferNtpMinStepMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_NTP_MIN_STEP_MS",
    defaults::kDefaultSyncBufferNtpMinStepMs,
    1,
    100
  );
  g_syncBufferNtpAdjustIntervalMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_NTP_ADJUST_INTERVAL_MS",
    defaults::kDefaultSyncBufferNtpAdjustIntervalMs,
    100,
    5000
  );
  g_syncBufferNtpMaxStepMs = parse_env_int_clamped(
    "OPENMIX_SYNC_BUFFER_NTP_MAX_STEP_MS",
    defaults::kDefaultSyncBufferNtpMaxStepMs,
    1,
    250
  );

  if (g_syncBufferNtpApplyEnabled && !g_syncBufferClockGateEnabled) {
    printf("[SyncBuffer] NTP apply con OPENMIX_SYNC_BUFFER_CLOCK=off: "
           "se aplicara retardo relativo mediante queue min-threshold\n");
  }

  printf("[SyncBuffer] Manager multicamara: %s latency=%dms max-buffers=%d "
         "max-time=%dms min-peers=%d stats=%s ntp=%s ntp-apply=%s retimer=%s clock=%s "
         "ntp-max-delay=%dms ntp-max-step=%dms\n",
    g_syncBufferEnabled ? "on" : "off",
    g_syncBufferLatencyMs,
    g_syncBufferMaxBuffers,
    g_syncBufferMaxTimeMs,
    g_syncBufferMinPeers,
    g_syncBufferStatsEnabled ? "on" : "off",
    g_syncBufferNtpEnabled ? "on" : "off",
    g_syncBufferNtpApplyEnabled ? "on" : "off",
    g_syncBufferRetimerEnabled ? "on" : "off",
    g_syncBufferClockGateEnabled ? "on" : "off",
    g_syncBufferNtpMaxDelayMs,
    g_syncBufferNtpMaxStepMs);
}

void configure_pli_reserve_thread_mode()
{
  const gchar* rawMode = g_getenv("OPENMIX_PLI_RESERVE_THREAD");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "off") == 0 ||
      g_ascii_strcasecmp(rawMode, "none") == 0 ||
      g_ascii_strcasecmp(rawMode, "disabled") == 0) {
    g_pliReserveThreadEnabled = false;
  } else if (g_ascii_strcasecmp(rawMode, "on") == 0 ||
             g_ascii_strcasecmp(rawMode, "enabled") == 0) {
    g_pliReserveThreadEnabled = true;
  } else {
    fprintf(stderr,
      "[WebRTC] OPENMIX_PLI_RESERVE_THREAD=%s no reconocido; usando off "
      "(valores validos: on, off)\n",
      rawMode);
    g_pliReserveThreadEnabled = false;
  }

  printf("[WebRTC] Hilo PLI de reserva: %s\n", g_pliReserveThreadEnabled ? "on" : "off");
}

} // namespace openmix::mixer_runtime_config

void resolve_webrtc_jitterbuffer_mode_from_env()
{
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_JITTERBUFFER_MODE");
  if (!rawMode || rawMode[0] == '\0' ||
      g_ascii_strcasecmp(rawMode, "default") == 0 ||
      g_ascii_strcasecmp(rawMode, "auto") == 0) {
    g_webrtcJitterBufferMode = "default";
    g_webrtcJitterBufferModeValue = -1;
  } else if (g_ascii_strcasecmp(rawMode, "none") == 0) {
    g_webrtcJitterBufferMode = "none";
    g_webrtcJitterBufferModeValue = 0;
  } else if (g_ascii_strcasecmp(rawMode, "slave") == 0) {
    g_webrtcJitterBufferMode = "slave";
    g_webrtcJitterBufferModeValue = 1;
  } else if (g_ascii_strcasecmp(rawMode, "buffer") == 0) {
    g_webrtcJitterBufferMode = "buffer";
    g_webrtcJitterBufferModeValue = 2;
  } else if (g_ascii_strcasecmp(rawMode, "synced") == 0) {
    g_webrtcJitterBufferMode = "synced";
    g_webrtcJitterBufferModeValue = 4;
  } else {
    fprintf(stderr,
      "[WebRTC] OPENMIX_WEBRTC_JITTERBUFFER_MODE=%s no reconocido; usando default "
      "(valores validos: default, none, slave, buffer, synced)\n",
      rawMode);
    g_webrtcJitterBufferMode = "default";
    g_webrtcJitterBufferModeValue = -1;
  }
}

WebRTCH264DecoderMode get_webrtc_h264_decoder_mode()
{
  /*
   * OPENMIX_WEBRTC_H264_DECODER permite comparar la ruta hardware de macOS
   * (vtdec / VideoToolbox) con la ruta software (avdec_h264) sin recompilar.
   * Es una guarda de diagnóstico: ayuda a aislar si un artefacto viene del
   * móvil, de la red, del decoder o del puente hacia el mixer.
   */
  const gchar* rawMode = g_getenv("OPENMIX_WEBRTC_H264_DECODER");
  if (!rawMode || rawMode[0] == '\0' || g_ascii_strcasecmp(rawMode, "auto") == 0) {
    return WEBRTC_H264_DECODER_AUTO;
  }

  if (g_ascii_strcasecmp(rawMode, "hardware") == 0 || g_ascii_strcasecmp(rawMode, "vtdec") == 0) {
    return WEBRTC_H264_DECODER_HARDWARE;
  }

  if (g_ascii_strcasecmp(rawMode, "software") == 0 || g_ascii_strcasecmp(rawMode, "avdec") == 0 ||
      g_ascii_strcasecmp(rawMode, "avdec_h264") == 0) {
    return WEBRTC_H264_DECODER_SOFTWARE;
  }

  fprintf(stderr,
    "[WebRTC] OPENMIX_WEBRTC_H264_DECODER=%s no reconocido; usando auto "
    "(valores validos: auto, hardware, software)\n",
    rawMode);
  return WEBRTC_H264_DECODER_AUTO;
}

const char* get_webrtc_h264_decoder_mode_label(WebRTCH264DecoderMode mode)
{
  switch (mode) {
    case WEBRTC_H264_DECODER_HARDWARE:
      return "hardware";
    case WEBRTC_H264_DECODER_SOFTWARE:
      return "software";
    case WEBRTC_H264_DECODER_AUTO:
    default:
      return "auto";
  }
}
