# Estado del proyecto

OpenMix-CG se encuentra en una versión funcional orientada a producción local en
red propia. El objetivo del proyecto es ofrecer una aplicación de realización
multicámara con fuentes móviles, grafismo y grabación local, manteniendo una
arquitectura preparada para seguir creciendo.

## Funcionalidades validadas

La versión publicada incluye:

- mixer Preview/Program con CUT, AUTO y selección de fuentes;
- cámaras móviles en red local mediante QR, HTTPS, WebSocket y WebRTC;
- monitores Preview y Program con ruta nativa basada en GStreamer;
- multiview reducida con HUD, slots activos y barras estáticas;
- grafismo HTML y ruta nativa especializada para overlays continuos;
- composición de grafismos sobre Program, Preview y grabación;
- vídeos locales cargados desde disco como fuentes pinchables;
- grabación local de Program con vídeo 1080p y audio local opcional;
- panel de audio con medidor, onda, referencia visual y cálculo asistido de
  delay por palmada o claqueta;
- panel de atajos configurables para acciones frecuentes.

## Plataforma validada

La plataforma de desarrollo y prueba principal es macOS en Apple Silicon. La
ruta validada es:

- ejecución en desarrollo con `pnpm dev`;
- GStreamer instalado como dependencia del sistema;
- addon nativo compilado con `node-gyp`;
- empaquetado macOS de prueba con Electron Builder;
- uso principal en red local, con cámaras móviles conectadas al mismo Wi-Fi que
  el ordenador de realización.

La aplicación está construida con Electron, React, TypeScript, GStreamer y
WebRTC. La arquitectura mantiene separados el plano de control y el plano de
media: la interfaz envía órdenes y estados, mientras que el vídeo y el audio se
procesan en las rutas nativas.

## Límites conocidos

Esta versión tiene varios límites importantes:

- la contribución remota desde redes externas no está cerrada; requeriría TURN,
  políticas de reconexión y pruebas específicas;
- la mezcla de audio multifuente no está implementada como mesa completa; el
  panel de audio se centra en audio local de grabación y diagnóstico;
- el empaquetado macOS no es autocontenido porque depende de una instalación
  externa de GStreamer;
- Windows y Linux no tienen todavía una ruta validada equivalente a la de
  macOS;
- las plantillas HTML y el ticker nativo están validados como base del motor de
  grafismo, pero se pueden añadir más plantillas y backends en el futuro.

## Próximos pasos

Las mejoras más naturales para evolucionar el proyecto son:

1. empaquetar GStreamer dentro de la aplicación o en un instalador propio;
2. preparar firma y notarización para distribución macOS;
3. validar una ruta de instalación en Windows y Linux;
4. ampliar el panel de audio hacia mezcla multifuente;
5. añadir más plantillas de grafismo listas para usar;
6. estudiar contribución remota con TURN;
7. reforzar pruebas automáticas de flujos críticos como conexión móvil, REC,
   grafismo y cambios Preview/Program.

## Documentación relacionada

- [Instalación.md](Instalacion.md): preparación del entorno y empaquetado de
  prueba.
- [Manual-usuario.md](Manual-usuario.md): guía de operación de la aplicación.
- [Arquitectura/00. Visión general y flujo de datos](Arquitectura/00-vision-general-y-flujo-de-datos.md):
  visión general de módulos y flujo de datos.
- [Arquitectura/02-gstreamer-y-mixer.md](Arquitectura/02-gstreamer-y-mixer.md):
  detalles del mixer, sincronización, monitores y grabación.
