# Detalles operativos de GStreamer

Esta nota conserva detalles de diagnostico, rendimiento y compatibilidad que no
forman parte del recorrido principal del modulo de arquitectura
[02-gstreamer-y-mixer.md](../Arquitectura/02-gstreamer-y-mixer.md).

Su objetivo es documentar por que existen ciertas guardas y que conclusiones se
obtuvieron durante la validacion, sin sobrecargar la explicacion principal del
mixer.

## Rutas de monitorizacion evaluadas

La arquitectura objetivo mantiene Program y Preview grandes en superficies
nativas de GStreamer. Durante la validacion se compararon otras rutas para
separar coste, latencia y complejidad.

| Ruta | Encaje | Uso en la version publicada |
| --- | --- | --- |
| IPC de frames | Facil de depurar, pero mueve demasiada media por Electron | Diagnostico o compatibilidad |
| WebRTC local hacia Renderer | Evita IPC crudo, pero anade encode/decode y latencia | Fallback/A-B |
| Sink nativo (`glimagesink`) | Mantiene la presentacion en GStreamer | Ruta preferente |
| WebCodecs | Interesante como transporte codificado local | No integrado |
| Shared memory / shared texture | Reduce copias si se implementa por plataforma | Linea experimental para grafismo |
| HLS/DASH local | Facil de servir | Latencia excesiva para realizacion |

La conclusion es que la salida del realizador debe seguir en el plano de media.
El renderer puede controlar layout y operaciones, pero no debe recibir cada
frame grande como mensaje.

## Multiview

La multiview se valido como salida reducida, no como salida final. Los puntos de
ajuste principales son:

- `OPENMIX_MULTIVIEW_SOURCE_FPS`: limita la cadencia de cada slot antes de
  escalar y convertir.
- `OPENMIX_MULTIVIEW_ACTIVE_SLOTS`: abre solo las ramas con media real.
- `OPENMIX_MULTIVIEW_BARS=static`: evita procesar una fuente SMPTE live 1080p
  solo para mostrar un placeholder.
- `OPENMIX_MULTIVIEW_HUD`: dibuja nombres y bordes dentro del frame mediante
  `cairooverlay`.

Las barras estaticas reducen trabajo respecto a una fuente live, pero no son
coste cero: el mosaico sigue entregando frames y el overlay sigue formando parte
de la composicion. Si la multiview vuelve a ser un cuello de botella, el frente
natural es cachear mejor el fondo/HUD o replantear la composicion del mosaico,
no reducir la calidad de las camaras.

## Sync Buffer y pulso con una camara

Durante la integracion del Sync Buffer aparecio un pulso visual con una sola
camara. La lectura correcta fue separar la baseline de una camara del caso
multicamara:

- una sola camara no debe sincronizarse contra otra;
- los diagnosticos periodicos pueden alterar la cadencia observada;
- `identity sync=true` y `single-segment=true` pueden modificar el timing aunque
  parezcan elementos pasantes;
- el manager debe permanecer en bypass real hasta que haya suficientes peers
  decodificados.

La baseline recomendada para investigar tirones es:

1. desactivar diagnosticos y stats periodicas;
2. probar una sola camara con calidad movil estable;
3. activar dos camaras;
4. activar NTP apply solo cuando la base sea fluida.

Esta regla evita atribuir a bitrate, Wi-Fi o encoder movil un problema creado
por la capa de sincronizacion.

## REC nativo

La grabacion usa una rama dinamica dentro del pipeline. Estas protecciones son
las mas relevantes:

- el muxer recibe segmentos normalizados para que cada fichero empiece en
  `t=0`;
- las `valve` de fuentes cerradas conservan eventos sticky (`CAPS`, `SEGMENT`)
  para no abrir REC sin contexto;
- `videorate` y `frame gate` evitan que backlog o rafagas generen duracion
  extra en el MP4;
- el grafismo de Program se mezcla desde una cache BGRA antes del encoder;
- las colas comprimidas antes del muxer no son `leaky`, porque tirar paquetes
  H.264/AAC puede romper referencias;
- STOP REC corta buffers nuevos y envia EOS al muxer para escribir el indice
  final del contenedor.

La desconexion de una camara no detiene REC. El slot puede pasar a negro o a
otra fuente. En cambio, al apagar el mixer o cerrar la aplicacion, REC debe
cerrarse antes de destruir el pipeline.

## Variables de diagnostico utiles

| Variable | Uso |
| --- | --- |
| `OPENMIX_MONITOR_IPC=both|pgm|pvw|none` | Medir el coste de extraer PGM/PVW hacia JS |
| `OPENMIX_MONITOR_CALLBACKS=on|off` | Separar coste de producir frames y coste de callbacks |
| `OPENMIX_MONITOR_INPUTS=both|none` | Cerrar entradas de monitor antes del compositor |
| `OPENMIX_MONITOR_COMPOSITORS=on|off` | Bloquear compositores PGM/PVW para medir coste base |
| `OPENMIX_THUMBNAILS=on|off` | Aislar coste de miniaturas |
| `OPENMIX_WEBRTC_MONITOR_BRANCH=on|off` | Aislar rama monitor WebRTC tras decode |
| `OPENMIX_WEBRTC_DECODE_BRANCH=on|off` | Separar recepcion RTP/H264 y decode |
| `OPENMIX_RECORDING_H264_ENCODER=hardware|software` | Forzar encoder para aislar VideoToolbox/x264 |
| `OPENMIX_RECORDING_FRAME_GATE_LOG=on` | Registrar decisiones del frame gate de REC |
| `OPENMIX_SYNC_BUFFER_STATS=on` | Medir cola, fps y discontinuidades del Sync Buffer |

Estas opciones son herramientas de validacion. No describen el flujo normal de
operacion del producto.

## Mediciones orientativas

Las mediciones varian segun equipo, camara y red. En las pruebas de validacion
en macOS, los patrones relevantes fueron:

- los compositores live de monitorizacion tienen coste apreciable aunque haya
  pocas fuentes visibles;
- cerrar IPC de monitores afecta mas al renderer que al coste nativo del mixer;
- multiview suma coste por la construccion del mosaico, no solo por la
  superficie final;
- el perfil operativo con multiview nativa a 15fps, HUD activo y barras
  estaticas fue el equilibrio validado para la version publicada.

Estas cifras no deben leerse como garantias universales, sino como evidencias
que justifican las decisiones de arquitectura.

## Grafismo permanente

Una produccion real puede mantener grafismos persistentes como una mosca de
canal. No todos los overlays tienen el mismo perfil:

| Tipo | Perfil temporal | Ruta candidata |
| --- | --- | --- |
| Mosca | Entrada/salida animada; estable al aire | Overlay cacheado |
| Lower third | Animacion corta; lectura estable | Overlay cacheado tras animacion |
| Ticker | Movimiento continuo | Renderer especializado o banda optimizada |

La optimizacion no consiste en eliminar grafismo, sino en evitar que un overlay
simple obligue a pagar el coste maximo de composicion general en cada frame.
