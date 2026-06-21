# ADR-0005 — Modelo híbrido de grafismo para plantillas continuas y ticker native v1

Estado: aceptada
Fecha: 2026-04-23

## Contexto

Tras estabilizar la Fase 4 previa, OpenMix-CG ya dispone de un motor de grafismo funcional basado en `BrowserWindow` oculta, preview-first y composición nativa del overlay del mixer mediante `appsrc` de GStreamer.

Las mediciones de validación separan dos comportamientos distintos:

- los rótulos con animaciones cortas de entrada y salida consumen poco y, una vez quietos, casi no añaden coste sostenido
- las plantillas con movimiento continuo, en especial el ticker, mantienen un consumo estructural alto incluso sin el mixer iniciado

La instrumentacion del `paint` offscreen ha aportado una conclusion importante:

- `averageDirtyCoveragePercent` aproximado: 4.2%
- `fullFramePaintRatePercent` aproximado: 0.1%

Eso descarta que el cuello principal provenga de invalidaciones full-frame. El coste restante parece estar más en el trabajo fijo por paint offscreen de Chromium, la captura bitmap y el procesado por frame que en el tamaño del rectángulo sucio.

## Alternativas consideradas

### 1. Mantener todo el grafismo en HTML/CSS/JS

Ventajas:

- un solo formato de plantilla
- máxima flexibilidad visual para el disenador
- continuidad total con la Fase 4 preview-first

Problemas:

- las plantillas con movimiento continuo seguirian pagando el coste estructural de Chromium offscreen
- el ticker no tendría un camino claro para escalar sin seguir consumiendo CPU en reposición continua

### 2. Mover todo el módulo de grafismo a render nativo

Ventajas:

- unifica la tecnología de render
- elimina la dependencia de Chromium para overlays al aire

Problemas:

- rehace demasiado pronto un módulo que ya funciona bien para lower thirds, moscas y overlays casi estáticos
- complica la autoría visual y el mantenimiento del módulo
- obliga a recrear layout, tipografía y animaciones que HTML ya resuelve con poco coste en los casos no continuos

### 3. Modelo híbrido

Ventajas:

- conserva HTML/CSS/JS para plantillas ricas o de animación corta
- saca del motor offscreen solo las familias de overlays con movimiento continuo
- encaja con las mediciones reales del proyecto en vez de reescribir todo el módulo por intuicion

Problema:

- introduce dos formatos de plantilla y un nuevo tipo de renderer interno

## Decision

Se adopta la tercera opción.

OpenMix-CG debe evolucionar hacia un modelo híbrido:

- `html` para lower thirds, bugs, overlays con layout libre y animaciones cortas
- `native` para plantillas continuas o con actualización sostenida, empezando por el ticker

La primera plantilla nativa implementada es `ticker-native-v1`.

La aceptación de esta ADR queda respaldada por una primera implementación real en el runtime: ya existe un dispatcher por formato, una plantilla `native` cargable desde `resources/graphics-templates` y un renderer especializado en Main para el ticker.

## Diseño de ticker-native-v1

La primera plantilla nativa no intenta ser un motor universal de grafismo, sino un renderer especializado y acotado.

Su objetivo es reproducir el ticker básico con estas propiedades:

- barra inferior con etiqueta a la izquierda y cuerpo desplazable a la derecha
- texto continuo en bucle horizontal
- velocidad editable por duración del ciclo
- animaciones cortas de entrada y salida
- soporte de alpha para composición sobre Preview y Program
- mismo flujo operativo que el resto de plantillas desde la UI del realizador

## Regla de alcance

`ticker-native-v1` debe cubrir solo el ticker horizontal básico del proyecto.

Queda fuera en esta primera versión:

- layouts arbitrarios
- HTML libre
- componentes anidados o bloques con estilos dinamicos complejos
- reproducción general de cualquier plantilla HTML previa

## Consecuencias técnicas

- aparece un nuevo `format: native` en el ecosistema de plantillas
- el motor de grafismo necesitara un dispatcher por formato o `rendererId`
- la carpeta de la plantilla puede seguir existiendo en `resources/graphics-templates`, pero ya no se interpretara con `template.html`
- la ruta de preview de la pestaña de grafismos y la ruta on-air podran compartir el mismo renderer nativo para el ticker

## Consecuencias operativas

- el operador seguira viendo un ticker como una plantilla más de la pila
- el disenador ya no editara el ticker como HTML/CSS/JS libre, sino como una plantilla declarativa con estilo parametrizado
- el coste de CPU de los tickers debería depender sobre todo del renderer nativo y no de Chromium offscreen

## Regla práctica

En OpenMix-CG, los overlays continuos no deben forzar una reescritura total del motor de grafismo.

La regla propuesta es esta:

- mantener HTML donde aporta flexibilidad real
- mover a nativo solo donde las mediciones demuestren que el coste continuo compensa perder libertad visual
