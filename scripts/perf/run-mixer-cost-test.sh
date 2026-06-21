#!/usr/bin/env bash
set -euo pipefail

# Ejecuta pruebas A/B de coste del plano de media.
#
# La idea es subir la complejidad de una en una:
#   decode-only      -> WebRTC + depay/parse/vtdec, sin ramas de monitor.
#   normalize-only   -> decode + rama monitor 540p, sin compositores visibles.
#   compositor-dry   -> decode + rama monitor + compositores PGM/PVW, sin UI.
#   native-monitors  -> ruta operativa con monitores nativos PGM/PVW.
#   ab-compositor-*  -> misma escalera usando OPENMIX_MONITOR_RENDERER=ab-compositor.
#   ab-format-*      -> aisla conversiones I420/BGRA dentro del compositor A/B.
#   gl-*             -> mismo A/B, pero PGM/PVW usan glvideomixer experimental.
#   gl-zero-copy-*   -> variante GL que conserva GLMemory hasta glimagesink.
#   *-trace          -> igual que su modo base, pero con trazas de spikes HTML.
#
# Uso:
#   scripts/perf/run-mixer-cost-test.sh decode-only
#
# Perfilado opcional del Main:
#   OPENMIX_PERF_SAMPLE_AFTER_SECONDS=45 \
#   OPENMIX_PERF_SAMPLE_DURATION_SECONDS=20 \
#   scripts/perf/run-mixer-cost-test.sh ab-compositor-dry

MODE="${1:-decode-only}"
LOG_DIR="${OPENMIX_PERF_LOG_DIR:-$HOME/Library/Application Support/openmix-cg/logs/perf-runs}"
STAMP="$(date +%Y%m%d-%H%M%S)"

COMMON_ENV=(
  OPENMIX_CPU_MONITOR="${OPENMIX_CPU_MONITOR:-on}"
  OPENMIX_CPU_MONITOR_INTERVAL_MS="${OPENMIX_CPU_MONITOR_INTERVAL_MS:-2000}"
  OPENMIX_CPU_MONITOR_SESSIONS="${OPENMIX_CPU_MONITOR_SESSIONS:-8}"
  OPENMIX_WEBRTC_STANDALONE_RX=off
  OPENMIX_MOBILE_PROFILE="${OPENMIX_MOBILE_PROFILE:-fullhd}"
  OPENMIX_MOBILE_QUALITY_MODE="${OPENMIX_MOBILE_QUALITY_MODE:-recording}"
  OPENMIX_MOBILE_BITRATE_MODE="${OPENMIX_MOBILE_BITRATE_MODE:-cap}"
  OPENMIX_MOBILE_TRANSPORT_CC="${OPENMIX_MOBILE_TRANSPORT_CC:-on}"
  OPENMIX_MOBILE_AUDIO="${OPENMIX_MOBILE_AUDIO:-off}"
  OPENMIX_MOBILE_PREVIEW="${OPENMIX_MOBILE_PREVIEW:-off}"
  OPENMIX_MOBILE_CADENCE_MONITOR="${OPENMIX_MOBILE_CADENCE_MONITOR:-off}"
  OPENMIX_MOBILE_STATS="${OPENMIX_MOBILE_STATS:-off}"
  OPENMIX_MOBILE_STATS_LOG="${OPENMIX_MOBILE_STATS_LOG:-off}"
  OPENMIX_WEBRTC_RX_STATS="${OPENMIX_WEBRTC_RX_STATS:-off}"
  OPENMIX_WEBRTC_H264_DECODER=hardware
  OPENMIX_MONITOR_RENDERER=compositor
  OPENMIX_MONITOR_IPC=none
  OPENMIX_COMBINED_MONITOR=off
  OPENMIX_THUMBNAILS=off
  OPENMIX_MULTIVIEW=off
  OPENMIX_GRAPHICS_BRANCHES=off
  OPENMIX_GRAPHICS_OVERLAY_PUMP=off
  OPENMIX_REALTIME_DIAGNOSTICS=off
  OPENMIX_STUTTER_TRACE=off
  OPENMIX_RTP_TIMELINE_TRACE=off
)

case "$MODE" in
  decode-only)
    MODE_ENV=(
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=off
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=none
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  normalize-only)
    MODE_ENV=(
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=none
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  compositor-dry)
    MODE_ENV=(
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  native-monitors)
    MODE_ENV=(
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
    )
    ;;

  ab-compositor-dry)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  ab-native-monitors)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
    )
    ;;

  ab-format-bgra-output)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_FORMAT=bgra
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  ab-format-i420)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_FORMAT=i420
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  ab-format-i420-base-bgra-gfx)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_FORMAT=i420-base-bgra-graphics
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=active
    )
    ;;

  ab-native-monitors-i420-base-bgra-gfx)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_FORMAT=i420-base-bgra-graphics
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=active
    )
    ;;

  ab-native-monitors-graphics-static)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=active
    )
    ;;

  ab-native-monitors-graphics-ticker)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=always
    )
    ;;

  ab-recording)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
    )
    ;;

  gl-compositor-dry)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=none
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=inline
      OPENMIX_NATIVE_MONITOR_WINDOWS=off
    )
    ;;

  gl-native-monitors)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
    )
    ;;

  gl-zero-copy-native-monitors)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl
      OPENMIX_MONITOR_GL_ZERO_COPY=on
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
    )
    ;;

  gl-zero-copy-native-monitors-graphics)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl
      OPENMIX_MONITOR_GL_ZERO_COPY=on
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=active
    )
    ;;

  gl-zero-copy-native-monitors-graphics-trace)
    MODE_ENV=(
      OPENMIX_MONITOR_RENDERER=ab-compositor
      OPENMIX_MONITOR_COMPOSITOR_BACKEND=gl
      OPENMIX_MONITOR_GL_ZERO_COPY=on
      OPENMIX_WEBRTC_RTP_DIRECT_SINK=off
      OPENMIX_WEBRTC_DECODE_BRANCH=on
      OPENMIX_WEBRTC_MONITOR_BRANCH=on
      OPENMIX_MONITOR_TARGETS=preview,program
      OPENMIX_MONITOR_INPUTS=both
      OPENMIX_BIG_MONITORS_SURFACE=native
      OPENMIX_NATIVE_MONITOR_WINDOWS=on
      OPENMIX_NATIVE_MONITOR_SINK=glimagesink
      OPENMIX_NATIVE_MONITOR_SYNC=off
      OPENMIX_GRAPHICS_BRANCHES=on
      OPENMIX_GRAPHICS_OVERLAY_PUMP=active
      OPENMIX_GRAPHICS_SPIKE_TRACE=on
    )
    ;;

  *)
    echo "Modo no reconocido: $MODE" >&2
    echo "Modos validos: decode-only, normalize-only, compositor-dry, native-monitors, ab-compositor-dry, ab-native-monitors, ab-format-bgra-output, ab-format-i420, ab-format-i420-base-bgra-gfx, ab-native-monitors-i420-base-bgra-gfx, ab-native-monitors-graphics-static, ab-native-monitors-graphics-ticker, ab-recording, gl-compositor-dry, gl-native-monitors, gl-zero-copy-native-monitors, gl-zero-copy-native-monitors-graphics, gl-zero-copy-native-monitors-graphics-trace" >&2
    exit 1
    ;;
esac

echo "[perf] Ejecutando prueba: $MODE"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$STAMP-$MODE.log"
echo "[perf] Log de esta prueba: $LOG_FILE"

if [[ -n "${OPENMIX_PERF_SAMPLE_AFTER_SECONDS:-}" ]]; then
  SAMPLE_AFTER_SECONDS="$OPENMIX_PERF_SAMPLE_AFTER_SECONDS"
  SAMPLE_DURATION_SECONDS="${OPENMIX_PERF_SAMPLE_DURATION_SECONDS:-20}"
  echo "[perf] Perfil automatico: sample Main en ${SAMPLE_AFTER_SECONDS}s durante ${SAMPLE_DURATION_SECONDS}s"
  (
    sleep "$SAMPLE_AFTER_SECONDS"
    OPENMIX_PROFILE_LABEL="$MODE" scripts/perf/sample-main.sh "$SAMPLE_DURATION_SECONDS" "$MODE"
  ) &
fi

env "${COMMON_ENV[@]}" "${MODE_ENV[@]}" pnpm dev 2>&1 | tee "$LOG_FILE"
exit "${PIPESTATUS[0]}"
