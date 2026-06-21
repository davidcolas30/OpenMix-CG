#!/usr/bin/env bash
set -euo pipefail

# Resume informes de /usr/bin/sample generados para el Main de Electron.
#
# Este resumen no sustituye al informe completo: solo extrae las hojas de stack
# mas frecuentes y las agrupa por libreria para orientar la siguiente hipotesis.

SAMPLE_FILE="${1:-}"

if [[ -z "$SAMPLE_FILE" || ! -f "$SAMPLE_FILE" ]]; then
  echo "Uso: scripts/perf/summarize-main-sample.sh <main-sample.txt>" >&2
  exit 1
fi

echo "# Resumen de perfil Main"
echo
echo "Archivo: $SAMPLE_FILE"
echo

awk '
  /^Analysis of sampling/ || /^Process:/ || /^Path:/ || /^Date\/Time:/ || /^OS Version:/ {
    print
  }
' "$SAMPLE_FILE"

echo
echo "## Top leaf stacks"
echo

awk '
  /^Sort by top of stack/ {
    in_section = 1
    next
  }
  in_section && /^Binary Images:/ {
    exit
  }
  in_section && /^[[:space:]]*[^[:space:]].*[[:space:]][0-9]+$/ {
    sub(/^[[:space:]]+/, "")
    print
  }
' "$SAMPLE_FILE" | head -n 35

echo
echo "## Agrupacion por binario"
echo

awk '
  /^Sort by top of stack/ {
    in_section = 1
    next
  }
  in_section && /^Binary Images:/ {
    exit
  }
  in_section && /^[[:space:]]*[^[:space:]].*[[:space:]][0-9]+$/ {
    count = $NF + 0
    binary = "desconocido"
    if (match($0, /\(in [^)]+\)/)) {
      binary = substr($0, RSTART + 4, RLENGTH - 5)
    }
    totals[binary] += count
  }
  END {
    for (binary in totals) {
      print totals[binary], binary
    }
  }
' "$SAMPLE_FILE" | sort -nr | head -n 30

echo
echo "## Pistas rapidas"
echo

if grep -Eiq 'gst|gstreamer|compositor|videoconvert|videoscale|glvideo|vtdec|VideoToolbox|rtp|webrtc|srtp|nice|libnice|ThreadSafeFunction|node|uv_|Electron' "$SAMPLE_FILE"; then
  grep -Eih 'gst|gstreamer|compositor|videoconvert|videoscale|glvideo|vtdec|VideoToolbox|rtp|webrtc|srtp|nice|libnice|ThreadSafeFunction|node|uv_|Electron' "$SAMPLE_FILE" \
    | sed -E 's/^[[:space:]]+//' \
    | head -n 80
else
  echo "No se han encontrado simbolos obvios de GStreamer/WebRTC/Node en el informe."
fi
