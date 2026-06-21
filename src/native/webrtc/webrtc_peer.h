#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <chrono>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "monitor_diagnostics.h"

struct SyncBufferDiagnosticsState {
  struct NtpRtpMapping {
    GstClockTime pts = GST_CLOCK_TIME_NONE;
    GstClockTime referenceTimestamp = GST_CLOCK_TIME_NONE;
    guint32 rtpTimestamp = 0;
  };

  uint64_t releasedFrames = 0;
  uint64_t releasedFramesSinceReport = 0;
  uint64_t missingPtsFrames = 0;
  uint64_t discontFrames = 0;
  uint64_t queueOverruns = 0;
  uint64_t ntpSyncEvents = 0;
  uint64_t ntpRtpMetaPackets = 0;
  uint64_t ntpSrMappedPackets = 0;
  uint64_t ntpDecodedMetaFrames = 0;
  uint64_t ntpMappedFrames = 0;
  uint64_t ntpMissingFrames = 0;
  uint64_t timingBypassedFrames = 0;
  uint64_t segmentEventsLogged = 0;
  uint64_t queueOverrunLogs = 0;
  bool hasRtcpSrMapping = false;
  guint64 srExtRtpTime = 0;
  GstClockTime srNtpTime = GST_CLOCK_TIME_NONE;
  guint32 srClockRate = 0;
  bool hasLastPts = false;
  GstClockTime lastPts = GST_CLOCK_TIME_NONE;
  GstClockTime nextSyntheticPts = GST_CLOCK_TIME_NONE;
  bool hasRunningTimeOffset = false;
  gint64 runningTimeOffset = 0;
  GstClockTime firstOriginalPts = GST_CLOCK_TIME_NONE;
  GstClockTime firstNormalizedPts = GST_CLOCK_TIME_NONE;
  bool hasLastRetimerPts = false;
  GstClockTime lastOriginalRetimerPts = GST_CLOCK_TIME_NONE;
  GstClockTime lastNormalizedRetimerPts = GST_CLOCK_TIME_NONE;
  uint64_t retimedFrames = 0;
  uint64_t correctedPtsJumps = 0;
  bool syncTimingActive = false;
  bool hasClockGateState = false;
  bool clockGateActive = false;
  bool clockSingleSegmentActive = false;
  int clockGateOffsetMs = 0;
  bool hasQueueState = false;
  bool queueTimingActive = false;
  int queueDelayMs = 0;
  int queueMaxTimeMs = 0;
  int activePeerCount = 0;
  GstClockTime lastReferenceTimestamp = GST_CLOCK_TIME_NONE;
  int maxPtsDeltaMs = 0;
  int maxWallDeltaMs = 0;
  int maxJitterMs = 0;
  double lastNtpAgeMs = 0.0;
  int currentNtpDelayMs = 0;
  int targetNtpDelayMs = 0;
  std::chrono::steady_clock::time_point lastWallTime = {};
  std::chrono::steady_clock::time_point lastReportTime = {};
  std::chrono::steady_clock::time_point lastNtpAdjustmentTime = {};
  std::deque<NtpRtpMapping> ntpMappings;
};

struct WebRTCPeer;

struct SyncBufferNtpProbeContext {
  WebRTCPeer* peer = nullptr;
  GstElement* jitterBuffer = nullptr;
  bool mediaResolved = false;
  bool isVideo = false;
  std::string mediaLabel;
  guint32 clockRate = 0;
};

/**
 * Estado de un peer WebRTC.
 * Cada cámara móvil conectada tiene su propia instancia con su
 * pipeline GStreamer independiente.
 */
struct WebRTCPeer {
  std::string peerId;
  GstElement* pipeline;       // Bin dinámico del peer o pipeline standalone
  GstElement* webrtcbin;      // webrtcbin: gestiona DTLS-SRTP, ICE, RTP
  int mixerSourceIndex;       // Fuente dedicada del mixer a la que empuja este peer
  bool standalonePipeline;    // True en diagnostico WebRTC sin mixer
  GstElement* mixerSelector;  // selector dedicado para monitorización PGM/PVW
  GstPad* mixerSelectorPad;   // pad sink solicitado al selector de monitor
  GstElement* mixerRecordingSelector; // selector dedicado para REC/Program master
  GstPad* mixerRecordingSelectorPad;  // pad sink solicitado al selector de REC
  GstElement* recordingBranchValve;   // cierra la rama 1080p del peer cuando REC está apagado
  GstElement* syncBufferQueue;         // buffer posterior a decode para suavizar ráfagas
  GstElement* syncBufferClock;         // identity(sync=true) que libera contra GstClock
  bool syncBufferCountedAsDecodedPeer; // true tras ver al menos un frame decodificado

  // ThreadSafeFunctions para comunicar de vuelta a JavaScript:
  // - onAnswerTsfn: envía la SDP answer cuando GStreamer la genera
  // - onIceCandidateTsfn: envía ICE candidates generados por webrtcbin
  Napi::ThreadSafeFunction onAnswerTsfn;
  Napi::ThreadSafeFunction onIceCandidateTsfn;

  // Contadores de diagnóstico de entrada WebRTC por peer.
  int bridgeFrameCount;
  int bridgeLastBufSize;
  int bridgeDroppedCorruptCount;
  int bridgeDiscontCount;
  int bridgePushErrorCount;
  int bridgeSamplesSinceLastReport;
  int bridgePushedSinceLastReport;
  std::chrono::steady_clock::time_point bridgeLastReportTime;
  int h264KeyframeTraceCount;
  std::chrono::steady_clock::time_point h264LastKeyframeTraceTime;
  std::mutex diagnosticsMutex;
  std::vector<GstElement*> rtpJitterBuffers;
  std::vector<std::unique_ptr<RtpJitterBufferTimelineProbes>> rtpJitterTimelineProbes;
  std::vector<std::unique_ptr<SyncBufferNtpProbeContext>> syncBufferNtpProbeContexts;
  std::mutex syncBufferMutex;
  SyncBufferDiagnosticsState syncBufferDiagnostics;

  bool hasVideoTrack;         // True cuando on_webrtc_pad_added ha conectado vídeo
  bool destroyed;             // Flag para evitar callbacks tras destrucción
};
