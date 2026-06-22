# Detalles operativos de GStreamer

Esta nota conserva detalles de diagnóstico, rendimiento y compatibilidad que no
forman parte del recorrido principal del módulo de arquitectura
[02-gstreamer-y-mixer.md](../Arquitectura/02-gstreamer-y-mixer.md).

Su objetivo es documentar por qué existen ciertas guardas y qué conclusiones se
obtuvieron durante la validación, sin sobrecargar la explicación principal del
mixer.

## Rutas de monitorización evaluadas

La arquitectura objetivo mantiene Program y Preview grandes en superficies
nativas de GStreamer. Durante la validación se compararon otras rutas para
separar coste, latencia y complejidad.

| Ruta | Encaje | Uso en la versión publicada |
| --- | --- | --- |
| IPC de frames | Facil de depurar, pero mueve demasiada media por Electron | Diagnóstico o compatibilidad |
| WebRTC local hacia Renderer | Evita IPC crudo, pero anade encode/decode y latencia | Fallback/A-B |
| Sink nativo (`glimagesink`) | Mantiene la presentación en GStreamer | Ruta preferente |
| WebCodecs | Interesante como transporte codificado local | No integrado |
| Shared memory / shared texture | Reduce copias si se implementa por plataforma | Línea experimental para grafismo |
| HLS/DASH local | Fácil de servir | Latencia excesiva para realización |

La conclusión es que la salida del realizador debe seguir en el plano de media.
El renderer puede controlar layout y operaciones, pero no debe recibir cada
frame grande como mensaje.

## Multiview

La multiview se validó como salida reducida, no como salida final. Los puntos de
ajuste principales son:

- `OPENMIX_MULTIVIEW_SOURCE_FPS`: limita la cadencia de cada slot antes de
  escalar y convertir.
- `OPENMIX_MULTIVIEW_ACTIVE_SLOTS`: abre solo las ramas con media real.
- `OPENMIX_MULTIVIEW_BARS=static`: evita procesar una fuente SMPTE live 1080p
  solo para mostrar un placeholder.
- `OPENMIX_MULTIVIEW_HUD`: dibuja nombres y bordes dentro del frame mediante
  `cairooverlay`.

Las barras estáticas reducen trabajo respecto a una fuente live, pero no son
coste cero: el mosaico sigue entregando frames y el overlay sigue formando parte
de la composición. Si la multiview vuelve a ser un cuello de botella, el frente
natural es cachear mejor el fondo/HUD o replantear la composición del mosaico,
no reducir la calidad de las cámaras.

## Sync Buffer y pulso con una cámara

Durante la integración del Sync Buffer aparecio un pulso visual con una sola
cámara. La lectura correcta fue separar la baseline de una cámara del caso
multicámara:

- una sola cámara no debe sincronizarse contra otra;
- los diagnósticos periódicos pueden alterar la cadencia observada;
- `identity sync=true` y `single-segment=true` pueden modificar el timing aunque
  parezcan elementos pasantes;
- el manager debe permanecer en bypass real hasta que haya suficientes peers
  decodificados.

La baseline recomendada para investigar tirones es:

1. desactivar diagnósticos y stats periódicas;
2. probar una sola cámara con calidad móvil estable;
3. activar dos cámaras;
4. activar NTP apply solo cuando la base sea fluida.

Esta regla evita atribuir a bitrate, Wi-Fi o encoder móvil un problema creado
por la capa de sincronización.

## REC nativo

La grabación usa una rama dinámica dentro del pipeline. Estas protecciones son
las más relevantes:

- el muxer recibe segmentos normalizados para que cada fichero empiece en
  `t=0`;
- las `valve` de fuentes cerradas conservan eventos sticky (`CAPS`, `SEGMENT`)
  para no abrir REC sin contexto;
- `videorate` y `frame gate` evitan que backlog o ráfagas generen duración
  extra en el MP4;
- el grafismo de Program se mezcla desde una cache BGRA antes del encoder;
- las colas comprimidas antes del muxer no son `leaky`, porque tirar paquetes
  H.264/AAC puede romper referencias;
- STOP REC corta buffers nuevos y envía EOS al muxer para escribir el índice
  final del contenedor.

La desconexión de una cámara no detiene REC. El slot puede pasar a negro o a
otra fuente. En cambio, al apagar el mixer o cerrar la aplicación, REC debe
cerrarse antes de destruir el pipeline.

## Variables de diagnóstico útiles

| Variable | Uso |
| --- | --- |
| `OPENMIX_MONITOR_IPC=both|pgm|pvw|none` | Medir el coste de extraer PGM/PVW hacia JS |
| `OPENMIX_MONITOR_CALLBACKS=on|off` | Separar coste de producir frames y coste de callbacks |
| `OPENMIX_MONITOR_INPUTS=both|none` | Cerrar entradas de monitor antes del compositor |
| `OPENMIX_MONITOR_COMPOSITORS=on|off` | Bloquear compositores PGM/PVW para medir coste base |
| `OPENMIX_THUMBNAILS=on|off` | Aislar coste de miniaturas |
| `OPENMIX_WEBRTC_MONITOR_BRANCH=on|off` | Aislar rama monitor WebRTC tras decode |
| `OPENMIX_WEBRTC_DECODE_BRANCH=on|off` | Separar recepción RTP/H264 y decode |
| `OPENMIX_RECORDING_H264_ENCODER=hardware|software` | Forzar encoder para aislar VideoToolbox/x264 |
| `OPENMIX_RECORDING_FRAME_GATE_LOG=on` | Registrar decisiones del frame gate de REC |
| `OPENMIX_SYNC_BUFFER_STATS=on` | Medir cola, fps y discontinuidades del Sync Buffer |

Estas opciones son herramientas de validación. No describen el flujo normal de
operación del producto.

## Mediciones orientativas

Las mediciones varían según equipo, cámara y red. En las pruebas de validación
en macOS, los patrones relevantes fueron:

- los compositores live de monitorización tienen coste apreciable aunque haya
  pocas fuentes visibles;
- cerrar IPC de monitores afecta más al renderer que al coste nativo del mixer;
- multiview suma coste por la construcción del mosaico, no solo por la
  superficie final;
- el perfil operativo con multiview nativa a 15fps, HUD activo y barras
  estáticas fue el equilibrio validado para la versión publicada.

Estas cifras no deben leerse como garantías universales, sino como evidencias
que justifican las decisiones de arquitectura.

## Grafismo permanente

Una producción real puede mantener grafismos persistentes como una mosca de
canal. No todos los overlays tienen el mismo perfil:

| Tipo | Perfil temporal | Ruta candidata |
| --- | --- | --- |
| Mosca | Entrada/salida animada; estable al aire | Overlay cacheado |
| Lower third | Animacion corta; lectura estable | Overlay cacheado tras animacion |
| Ticker | Movimiento continuo | Renderer especializado o banda optimizada |

La optimización no consiste en eliminar grafismo, sino en evitar que un overlay
simple obligue a pagar el coste máximo de composición general en cada frame.
