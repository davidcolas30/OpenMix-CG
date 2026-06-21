#!/usr/bin/env bash
set -euo pipefail

# Perfilador externo del proceso Main de Electron.
#
# Uso:
#   1. Arrancar OpenMix-CG con OPENMIX_CPU_MONITOR=on.
#   2. Conectar la camara y esperar a que el uso de CPU se estabilice.
#   3. Ejecutar: scripts/perf/sample-main.sh 20 ab-native-monitors
#
# El script toma el ultimo pid escrito por cpuMonitorService y ejecuta
# /usr/bin/sample fuera de Electron. Asi medimos donde consume CPU el Main
# sin meter timers nuevos dentro del plano de media.

DURATION_SECONDS="${1:-20}"
PROFILE_LABEL="${2:-${OPENMIX_PROFILE_LABEL:-main}}"
LOG_FILE="${OPENMIX_CPU_MONITOR_LOG:-$HOME/Library/Application Support/openmix-cg/logs/electron-cpu-monitor.log}"
PROFILE_DIR="${OPENMIX_PROFILE_DIR:-$HOME/Library/Application Support/openmix-cg/logs/profiles}"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No existe el log de CPU: $LOG_FILE" >&2
  echo "Arranca la app con OPENMIX_CPU_MONITOR=on antes de perfilar." >&2
  exit 1
fi

MAIN_PID="$(
  awk '
    /^# pid=/ {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^pid=/) {
          sub(/^pid=/, "", $i)
          print $i
        }
      }
    }
  ' "$LOG_FILE" | tail -n 1
)"

if [[ -z "$MAIN_PID" ]]; then
  echo "No se ha encontrado pid en $LOG_FILE" >&2
  exit 1
fi

if ! kill -0 "$MAIN_PID" 2>/dev/null; then
  echo "El pid $MAIN_PID ya no esta vivo. Repite la prueba con la app abierta." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
SAFE_LABEL="$(
  printf '%s' "$PROFILE_LABEL" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//'
)"
if [[ -z "$SAFE_LABEL" ]]; then
  SAFE_LABEL="main"
fi

OUTPUT_FILE="$PROFILE_DIR/main-sample-$STAMP-$SAFE_LABEL.txt"
SUMMARY_FILE="$PROFILE_DIR/main-sample-$STAMP-$SAFE_LABEL.summary.txt"

echo "Perfilando Main pid=$MAIN_PID durante ${DURATION_SECONDS}s..."
/usr/bin/sample "$MAIN_PID" "$DURATION_SECONDS" -file "$OUTPUT_FILE"
echo "Perfil guardado en: $OUTPUT_FILE"

if [[ -x "$(dirname "$0")/summarize-main-sample.sh" ]]; then
  "$(dirname "$0")/summarize-main-sample.sh" "$OUTPUT_FILE" > "$SUMMARY_FILE"
  echo "Resumen guardado en: $SUMMARY_FILE"
fi
