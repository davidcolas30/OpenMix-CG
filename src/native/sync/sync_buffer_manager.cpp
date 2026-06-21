#include "sync_buffer_manager.h"

#include <gst/rtp/rtp.h>
#include <gst/video/video.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cinttypes>
#include <mutex>
#include <vector>

#include "webrtc_utils.h"

namespace {

struct SyncBufferNtpAlignmentState {
  bool anchorValid = false;
  GstClockTime anchorReferenceTimestamp = GST_CLOCK_TIME_NONE;
  GstClockTime anchorRunningTime = GST_CLOCK_TIME_NONE;
  std::vector<bool> peerAgeValid;
  std::vector<double> peerAgeMs;
  std::chrono::steady_clock::time_point lastLogTime = {};
};

SyncBufferRuntimeContext g_context;
std::mutex g_ntpAlignmentMutex;
SyncBufferNtpAlignmentState g_ntpAlignment;

bool bool_setting(bool* setting)
{
  return setting && *setting;
}

int int_setting(int* setting, int fallback = 0)
{
  return setting ? *setting : fallback;
}

int source_count()
{
  return std::max(0, g_context.sourceCount);
}

bool valid_source_index(int sourceIndex)
{
  return sourceIndex >= 0 && sourceIndex < source_count();
}

int decoded_peer_count()
{
  return g_context.decodedPeerCount
    ? g_context.decodedPeerCount->load()
    : 0;
}

void increment_decoded_peer_count()
{
  if (g_context.decodedPeerCount) {
    g_context.decodedPeerCount->fetch_add(1);
  }
}

int decrement_decoded_peer_count()
{
  if (!g_context.decodedPeerCount) {
    return 0;
  }

  const int previousCount = g_context.decodedPeerCount->fetch_sub(1);
  if (previousCount <= 0) {
    g_context.decodedPeerCount->store(0);
  }
  return previousCount;
}

GstClockTime get_peer_running_time(WebRTCPeer* peer)
{
  if (!g_context.getPeerRunningTime) {
    return 0;
  }
  return g_context.getPeerRunningTime(peer);
}

void ensure_ntp_alignment_source_count_locked()
{
  const int count = source_count();
  if (count <= 0) {
    g_ntpAlignment.peerAgeValid.clear();
    g_ntpAlignment.peerAgeMs.clear();
    return;
  }

  if (static_cast<int>(g_ntpAlignment.peerAgeValid.size()) != count) {
    g_ntpAlignment.peerAgeValid.assign(static_cast<size_t>(count), false);
    g_ntpAlignment.peerAgeMs.assign(static_cast<size_t>(count), 0.0);
  }
}

void resolve_sync_buffer_ntp_probe_context_from_clock_rate(
  SyncBufferNtpProbeContext* context,
  guint32 clockRate,
  const char* sourceLabel)
{
  if (!context || context->mediaResolved || clockRate == 0) {
    return;
  }

  /*
   * RTP usa 90 kHz para video en codecs como H.264/VP8/VP9. Opus/audio suele
   * ir a 48 kHz. Es una heuristica mejor que perder el RTCP Sender Report
   * cuando las caps todavia no han llegado al rtpjitterbuffer.
   */
  context->mediaResolved = true;
  context->isVideo = clockRate == 90000;
  context->clockRate = clockRate;
  context->mediaLabel =
    std::string(context->isVideo ? "media=video" : "media=non-video") +
    "/clock=" + std::to_string(clockRate) +
    "/" + (sourceLabel ? sourceLabel : "rtcp-sync");

  if (bool_setting(g_context.statsEnabled)) {
    printf("[SyncBufferNTP] media resuelta por clock-rate: %s %s\n",
      context->mediaLabel.c_str(),
      context->isVideo ? "usado para sync" : "ignorado para sync");
  }
}

GstCaps* get_ntp_reference_caps()
{
  static GstCaps* ntpCaps = gst_caps_new_empty_simple("timestamp/x-ntp");
  return ntpCaps;
}

GstReferenceTimestampMeta* get_ntp_reference_timestamp_meta(GstBuffer* buffer)
{
  if (!buffer) {
    return nullptr;
  }

  return gst_buffer_get_reference_timestamp_meta(buffer, get_ntp_reference_caps());
}

void remember_ntp_rtp_mapping_locked(
  WebRTCPeer* peer,
  GstClockTime pts,
  GstClockTime referenceTimestamp,
  guint32 rtpTimestamp)
{
  if (!peer || !GST_CLOCK_TIME_IS_VALID(pts) ||
      !GST_CLOCK_TIME_IS_VALID(referenceTimestamp)) {
    return;
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  static const size_t MAX_NTP_MAPPINGS = 240;
  stats.ntpMappings.push_back(
    SyncBufferDiagnosticsState::NtpRtpMapping{pts, referenceTimestamp, rtpTimestamp});
  stats.lastReferenceTimestamp = referenceTimestamp;

  while (stats.ntpMappings.size() > MAX_NTP_MAPPINGS) {
    stats.ntpMappings.pop_front();
  }
}

bool compute_ntp_reference_from_rtcp_sr_locked(
  WebRTCPeer* peer,
  guint32 rtpTimestamp,
  GstClockTime* referenceTimestampOut)
{
  if (!peer || !referenceTimestampOut) {
    return false;
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  if (!stats.hasRtcpSrMapping ||
      !GST_CLOCK_TIME_IS_VALID(stats.srNtpTime) ||
      stats.srClockRate == 0) {
    return false;
  }

  /*
   * RTCP Sender Report entrega un RTP extendido de 64 bits. El paquete RTP solo
   * trae 32 bits, así que lo colocamos en la vuelta de contador más cercana al SR.
   */
  const guint64 wrap = 1ULL << 32;
  const guint64 halfWrap = 1ULL << 31;
  const guint64 srExtRtp = stats.srExtRtpTime;
  const guint64 base = srExtRtp & 0xffffffff00000000ULL;
  guint64 extendedRtp = base | static_cast<guint64>(rtpTimestamp);
  if (extendedRtp + halfWrap < srExtRtp) {
    extendedRtp += wrap;
  } else if (extendedRtp > srExtRtp + halfWrap && extendedRtp >= wrap) {
    extendedRtp -= wrap;
  }

  const gint64 rtpDeltaTicks =
    static_cast<gint64>(extendedRtp) - static_cast<gint64>(srExtRtp);
  const double nsDelta =
    static_cast<double>(rtpDeltaTicks) * static_cast<double>(GST_SECOND) /
    static_cast<double>(stats.srClockRate);
  const gint64 referenceNs =
    static_cast<gint64>(stats.srNtpTime) + static_cast<gint64>(std::llround(nsDelta));

  if (referenceNs < 0) {
    return false;
  }

  *referenceTimestampOut = static_cast<GstClockTime>(referenceNs);
  return true;
}

bool lookup_ntp_reference_for_pts_locked(
  WebRTCPeer* peer,
  GstClockTime pts,
  GstClockTime* referenceTimestampOut)
{
  if (!peer || !referenceTimestampOut || !GST_CLOCK_TIME_IS_VALID(pts)) {
    return false;
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  if (stats.ntpMappings.empty()) {
    return false;
  }

  const GstClockTime tolerance =
    gst_util_uint64_scale_int(
      GST_SECOND,
      g_context.frameRateDen,
      g_context.frameRateNum);
  GstClockTime bestDiff = GST_CLOCK_TIME_NONE;
  GstClockTime bestReference = GST_CLOCK_TIME_NONE;

  for (const auto& mapping : stats.ntpMappings) {
    if (!GST_CLOCK_TIME_IS_VALID(mapping.pts) ||
        !GST_CLOCK_TIME_IS_VALID(mapping.referenceTimestamp)) {
      continue;
    }

    const GstClockTime diff =
      pts >= mapping.pts ? pts - mapping.pts : mapping.pts - pts;
    if (!GST_CLOCK_TIME_IS_VALID(bestDiff) || diff < bestDiff) {
      bestDiff = diff;
      bestReference = mapping.referenceTimestamp;
    }
  }

  if (!GST_CLOCK_TIME_IS_VALID(bestDiff) || bestDiff > tolerance ||
      !GST_CLOCK_TIME_IS_VALID(bestReference)) {
    return false;
  }

  *referenceTimestampOut = bestReference;
  stats.ntpMappedFrames += 1;
  return true;
}

int round_delay_to_step(int delayMs)
{
  const int step = std::max(1, int_setting(g_context.ntpMinStepMs, 1));
  return ((delayMs + (step / 2)) / step) * step;
}

bool should_arm_sync_buffer_timing()
{
  if (!bool_setting(g_context.enabled)) {
    return false;
  }

  /*
   * Un peer existe desde que se escanea el QR, pero todavía puede no haber
   * creado decoder ni entregado frames. Armar la compuerta con "peers creados"
   * bloqueaba la primera cámara mientras la segunda estaba negociando. Para el
   * Sync Buffer solo cuentan cámaras que ya han cruzado decode al menos una vez.
   */
  return decoded_peer_count() >= int_setting(g_context.minPeers, 1);
}

void mark_peer_decoded_for_sync_buffer_timing_locked(WebRTCPeer* peer)
{
  if (!peer || peer->syncBufferCountedAsDecodedPeer) {
    return;
  }

  peer->syncBufferCountedAsDecodedPeer = true;
  increment_decoded_peer_count();
  const int decodedPeers = decoded_peer_count();
  if (bool_setting(g_context.statsEnabled)) {
    printf("[SyncBufferState] %s fuente=%d primer frame decodificado; decoded-peers=%d/%d\n",
      peer->peerId.c_str(),
      peer->mixerSourceIndex,
      decodedPeers,
      int_setting(g_context.minPeers, 1));
  }
}

bool update_sync_buffer_timing_state_locked(WebRTCPeer* peer)
{
  if (!peer) {
    return false;
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  stats.activePeerCount = decoded_peer_count();
  const bool timingActive = stats.activePeerCount >= int_setting(g_context.minPeers, 1);

  if (stats.syncTimingActive != timingActive) {
    stats.syncTimingActive = timingActive;
    if (bool_setting(g_context.statsEnabled)) {
      printf("[SyncBufferState] %s fuente=%d timing=%s decoded-peers=%d/%d "
             "(retimer=%s clock=%s)\n",
        peer->peerId.c_str(),
        peer->mixerSourceIndex,
        timingActive ? "on" : "off",
        stats.activePeerCount,
        int_setting(g_context.minPeers, 1),
        bool_setting(g_context.retimerEnabled) ? "on" : "off",
        bool_setting(g_context.clockGateEnabled) ? "on" : "off");
    }
    /*
     * Una sola cámara no necesita sincronización multicámara: si la tocamos,
     * cualquier tirón que ya no existe sin el módulo pasa a ser culpa nuestra.
     * Al armar el manager con dos peers, recalculamos el offset desde el frame
     * vivo actual para no reutilizar un timeline aprendido durante el bypass.
     */
    stats.hasRunningTimeOffset = false;
    stats.hasLastRetimerPts = false;
    stats.nextSyntheticPts = GST_CLOCK_TIME_NONE;
    stats.lastNtpAdjustmentTime = {};
    if (!timingActive) {
      stats.currentNtpDelayMs = 0;
    }
  }

  const int nextQueueDelayMs =
    timingActive && bool_setting(g_context.ntpApplyEnabled)
      ? stats.currentNtpDelayMs
      : 0;
  const int frameDurationMs = static_cast<int>(
    (static_cast<int64_t>(1000) * g_context.frameRateDen +
      g_context.frameRateNum - 1) /
    g_context.frameRateNum);
  const int delayBufferBudget =
    nextQueueDelayMs > 0 ? (nextQueueDelayMs + frameDurationMs - 1) / frameDurationMs + 3 : 0;
  const int nextQueueMaxBuffers = timingActive
    ? std::max(int_setting(g_context.maxBuffers, 0), delayBufferBudget)
    : 0;
  const int nextQueueMaxTimeMs = timingActive
    ? std::max(
        int_setting(g_context.maxTimeMs, 0),
        nextQueueDelayMs + frameDurationMs * 3)
    : 0;

  if (peer->syncBufferQueue &&
      (!stats.hasQueueState ||
       stats.queueTimingActive != timingActive ||
       stats.queueDelayMs != nextQueueDelayMs ||
       stats.queueMaxTimeMs != nextQueueMaxTimeMs)) {
    const bool shouldLogQueueTopology =
      !stats.hasQueueState || stats.queueTimingActive != timingActive;
    /*
     * Con una sola cámara, la cola del Sync Buffer no debe comportarse como
     * buffer de sincronización: sin límites y sin leaky evita que el módulo
     * descarte o copie indirectamente frames en pruebas base 1080p.
     *
     * Con NTP apply activado retenemos en esta cola, no en identity(sync=true).
     * Es menos ambicioso pero mucho más estable: la cola añade un retardo
     * relativo al stream que va "demasiado pronto" sin volver a dormir contra
     * timestamps RTP que ya vimos que pueden pegar saltos grandes en móviles.
     */
    g_object_set(peer->syncBufferQueue,
      "max-size-buffers", (guint)nextQueueMaxBuffers,
      "max-size-bytes", (guint)0,
      "max-size-time", (guint64)(static_cast<guint64>(nextQueueMaxTimeMs) * GST_MSECOND),
      "min-threshold-time",
        (guint64)(static_cast<guint64>(nextQueueDelayMs) * GST_MSECOND),
      "leaky", timingActive ? 2 : 0,
      NULL);
    if (bool_setting(g_context.statsEnabled) && shouldLogQueueTopology) {
      printf("[SyncBufferState] %s fuente=%d queue timing=%s max-buffers=%d "
             "max-time=%dms min-threshold=%dms leaky=%s\n",
        peer->peerId.c_str(),
        peer->mixerSourceIndex,
        timingActive ? "on" : "off",
        nextQueueMaxBuffers,
        nextQueueMaxTimeMs,
        nextQueueDelayMs,
        timingActive ? "downstream" : "off");
    }
    stats.hasQueueState = true;
    stats.queueTimingActive = timingActive;
    stats.queueDelayMs = nextQueueDelayMs;
    stats.queueMaxTimeMs = nextQueueMaxTimeMs;
  }

  const bool nextClockGateActive =
    timingActive && bool_setting(g_context.clockGateEnabled);
  const bool nextClockSingleSegmentActive =
    timingActive && bool_setting(g_context.retimerEnabled);
  const int nextClockGateOffsetMs = nextClockGateActive
    ? int_setting(g_context.latencyMs, 0) + stats.currentNtpDelayMs
    : 0;

  if (peer->syncBufferClock &&
      (!stats.hasClockGateState ||
       stats.clockGateActive != nextClockGateActive ||
       stats.clockSingleSegmentActive != nextClockSingleSegmentActive ||
       stats.clockGateOffsetMs != nextClockGateOffsetMs)) {
    g_object_set(peer->syncBufferClock,
      "sync", nextClockGateActive ? TRUE : FALSE,
      "single-segment", nextClockSingleSegmentActive ? TRUE : FALSE,
      "ts-offset",
        (gint64)(static_cast<gint64>(nextClockGateOffsetMs) * GST_MSECOND),
      NULL);
    if (bool_setting(g_context.statsEnabled)) {
      printf("[SyncBufferState] %s fuente=%d clock=%s single-segment=%s ts-offset=%dms\n",
        peer->peerId.c_str(),
        peer->mixerSourceIndex,
        nextClockGateActive ? "on" : "off",
        nextClockSingleSegmentActive ? "on" : "off",
        nextClockGateOffsetMs);
    }
    stats.hasClockGateState = true;
    stats.clockGateActive = nextClockGateActive;
    stats.clockSingleSegmentActive = nextClockSingleSegmentActive;
    stats.clockGateOffsetMs = nextClockGateOffsetMs;
  }

  return timingActive;
}

GstClockTime normalize_peer_pts_to_mixer_running_time_locked(
  WebRTCPeer* peer,
  GstClockTime originalPts,
  GstClockTime runningTime,
  GstClockTime frameDuration)
{
  if (!peer || !GST_CLOCK_TIME_IS_VALID(originalPts) ||
      !GST_CLOCK_TIME_IS_VALID(runningTime) ||
      !GST_CLOCK_TIME_IS_VALID(frameDuration) ||
      frameDuration == 0) {
    return originalPts;
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  if (!stats.hasRunningTimeOffset) {
    /*
     * Cada camara WebRTC llega como un bin dinamico que puede empezar su
     * timeline en cero aunque el mixer padre lleve minutos en PLAYING. Si
     * dejamos esos PTS "locales" entrar al compositor, una camara conectada
     * tarde puede parecer atrasada y el monitor repite el ultimo frame.
     * Por eso fijamos el primer frame vivo al running-time del mixer. A partir
     * de ahi no seguimos ciegamente los saltos RTP/WebRTC: en pruebas reales
     * la segunda camara podia llegar con PTS que avanzaban ~600 ms de golpe.
     * Si esos saltos entran a identity(sync=true), la compuerta duerme 600 ms
     * y la cola se llena. El Sync Buffer debe entregar una cadencia continua.
     */
    stats.hasRunningTimeOffset = true;
    stats.runningTimeOffset =
      static_cast<gint64>(runningTime) - static_cast<gint64>(originalPts);
    stats.firstOriginalPts = originalPts;
    stats.firstNormalizedPts = runningTime;
    stats.hasLastRetimerPts = true;
    stats.lastOriginalRetimerPts = originalPts;
    stats.lastNormalizedRetimerPts = runningTime;
    stats.retimedFrames += 1;
    return runningTime;
  }

  GstClockTime normalizedDelta = frameDuration;
  if (stats.hasLastRetimerPts &&
      GST_CLOCK_TIME_IS_VALID(stats.lastOriginalRetimerPts) &&
      originalPts > stats.lastOriginalRetimerPts) {
    const GstClockTime originalDelta = originalPts - stats.lastOriginalRetimerPts;
    const GstClockTime maxTrustedDelta = frameDuration * 3;
    const GstClockTime minTrustedDelta = frameDuration / 2;
    if (originalDelta >= minTrustedDelta && originalDelta <= maxTrustedDelta) {
      normalizedDelta = originalDelta;
    } else {
      stats.correctedPtsJumps += 1;
    }
  } else if (stats.hasLastRetimerPts) {
    stats.correctedPtsJumps += 1;
  }

  GstClockTime normalizedPts = stats.hasLastRetimerPts &&
      GST_CLOCK_TIME_IS_VALID(stats.lastNormalizedRetimerPts)
    ? stats.lastNormalizedRetimerPts + normalizedDelta
    : runningTime;

  /*
   * Si el reloj normalizado deriva demasiado respecto al running-time real,
   * reanclamos suavemente al frame actual. Esto evita que una ráfaga de PTS
   * raros vuelva a poner a identity en modo espera larga.
   */
  const GstClockTime maxDrift = frameDuration * 6;
  const bool tooFarBehind = normalizedPts + maxDrift < runningTime;
  const bool tooFarAhead = normalizedPts > runningTime + maxDrift;
  if (tooFarBehind || tooFarAhead) {
    normalizedPts = runningTime;
    stats.correctedPtsJumps += 1;
  }

  stats.lastOriginalRetimerPts = originalPts;
  stats.lastNormalizedRetimerPts = normalizedPts;
  stats.hasLastRetimerPts = true;
  stats.retimedFrames += 1;
  return normalizedPts;
}

void update_sync_buffer_ntp_alignment(
  WebRTCPeer* peer,
  GstClockTime referenceTimestamp,
  GstClockTime runningTime,
  bool timingActive)
{
  if (!peer || !bool_setting(g_context.ntpEnabled) ||
      !valid_source_index(peer->mixerSourceIndex) ||
      !GST_CLOCK_TIME_IS_VALID(referenceTimestamp) ||
      !GST_CLOCK_TIME_IS_VALID(runningTime)) {
    return;
  }

  double rawSourceAgeMs = 0.0;
  double sourceAgeMs = 0.0;
  double referenceAgeMs = 0.0;
  int targetDelayMs = 0;
  {
    std::lock_guard<std::mutex> alignmentLock(g_ntpAlignmentMutex);
    ensure_ntp_alignment_source_count_locked();
    if (!g_ntpAlignment.anchorValid) {
      g_ntpAlignment.anchorValid = true;
      g_ntpAlignment.anchorReferenceTimestamp = referenceTimestamp;
      g_ntpAlignment.anchorRunningTime = runningTime;
    }

    const gint64 referenceDelta =
      static_cast<gint64>(referenceTimestamp) -
      static_cast<gint64>(g_ntpAlignment.anchorReferenceTimestamp);
    const gint64 captureRunningTime =
      static_cast<gint64>(g_ntpAlignment.anchorRunningTime) + referenceDelta;
    const gint64 ageNs = static_cast<gint64>(runningTime) - captureRunningTime;
    rawSourceAgeMs = static_cast<double>(ageNs) / static_cast<double>(GST_MSECOND);

    const int sourceIndex = peer->mixerSourceIndex;
    sourceAgeMs = rawSourceAgeMs;
    if (g_ntpAlignment.peerAgeValid[sourceIndex]) {
      /*
       * Los Sender Reports nos dan una relacion profesional RTP->NTP, pero la
       * edad instantanea de cada frame tambien arrastra jitter de red, decoder
       * y planificacion del sistema. Si usamos esa muestra cruda, el manager
       * persigue el jitter y cambia el delay cada pocos cientos de ms. La media
       * exponencial convierte NTP en un offset lento entre camaras, que es lo
       * que necesitamos para sincronizacion multicamara trazable.
       */
      const double previousAgeMs = g_ntpAlignment.peerAgeMs[sourceIndex];
      sourceAgeMs =
        previousAgeMs +
        (rawSourceAgeMs - previousAgeMs) * g_context.ntpAgeSmoothingAlpha;
    }
    g_ntpAlignment.peerAgeValid[sourceIndex] = true;
    g_ntpAlignment.peerAgeMs[sourceIndex] = sourceAgeMs;

    referenceAgeMs = sourceAgeMs;
    for (int i = 0; i < source_count(); i++) {
      if (g_ntpAlignment.peerAgeValid[i]) {
        referenceAgeMs = std::max(referenceAgeMs, g_ntpAlignment.peerAgeMs[i]);
      }
    }

    const double rawDelayMs = std::max(0.0, referenceAgeMs - sourceAgeMs);
    targetDelayMs = std::min(
      int_setting(g_context.ntpMaxDelayMs, 0),
      round_delay_to_step(static_cast<int>(rawDelayMs)));
  }

  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  stats.lastNtpAgeMs = sourceAgeMs;
  stats.targetNtpDelayMs = targetDelayMs;

  if (!timingActive || !bool_setting(g_context.ntpApplyEnabled) || !peer->syncBufferQueue) {
    return;
  }

  const auto now = std::chrono::steady_clock::now();
  if (stats.lastNtpAdjustmentTime.time_since_epoch().count() != 0) {
    const int elapsedMs = static_cast<int>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
        now - stats.lastNtpAdjustmentTime).count());
    if (elapsedMs < int_setting(g_context.ntpAdjustIntervalMs, 0)) {
      return;
    }
  }

  const int nextDelayMs = std::clamp(
    targetDelayMs,
    std::max(0, stats.currentNtpDelayMs - int_setting(g_context.ntpMaxStepMs, 0)),
    std::min(
      int_setting(g_context.ntpMaxDelayMs, 0),
      stats.currentNtpDelayMs + int_setting(g_context.ntpMaxStepMs, 0)));

  if (std::abs(nextDelayMs - stats.currentNtpDelayMs) <
      int_setting(g_context.ntpMinStepMs, 1)) {
    return;
  }

  stats.currentNtpDelayMs = nextDelayMs;
  stats.lastNtpAdjustmentTime = now;
  stats.queueDelayMs = -1;
  if (bool_setting(g_context.clockGateEnabled)) {
    stats.clockGateOffsetMs = -1;
  }

  /*
   * Aplicamos el retardo relativo en la cola de decode. Con clock=off evitamos
   * que identity duerma por timestamps RTP irregulares, pero seguimos usando
   * la información profesional RTP/NTP para decidir qué cámara debe esperar.
   */
  update_sync_buffer_timing_state_locked(peer);
}

} // namespace

void set_sync_buffer_runtime_context(const SyncBufferRuntimeContext& context)
{
  g_context = context;
  std::lock_guard<std::mutex> alignmentLock(g_ntpAlignmentMutex);
  ensure_ntp_alignment_source_count_locked();
}

void reset_sync_buffer_ntp_alignment_state()
{
  std::lock_guard<std::mutex> alignmentLock(g_ntpAlignmentMutex);
  g_ntpAlignment = SyncBufferNtpAlignmentState{};
  ensure_ntp_alignment_source_count_locked();
}

bool resolve_sync_buffer_ntp_probe_context_media(
  SyncBufferNtpProbeContext* context,
  GstPad* observedPad)
{
  if (!context || context->mediaResolved) {
    return context && context->isVideo;
  }

  auto try_resolve_from_pad = [&](GstPad* pad) -> bool {
    guint32 detectedClockRate = 0;
    const std::string mediaLabel = describe_rtp_pad_caps(pad, &detectedClockRate);
    if (mediaLabel.find("media=unknown") != std::string::npos) {
      return false;
    }

    context->mediaResolved = true;
    context->isVideo = mediaLabel.find("media=video") != std::string::npos;
    context->mediaLabel = mediaLabel;
    context->clockRate = detectedClockRate;
    return true;
  };

  if (observedPad && try_resolve_from_pad(observedPad)) {
    // Caps ya disponibles en el pad observado por el probe.
  } else if (context->jitterBuffer) {
    GstPad* sinkPad = gst_element_get_static_pad(context->jitterBuffer, "sink");
    const bool resolvedFromSink = sinkPad && try_resolve_from_pad(sinkPad);
    if (sinkPad) {
      gst_object_unref(sinkPad);
    }

    if (!resolvedFromSink) {
      GstPad* srcPad = gst_element_get_static_pad(context->jitterBuffer, "src");
      if (srcPad) {
        try_resolve_from_pad(srcPad);
        gst_object_unref(srcPad);
      }
    }
  }

  if (context->mediaResolved && bool_setting(g_context.statsEnabled)) {
    const WebRTCPeer* peer = context->peer;
    gchar* elementName = context->jitterBuffer
      ? gst_element_get_name(context->jitterBuffer)
      : nullptr;
    printf("[SyncBufferNTP] %s fuente=%d jitterbuffer=%s media=%s %s\n",
      peer ? peer->peerId.c_str() : "peer desconocido",
      peer ? peer->mixerSourceIndex : -1,
      elementName ? elementName : "rtpjitterbuffer",
      context->mediaLabel.c_str(),
      context->isVideo ? "usado para sync" : "ignorado para sync");
    g_free(elementName);
  }

  return context->mediaResolved && context->isVideo;
}

void unmark_peer_decoded_for_sync_buffer_timing(WebRTCPeer* peer)
{
  if (!peer) {
    return;
  }

  std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
  if (!peer->syncBufferCountedAsDecodedPeer) {
    return;
  }

  peer->syncBufferCountedAsDecodedPeer = false;
  const int previousCount = decrement_decoded_peer_count();
  if (bool_setting(g_context.statsEnabled)) {
    printf("[SyncBufferState] %s fuente=%d deja de contar como decodificada; decoded-peers=%d/%d\n",
      peer->peerId.c_str(),
      peer->mixerSourceIndex,
      std::max(0, previousCount - 1),
      int_setting(g_context.minPeers, 1));
  }
}

GstPadProbeReturn on_sync_buffer_ntp_rtp_probe(
  GstPad* pad,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!bool_setting(g_context.ntpEnabled) ||
      !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  auto* context = static_cast<SyncBufferNtpProbeContext*>(userData);
  if (!context || !context->peer || context->peer->destroyed) {
    return GST_PAD_PROBE_OK;
  }

  if (!should_arm_sync_buffer_timing()) {
    return GST_PAD_PROBE_OK;
  }

  if (!resolve_sync_buffer_ntp_probe_context_media(context, pad)) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  GstRTPBuffer rtpBuffer = GST_RTP_BUFFER_INIT;
  if (!gst_rtp_buffer_map(buffer, GST_MAP_READ, &rtpBuffer)) {
    return GST_PAD_PROBE_OK;
  }

  const guint32 rtpTimestamp = gst_rtp_buffer_get_timestamp(&rtpBuffer);
  gst_rtp_buffer_unmap(&rtpBuffer);

  GstReferenceTimestampMeta* referenceMeta = get_ntp_reference_timestamp_meta(buffer);
  GstClockTime referenceTimestamp =
    referenceMeta && GST_CLOCK_TIME_IS_VALID(referenceMeta->timestamp)
      ? referenceMeta->timestamp
      : GST_CLOCK_TIME_NONE;
  bool usedReferenceMeta = GST_CLOCK_TIME_IS_VALID(referenceTimestamp);
  bool usedRtcpSrMapping = false;

  std::lock_guard<std::mutex> syncLock(context->peer->syncBufferMutex);
  if (!GST_CLOCK_TIME_IS_VALID(referenceTimestamp)) {
    usedRtcpSrMapping = compute_ntp_reference_from_rtcp_sr_locked(
      context->peer,
      rtpTimestamp,
      &referenceTimestamp);
  }

  if (!GST_CLOCK_TIME_IS_VALID(referenceTimestamp)) {
    return GST_PAD_PROBE_OK;
  }

  remember_ntp_rtp_mapping_locked(
    context->peer,
    GST_BUFFER_PTS(buffer),
    referenceTimestamp,
    rtpTimestamp);
  if (usedReferenceMeta) {
    context->peer->syncBufferDiagnostics.ntpRtpMetaPackets += 1;
  }
  if (usedRtcpSrMapping) {
    context->peer->syncBufferDiagnostics.ntpSrMappedPackets += 1;
  }

  if (bool_setting(g_context.statsEnabled) &&
      context->peer->syncBufferDiagnostics.ntpRtpMetaPackets +
      context->peer->syncBufferDiagnostics.ntpSrMappedPackets == 1) {
    printf("[SyncBufferNTP] %s fuente=%d primera referencia RTP/NTP (%s, origen=%s, pts=%" GST_TIME_FORMAT ")\n",
      context->peer->peerId.c_str(),
      context->peer->mixerSourceIndex,
      context->mediaLabel.c_str(),
      usedReferenceMeta ? "meta" : "rtcp-sr",
      GST_TIME_ARGS(GST_BUFFER_PTS(buffer)));
  }

  (void)pad;
  return GST_PAD_PROBE_OK;
}

void on_sync_buffer_ntp_handle_sync(
  GstElement* jitterBuffer,
  GstStructure* syncStructure,
  gpointer userData)
{
  if (!bool_setting(g_context.ntpEnabled)) {
    return;
  }

  auto* context = static_cast<SyncBufferNtpProbeContext*>(userData);
  if (!context || !context->peer || context->peer->destroyed) {
    return;
  }

  /*
   * Con una sola cámara el Sync Buffer debe ser casi transparente. Los Sender
   * Reports son útiles para sincronizar varias cámaras, pero leerlos y guardar
   * estado en cada evento RTCP mientras no hay nada que alinear introduce un
   * trabajo periódico exactamente en el caso base donde medimos fluidez.
   */
  if (!should_arm_sync_buffer_timing()) {
    return;
  }

  uint64_t syncEvents = 0;
  guint64 srExtRtpTime = 0;
  guint64 srNtpTime = 0;
  guint clockRate = 0;
  const bool hasSrMapping = syncStructure &&
    gst_structure_get_uint64(syncStructure, "sr-ext-rtptime", &srExtRtpTime) &&
    gst_structure_get_uint64(syncStructure, "sr-ntpnstime", &srNtpTime);
  if (syncStructure) {
    gst_structure_get_uint(syncStructure, "clock-rate", &clockRate);
  }

  resolve_sync_buffer_ntp_probe_context_from_clock_rate(
    context,
    static_cast<guint32>(clockRate),
    "handle-sync");

  if (!resolve_sync_buffer_ntp_probe_context_media(context, nullptr)) {
    return;
  }

  WebRTCPeer* peer = context->peer;

  {
    std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
    peer->syncBufferDiagnostics.ntpSyncEvents += 1;
    syncEvents = peer->syncBufferDiagnostics.ntpSyncEvents;
    if (hasSrMapping && srNtpTime > 0 && clockRate > 0) {
      peer->syncBufferDiagnostics.hasRtcpSrMapping = true;
      peer->syncBufferDiagnostics.srExtRtpTime = srExtRtpTime;
      peer->syncBufferDiagnostics.srNtpTime = static_cast<GstClockTime>(srNtpTime);
      peer->syncBufferDiagnostics.srClockRate = static_cast<guint32>(clockRate);
    }
  }

  /*
   * No imprimimos cada handle-sync: en pruebas reales puede llegar muchas veces
   * por segundo y el printf desde el hilo de streaming basta para congelar dos
   * cámaras. El contador aparece en el log agregado de SyncBuffer.
   */
  if (!bool_setting(g_context.statsEnabled) || syncEvents != 1) {
    return;
  }

  gchar* elementName = gst_element_get_name(jitterBuffer);
  printf("[SyncBufferNTP] %s fuente=%d primer RTCP SR jitterbuffer=%s "
         "clock=%u sr-rtp=%" G_GUINT64_FORMAT " sr-ntp=%" G_GUINT64_FORMAT "\n",
    peer->peerId.c_str(),
    peer->mixerSourceIndex,
    elementName ? elementName : "rtpjitterbuffer",
    clockRate,
    srExtRtpTime,
    srNtpTime);
  g_free(elementName);
}

GstPadProbeReturn on_sync_buffer_event_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!bool_setting(g_context.statsEnabled) ||
      !(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM)) {
    return GST_PAD_PROBE_OK;
  }

  WebRTCPeer* peer = static_cast<WebRTCPeer*>(userData);
  if (!peer || peer->destroyed) {
    return GST_PAD_PROBE_OK;
  }

  GstEvent* event = GST_PAD_PROBE_INFO_EVENT(info);
  if (!event || GST_EVENT_TYPE(event) != GST_EVENT_SEGMENT) {
    return GST_PAD_PROBE_OK;
  }

  const GstSegment* segment = nullptr;
  gst_event_parse_segment(event, &segment);
  if (!segment) {
    return GST_PAD_PROBE_OK;
  }

  {
    std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
    if (peer->syncBufferDiagnostics.segmentEventsLogged >= 4) {
      return GST_PAD_PROBE_OK;
    }
    peer->syncBufferDiagnostics.segmentEventsLogged += 1;
  }

  printf("[SyncBufferSegment] %s fuente=%d format=%s rate=%.3f start=%llu stop=%llu "
         "time=%llu base=%llu offset=%llu position=%llu\n",
    peer->peerId.c_str(),
    peer->mixerSourceIndex,
    gst_format_get_name(segment->format),
    segment->rate,
    static_cast<unsigned long long>(segment->start),
    static_cast<unsigned long long>(segment->stop),
    static_cast<unsigned long long>(segment->time),
    static_cast<unsigned long long>(segment->base),
    static_cast<unsigned long long>(segment->offset),
    static_cast<unsigned long long>(segment->position));

  return GST_PAD_PROBE_OK;
}

GstPadProbeReturn on_sync_buffer_prepare_buffer_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  WebRTCPeer* peer = static_cast<WebRTCPeer*>(userData);
  if (!peer || peer->destroyed) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  const GstClockTime frameDuration =
    gst_util_uint64_scale_int(
      GST_SECOND,
      g_context.frameRateDen,
      g_context.frameRateNum);
  const GstClockTime originalPts = GST_BUFFER_PTS(buffer);
  const bool hadValidPts = GST_CLOCK_TIME_IS_VALID(GST_BUFFER_PTS(buffer));
  const bool hadValidDuration =
    GST_CLOCK_TIME_IS_VALID(GST_BUFFER_DURATION(buffer)) && GST_BUFFER_DURATION(buffer) > 0;
  const GstClockTime currentRunningTime = get_peer_running_time(peer);
  bool timingWasArmedBeforeLock = false;
  {
    std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
    mark_peer_decoded_for_sync_buffer_timing_locked(peer);
    timingWasArmedBeforeLock = should_arm_sync_buffer_timing();
  }
  const bool shouldRetimerValidPts =
    hadValidPts && bool_setting(g_context.retimerEnabled) && timingWasArmedBeforeLock;

  if (timingWasArmedBeforeLock &&
      (!hadValidPts || !hadValidDuration || shouldRetimerValidPts)) {
    buffer = gst_buffer_make_writable(buffer);
    if (!buffer) {
      return GST_PAD_PROBE_OK;
    }
    GST_PAD_PROBE_INFO_DATA(info) = buffer;
  }

  std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
  const bool timingActive = update_sync_buffer_timing_state_locked(peer);
  const bool canRetimerThisBuffer = shouldRetimerValidPts && timingActive;
  if (!timingActive) {
    peer->syncBufferDiagnostics.timingBypassedFrames += 1;
    /*
     * Bypass real: con una sola cámara no fabricamos PTS/duración ni hacemos
     * writable el buffer. La versión anterior seguía tocando duración aunque
     * timing=off, y en raw 1080p eso puede implicar copias grandes y tirones.
     */
    return GST_PAD_PROBE_OK;
  }

  if (!hadValidPts) {
    if (!GST_CLOCK_TIME_IS_VALID(peer->syncBufferDiagnostics.nextSyntheticPts)) {
      peer->syncBufferDiagnostics.nextSyntheticPts = currentRunningTime;
    }
    GST_BUFFER_PTS(buffer) = peer->syncBufferDiagnostics.nextSyntheticPts;
    GST_BUFFER_DTS(buffer) = GST_CLOCK_TIME_NONE;
    peer->syncBufferDiagnostics.nextSyntheticPts += frameDuration;
    peer->syncBufferDiagnostics.missingPtsFrames += 1;
  } else {
    GstClockTime normalizedPts = GST_BUFFER_PTS(buffer);
    if (canRetimerThisBuffer) {
      normalizedPts = normalize_peer_pts_to_mixer_running_time_locked(
        peer,
        GST_BUFFER_PTS(buffer),
        currentRunningTime,
        frameDuration);
      GST_BUFFER_PTS(buffer) = normalizedPts;
      GST_BUFFER_DTS(buffer) = GST_CLOCK_TIME_NONE;
    }
    peer->syncBufferDiagnostics.nextSyntheticPts = normalizedPts + frameDuration;
  }

  if (!hadValidDuration) {
    GST_BUFFER_DURATION(buffer) = frameDuration;
  }

  if (bool_setting(g_context.ntpEnabled) && timingActive) {
    GstClockTime referenceTimestamp = GST_CLOCK_TIME_NONE;
    GstReferenceTimestampMeta* referenceMeta = get_ntp_reference_timestamp_meta(buffer);
    if (referenceMeta && GST_CLOCK_TIME_IS_VALID(referenceMeta->timestamp)) {
      referenceTimestamp = referenceMeta->timestamp;
      peer->syncBufferDiagnostics.ntpDecodedMetaFrames += 1;
      peer->syncBufferDiagnostics.lastReferenceTimestamp = referenceTimestamp;
    } else if (lookup_ntp_reference_for_pts_locked(
                 peer,
                 hadValidPts ? originalPts : GST_BUFFER_PTS(buffer),
                 &referenceTimestamp)) {
      peer->syncBufferDiagnostics.lastReferenceTimestamp = referenceTimestamp;
    }

    if (GST_CLOCK_TIME_IS_VALID(referenceTimestamp)) {
      update_sync_buffer_ntp_alignment(
        peer,
        referenceTimestamp,
        currentRunningTime,
        timingActive);
    } else {
      peer->syncBufferDiagnostics.ntpMissingFrames += 1;
    }
  }

  if (GST_BUFFER_FLAG_IS_SET(buffer, GST_BUFFER_FLAG_DISCONT)) {
    peer->syncBufferDiagnostics.discontFrames += 1;
  }

  return GST_PAD_PROBE_OK;
}

GstPadProbeReturn on_sync_buffer_released_buffer_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER)) {
    return GST_PAD_PROBE_OK;
  }

  WebRTCPeer* peer = static_cast<WebRTCPeer*>(userData);
  if (!peer || peer->destroyed) {
    return GST_PAD_PROBE_OK;
  }

  GstBuffer* buffer = GST_PAD_PROBE_INFO_BUFFER(info);
  if (!buffer) {
    return GST_PAD_PROBE_OK;
  }

  if (!bool_setting(g_context.statsEnabled) && !should_arm_sync_buffer_timing()) {
    return GST_PAD_PROBE_OK;
  }

  auto now = std::chrono::steady_clock::now();
  std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  stats.releasedFrames += 1;
  stats.releasedFramesSinceReport += 1;

  const GstClockTime pts = GST_BUFFER_PTS(buffer);
  int ptsDeltaMs = 0;
  if (GST_CLOCK_TIME_IS_VALID(pts) && stats.hasLastPts &&
      GST_CLOCK_TIME_IS_VALID(stats.lastPts) && pts >= stats.lastPts) {
    ptsDeltaMs = static_cast<int>((pts - stats.lastPts) / GST_MSECOND);
    stats.maxPtsDeltaMs = std::max(stats.maxPtsDeltaMs, ptsDeltaMs);
  }
  if (GST_CLOCK_TIME_IS_VALID(pts)) {
    stats.lastPts = pts;
    stats.hasLastPts = true;
  }

  int wallDeltaMs = 0;
  if (stats.lastWallTime.time_since_epoch().count() != 0) {
    wallDeltaMs = static_cast<int>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
        now - stats.lastWallTime).count());
    stats.maxWallDeltaMs = std::max(stats.maxWallDeltaMs, wallDeltaMs);
    if (ptsDeltaMs > 0) {
      stats.maxJitterMs = std::max(stats.maxJitterMs, std::abs(wallDeltaMs - ptsDeltaMs));
    }
  }
  stats.lastWallTime = now;

  if (!bool_setting(g_context.statsEnabled) || !stats.syncTimingActive) {
    return GST_PAD_PROBE_OK;
  }

  if (stats.lastReportTime.time_since_epoch().count() == 0) {
    stats.lastReportTime = now;
    return GST_PAD_PROBE_OK;
  }

  auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
    now - stats.lastReportTime).count();
  if (elapsedMs < g_context.diagnosticLogIntervalMs) {
    return GST_PAD_PROBE_OK;
  }

  guint queueLevelBuffers = 0;
  guint64 queueLevelTime = 0;
  if (peer->syncBufferQueue) {
    g_object_get(peer->syncBufferQueue,
      "current-level-buffers", &queueLevelBuffers,
      "current-level-time", &queueLevelTime,
      NULL);
  }

  const double outFps = elapsedMs > 0
    ? stats.releasedFramesSinceReport * 1000.0 / elapsedMs
    : 0.0;

  printf("[SyncBuffer] %s fuente=%d out=%.1ffps queue=%ubuf/%llums queue-delay=%dms "
         "target=%dms timing=%s peers=%d/%d clock=%s/%dms "
         "retime=%s/%lldms/%" PRIu64 " corrected=%" PRIu64 " "
         "bypass=%" PRIu64 " maxPtsDelta=%dms "
         "maxWallDelta=%dms maxJitter=%dms "
         "missingPts=%" PRIu64 " discont=%" PRIu64 " overruns=%" PRIu64 " "
         "ntp(sync=%" PRIu64 " rtpMeta=%" PRIu64 " srMap=%" PRIu64 " decodedMeta=%" PRIu64
         " mapped=%" PRIu64 " missing=%" PRIu64 " age=%.1fms delay=%d/%dms)\n",
    peer->peerId.c_str(),
    peer->mixerSourceIndex,
    outFps,
    queueLevelBuffers,
    static_cast<unsigned long long>(queueLevelTime / GST_MSECOND),
    stats.queueDelayMs,
    int_setting(g_context.latencyMs, 0),
    stats.syncTimingActive ? "on" : "off",
    stats.activePeerCount,
    int_setting(g_context.minPeers, 1),
    stats.clockGateActive ? "on" : "off",
    stats.clockGateOffsetMs,
    stats.hasRunningTimeOffset ? "on" : "off",
    static_cast<long long>(stats.runningTimeOffset / GST_MSECOND),
    stats.retimedFrames,
    stats.correctedPtsJumps,
    stats.timingBypassedFrames,
    stats.maxPtsDeltaMs,
    stats.maxWallDeltaMs,
    stats.maxJitterMs,
    stats.missingPtsFrames,
    stats.discontFrames,
    stats.queueOverruns,
    stats.ntpSyncEvents,
    stats.ntpRtpMetaPackets,
    stats.ntpSrMappedPackets,
    stats.ntpDecodedMetaFrames,
    stats.ntpMappedFrames,
    stats.ntpMissingFrames,
    stats.lastNtpAgeMs,
    stats.currentNtpDelayMs,
    stats.targetNtpDelayMs);

  stats.releasedFramesSinceReport = 0;
  stats.maxPtsDeltaMs = 0;
  stats.maxWallDeltaMs = 0;
  stats.maxJitterMs = 0;
  stats.lastReportTime = now;

  return GST_PAD_PROBE_OK;
}

void on_sync_buffer_queue_overrun(GstElement* /*queue*/, gpointer userData)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(userData);
  if (!peer || peer->destroyed) {
    return;
  }

  std::lock_guard<std::mutex> syncLock(peer->syncBufferMutex);
  SyncBufferDiagnosticsState& stats = peer->syncBufferDiagnostics;
  stats.queueOverruns += 1;
  if (bool_setting(g_context.statsEnabled) && stats.queueOverrunLogs < 10) {
    guint queueLevelBuffers = 0;
    guint64 queueLevelTime = 0;
    g_object_get(peer->syncBufferQueue,
      "current-level-buffers", &queueLevelBuffers,
      "current-level-time", &queueLevelTime,
      NULL);
    stats.queueOverrunLogs += 1;
    printf("[SyncBufferOverrun] %s fuente=%d overruns=%" PRIu64
           " queue=%ubuf/%llums timing=%s clock=%s/%dms\n",
      peer->peerId.c_str(),
      peer->mixerSourceIndex,
      stats.queueOverruns,
      queueLevelBuffers,
      static_cast<unsigned long long>(queueLevelTime / GST_MSECOND),
      stats.syncTimingActive ? "on" : "off",
      stats.clockGateActive ? "on" : "off",
      stats.clockGateOffsetMs);
  }
}
