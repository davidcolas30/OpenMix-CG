# ADR-0008: Probar composición A/B para monitores Preview/Program

## Estado

Aceptada como ruta experimental de medición. No es el modo por defecto.

## Contexto

Las pruebas incrementales del 2026-05-18 aislaron el coste de CPU del mixer:

- `decode-only`: alrededor de 18-22% de Main.
- `normalize-only`: alrededor de 25-29% de Main.
- `compositor-dry`: alrededor de 61-68% de Main.
- `native-monitors`: alrededor de 64-70% de Main.

La lectura es que WebRTC, VideoToolbox y la presentación nativa no explican el
salto principal. El coste aparece al mantener vivos los compositores PGM/PVW con
varias entradas aunque visualmente solo haya una fuente activa. La ruta
`OPENMIX_MONITOR_RENDERER=selector` baja mucho el coste, pero no sirve como
solución completa porque no permite grafismos ni transiciones.

## Decision

Se introduce la guarda:

```bash
OPENMIX_MONITOR_RENDERER=ab-compositor
```

Este modo mantiene el resultado final de Preview/Program saliendo de
`compositor`, para conservar grafismos y transiciones, pero cambia cómo entra el
vídeo base:

- Program usa un selector primario para la fuente al aire.
- Durante una transición, Program abre un segundo selector temporal para la
  fuente entrante.
- Preview usa un selector primario para la fuente en previo.
- Las pads legacy por fuente se sueltan del compositor en este modo, de forma
  que `GstAggregator` no calendariza cuatro entradas live por monitor.
- La grabación 1080p queda intacta y sigue usando `comp_pgm_record`.

## Consecuencias

- La ruta `compositor` sigue siendo el valor por defecto.
- La ruta `selector` sigue disponible como referencia barata sin grafismos.
- `ab-compositor` permite medir si el coste del compositor viene del número de
  entradas live o del propio elemento aunque solo tenga una o dos entradas.
- Las pruebas bajaron el coste frente a la ruta legacy con todas las entradas,
  pero no hasta el objetivo ideal. Esto desplaza el siguiente frente hacia
  composición GL, formato de pixel y ruta de grafismo, no solo hacia cerrar más
  pads.
- CUT y AUTO deben seguir usando la misma API pública; el cambio vive dentro
  del plano de media nativo.
- Si esta prueba no baja CPU de forma significativa, el siguiente frente no será
  "cerrar más pads", sino replantear grafismos/composición o la ruta de REC.

## Relación con OpenMix-CG

Esta decisión mantiene la regla de separación del proyecto: los frames de vídeo
no vuelven a Electron IPC. La UI sigue enviando intenciones de realización y el
addon nativo decide cómo materializarlas en GStreamer.
