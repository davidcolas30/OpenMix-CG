# ADR-0009: Separar roadmap principal y spike de shared texture

## Estado

Aceptada como organización de trabajo.

Nota 2026-06-10: este ADR queda como decisión histórica de
separación de ramas. Varias piezas que aquí aparecen como no resueltas ya están
cerradas a nivel MVP en la rama principal: Sync Buffer Manager, fuentes locales,
panel de audio diagnóstico, REC nativo con audio local y ticker native v1. El
spike de shared texture sigue separado como optimización futura.

## Contexto

Tras la optimización de monitores nativos y la estabilización del modo móvil,
OpenMix-CG tiene una base útil para continuar el roadmap principal:

- Una cámara WebRTC local puede mantenerse fluida en Preview/Program.
- El coste base de Main con una cámara sigue siendo significativo, pero ya no
  bloquea el desarrollo funcional inmediato.
- Los grafismos HTML/CSS conservan la flexibilidad deseada, aunque su ruta
  funcional sigue usando frames RGBA desde Chromium offscreen hacia GStreamer.
- El spike de `useSharedTexture` puede reducir copias CPU, pero exige código
  nativo macOS/ObjC++ e integración delicada con GStreamer.

En el momento de redactar este ADR, el proyecto todavía debía implementar
módulos principales por cerrar: Sync Buffer Manager, panel de audio y fuentes
locales pinchables. Bloquear todo ese roadmap hasta resolver una optimización
profunda de grafismo aumentaba el riesgo de la rama principal del producto.

## Decision

Se separan dos líneas de trabajo desde un punto de partida común:

1. **Rama de producto/roadmap principal**
   - Implementa y estabiliza Sync Buffer Manager, audio, fuentes locales y UI.
   - Mantiene la ruta de grafismo estable como backend funcional/fallback.
   - No debe depender de que el spike de shared texture funcione.

2. **Rama experimental de shared texture**
   - Investiga `BrowserWindow` offscreen con `useSharedTexture: true`.
   - En macOS, intenta transportar handles `IOSurface` al addon N-API/ObjC++.
   - Busca evitar `NativeImage.toBitmap()` y la copia CPU por frame.
   - Solo se integrara en producto si demuestra mejora clara y estabilidad.

La interfaz conceptual entre ambas ramas debe mantenerse estable:

```text
GraphicsService
  -> backend de transporte de grafismo
       - rgba-appsrc
       - shared-texture
  -> entrada de overlay en GStreamer
```

El roadmap principal no debe conocer detalles de `IOSurface`, CEF, GstWPE o
texturas compartidas. Esos detalles pertenecen al backend experimental.

## Criterios de integración del spike

El spike de shared texture solo se mezclará en la rama de producto si cumple:

- Alpha correcto sobre vídeo real, sin halos ni errores de premultiplicación.
- Animaciones de entrada/salida y ticker más fluidos que la ruta RGBA/appsrc.
- CPU menor con grafismos animados.
- Sin fugas de memoria ni acumulación de texturas.
- Fallback RGBA/appsrc disponible por guarda de entorno.
- No rompe CUT, AUTO, transiciones, grabación ni monitores nativos.

## Consecuencias

- La optimización profunda queda aislada y no frena el avance de módulos.
- El merge futuro será más sencillo si primero se estabiliza el contrato de
  `GraphicsService` y se evita tocar de forma dispersa todo el pipeline.
- Si el spike fracasa, el proyecto conserva una base funcional y estable.
- Si el spike funciona, se integra como reemplazo interno del transporte de
  grafismo, no como una reescritura del módulo completo.

## Relación con OpenMix-CG

La decisión respeta la regla principal del proyecto: el plano de media no debe
viajar por Electron IPC. La ruta RGBA/appsrc se conserva porque funciona, pero el
spike busca que los grafismos HTML/CSS se acerquen más al plano nativo de
GStreamer sin abandonar la flexibilidad de Chromium.
