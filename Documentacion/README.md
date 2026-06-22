# Documentación de OpenMix-CG

Este directorio contiene la documentación técnica pública del proyecto. La
estructura separa conceptos, arquitectura, decisiones técnicas y notas de
empaquetado para que cada archivo tenga una responsabilidad clara.

## Cómo leer esta documentación

- [Glosario.md](Glosario.md): índice de conceptos técnicos y audiovisuales.
- [Instalacion.md](Instalacion.md): preparación del entorno, ejecución en
  desarrollo y empaquetado macOS de prueba.
- [Manual-usuario.md](Manual-usuario.md): guía de uso de la aplicación desde el
  punto de vista del operador.
- [Estado-del-proyecto.md](Estado-del-proyecto.md): funcionalidades validadas,
  límites conocidos y próximos pasos.
- [Arquitectura/](Arquitectura/): explicación de los módulos principales y sus
  flujos de datos.
- [Figuras/](Figuras/): fuentes Mermaid y renders SVG/PNG de los diagramas de
  arquitectura principales.
- [ADRs/](ADRs/): decisiones de arquitectura y resolución de incidencias
  relevantes.
- [Notas/empaquetado-macos.md](Notas/empaquetado-macos.md):
  validación del empaquetado macOS con GStreamer externo.
- [Notas/gstreamer-detalles-operativos.md](Notas/gstreamer-detalles-operativos.md):
  detalles de diagnostico, rendimiento y compatibilidad del pipeline.

## Estado de la versión

El proyecto tiene un MVP funcional con:

- mixer Preview/Program sobre GStreamer;
- cámaras móviles locales por QR, WebSocket y WebRTC;
- monitores grandes que pueden salir por superficies nativas de GStreamer;
- multiview reducida con superficie WebRTC o nativa bajo guarda, cerrada a
  nivel operativo con 15fps, slots activos, HUD y barras estáticas;
- grafismo HTML/native integrado sobre Preview/Program mediante GStreamer;
- grabación local nativa del Program con ruta 1080p;
- vídeos locales cargados desde disco como fuentes pinchables del mixer;
- panel de atajos configurables para acciones frecuentes de operación, en una
  vista independiente del mixer principal;
- primera pestaña de audio local en modo diagnóstico, con medidor, onda,
  referencia visual nativa y buffer ligero para cálculo asistido de delay por
  palmada/claqueta; el delay calculado ya puede aplicarse a la rama de audio
  local de REC nativo bajo guarda;
- REC nativo con audio local validado a nivel MVP: MP4 reproducible con vídeo
  1080p en movimiento y audio AAC local. El ajuste fino de milisegundos se
  reserva para la prueba de claqueta.
- empaquetado macOS validado como `.app` de prueba con GStreamer externo
  como prerrequisito; la ruta de desarrollo con `pnpm dev` sigue intacta.
- nombre de producto y ventana unificados como **OpenMix-CG**, con assets de
  marca versionados para UI, documentación y empaquetado.
- addon nativo y servicios de UI/REC/grafismos organizados por dominios para
  facilitar mantenimiento, pruebas y revisión técnica.

## Líneas de evolución

1. **Producto principal:** empaquetado, experiencia de operador, audio,
   fuentes locales, multiview y grabación.
2. **Optimizaciones experimentales:** transporte de grafismo por
   `useSharedTexture`/`IOSurface` para reducir copias CPU en overlays HTML.
