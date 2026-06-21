# ADR-0007: Mantener la ruta nativa de monitores y diagnosticar `osxvideosink` con cautela

## Estado

Aceptada.

## Contexto

Durante las pruebas de monitores grandes nativos, OpenMix-CG intentaba presentar
Preview y Program mediante `osxvideosink` de GStreamer dentro de ventanas hijas
de Electron. La idea era reducir el coste de Chromium y evitar que los frames de
monitorización viajasen como buffers por IPC.

La prueba mostro que el vídeo podía verse fluido, pero al conectar un móvil la
aplicación llego a cerrarse por completo. El informe de crash de macOS indicaba
un abort nativo en el hilo principal de Electron:

- `EXC_CRASH (SIGABRT)`
- assertion failure: `!NSOpenGLBalanceCurrentContext()`
- pila relevante: `-[NSOpenGLView lockFocusIfCanDraw]` ->
  `-[GstGLView displayTexture]` ->
  `-[GstOSXVideoSinkObject showFrame:]`

Esto situa el fallo en la presentación OpenGL de `osxvideosink`, no en la
negociación WebRTC ni en el monitor de CPU.

## Decision

En macOS, la ruta de monitores grandes basada en superficies nativas de
GStreamer sigue siendo la línea principal de optimización para Preview y
Program. No se debe recuperar IPC crudo ni WebRTC local como solución
permanente para "hacer que se vea" si el objetivo de la prueba es mantener el
plano de media fuera de Chromium.

El crash observado queda registrado como riesgo de esta ruta, no como razón
para abandonar automaticamente la arquitectura nativa. Si se solicita:

```bash
OPENMIX_BIG_MONITORS_SURFACE=native
```

el servicio activa también `OPENMIX_NATIVE_MONITOR_WINDOWS=on` para evitar una
configuración a medias donde la UI espera superficies nativas pero el pipeline
mantiene la valve cerrada.

Tras repetirse la misma firma de crash en macOS, la aplicación selecciona
`glimagesink` por defecto para los monitores nativos cuando no se ha indicado
otro sink de forma explicita. La razón no es volver al plano de media antiguo,
sino evitar la ruta concreta `libgstosxvideo.dylib` -> `GstOSXVideoSinkObject`
que aparece en los informes `.ips`. Si se necesita reproducir o comparar el
comportamiento anterior, puede forzarse con:

```bash
OPENMIX_NATIVE_MONITOR_SINK=osxvideosink
```

## Consecuencias

- Se evita volver sin querer a rutas antiguas que ya se habían superado por
  coste de CPU o copias.
- Si aparece un cierre inesperado en esta ruta, debe investigarse la interacción
  concreta entre grafismo, alpha, `osxvideosink` y ciclo de vida de ventanas,
  no sustituirse directamente por IPC/WebRTC local.
- Las ventanas nativas siguen siendo útiles como prueba aislada, pero deben
  observarse con cuidado porque comparten proceso con Electron.
- Si se retoma esta vía, la alternativa más robusta será sacar la presentación
  nativa a otro proceso o investigar un sink/superficie que no use el encaje
  `GstGLView` + `BrowserWindow` dentro del mismo proceso.

## Relación con OpenMix-CG

Esta decisión refuerza la regla del proyecto: el plano de media no debe viajar
por IPC. En el estado actual, `glimagesink` queda como opción protegida para
monitores nativos en macOS, mientras `osxvideosink` se conserva solo como A/B
explicito o reproducción de incidencias.
