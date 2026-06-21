# ADR-0002 — Decodificación hardware H.264 en macOS con vtdec y PLI periódico

Estado: aceptada
Fecha: 2026-04-25

## Contexto

Tras estabilizar la rama H.264 explícita (ADR-0001), el sistema funcionaba correctamente con 1 cámara a 1080p30 usando `avdec_h264` (software). Sin embargo, surgieron tres problemas:

1. **Pixelación persistente con movimiento**: La imagen mostraba artefactos de macro-bloques al mover la cámara, sobre todo durante los primeros 10-15 segundos.
2. **Solo 1 keyframe por sesión**: Chrome ignora `keyFrameInterval` en `RTCRtpEncodingParameters`, el móvil solo envía 1 IDR. Cualquier corrupción intermedia no se recupera.
3. **Carga de CPU en MacBook Air M4**: La decodificación software a 1080p30 consume núcleos de CPU que preferimos reservar para el compositor y el Renderer.

## Causas raíz

### Pixelación con movimiento
- El encoder WebRTC arranca con bitrate bajo (278kbps para 1080p) y sube gradualmente.
- A ese bitrate, H.264 no tiene suficiente información para codificar movimiento sin artefactos.
- El control de congestión de WebRTC (`avail`) estima el ancho de banda disponible de forma conservadora al inicio.
- `minBitrate` en `RTCRtpEncodingParameters` NO anula la estimación de congestión — el encoder usa `min(minBitrate, estimatedBandwidth)`.

### Solo 1 keyframe
- `keyFrameInterval` en `RTCRtpEncodingParameters` NO está soportado por Chrome.
- Sin keyframes periódicos, si el primer IDR llega corrupto o se pierde, todos los P-frames posteriores se degradan.
- El receptor GStreamer (`rtph264depay request-keyframe=true`) solo envía PLI cuando detecta pérdida RTP, pero la red local no pierde paquetes, así que nunca solicita nuevos IDR.

## Decisión

### 1. Usar `vtdec` (VideoToolbox) en macOS

En la rama H.264 explícita, sustituimos `avdec_h264` por `vtdec` cuando compilamos en `__APPLE__`:

```cpp
#ifdef __APPLE__
  GstElement* decoder = gst_element_factory_make("vtdec", NULL);
#else
  GstElement* decoder = gst_element_factory_make("avdec_h264", NULL);
#endif
```

`videoconvert` se coloca inmediatamente después del decoder para copiar desde IOSurface a RAM. `videoscale` va después.

### 2. Timer PLI periódico en GStreamer

Añadimos un timer que envía `GstForceKeyUnit` (RTCP PLI) a cada peer WebRTC activo cada 2 segundos:

```cpp
// Evento upstream que webrtcbin traduce a RTCP PLI
GstEvent* event = gst_event_new_custom(GST_EVENT_CUSTOM_UPSTREAM,
  gst_structure_new("GstForceKeyUnit",
    "all-headers", G_TYPE_BOOLEAN, TRUE, NULL));
gst_element_send_event(peer->webrtcbin, event);
```

Esto fuerza al emisor móvil a generar un IDR nuevo cada 2 segundos, garantizando que:
- Si el primer IDR llega corrupto, la imagen se recupera en 2 segundos máximo.
- Si hay pérdida RTP intermitente, el decoder se resincuena periódicamente.
- Los `skip` en la UI se reducen porque vtdec libera CPU del Main Process.

### 3. `keyFrameInterval` eliminado del cliente móvil

Se eliminó `keyFrameInterval: 2` de los perfiles de vídeo porque Chrome lo ignora completamente. La función de keyframes periódicos ahora la cumple el timer PLI del receptor GStreamer.

### 4. `minBitrate` mantenido en todos los perfiles

Se mantuvo `minBitrate` en todos los perfiles (800kbps, 2Mbps, 4Mbps) como límite inferior aunque el control de congestión pueda anularlo. En Chrome Android, `minBitrate` ayuda a que el encoder no baje demasiado en ráfagas cortas.

## Que NO se hizo

Se descartó limitar el renderizado del canvas a 20fps. PGM y PVW deben mostrarse a 30fps estables; cualquier throttling intencional degrada la calidad de monitorización.

## Consecuencias

- En macOS, la decodificación H.264 pasa a la Media Engine, liberando CPU.
- Keyframes periódicos cada 2 segundos garantizan recuperación ante corrupción.
- El pipeline sigue siendo funcional en Linux/Windows gracias al fallback a `avdec_h264`.
- El bitrate bajo al inicio sigue siendo un comportamiento normal de WebRTC (estimación conservadora de ancho de banda).

## Trabajo siguiente

- Verificar en logs que `keyframes` incrementa cada 2 segundos tras el timer PLI.
- Medir uso de CPU con 1, 2 y 3 cámaras a 1080p30 con `vtdec`.
- Si el bitrate bajo al inicio sigue siendo problemático, explorar modificar la SDP answer para incluir `b=AS:4000` como hint de ancho de banda.
