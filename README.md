# OpenMix-CG

Plataforma de realización de vídeo multicámara en tiempo real con Electron, React, GStreamer y WebRTC.

OpenMix-CG permite trabajar con el paradigma Preview/Program, conectar cámaras móviles por QR en red local, superponer grafismo HTML/native y grabar la salida Program en local.

## Características principales

- Mixer Preview/Program con CUT, AUTO y fuentes seleccionables.
- Cámaras móviles locales mediante HTTPS, WebSocket y WebRTC.
- Monitores Preview/Program nativos basados en GStreamer.
- Multiview reducida con HUD y slot de grafismo.
- Grafismo editable con plantillas HTML y renderer native para overlays continuos.
- Grabación local de Program con audio local opcional.
- Fuentes de vídeo local pinchables desde el mixer.
- Paneles independientes para audio, grafismo, opciones de grabación y atajos.

## Documentación

- [Documentacion/README.md](Documentacion/README.md) — índice de documentación técnica.
- [Documentacion/Glosario.md](Documentacion/Glosario.md) — glosario de conceptos técnicos y audiovisuales.
- [Documentacion/Arquitectura/00-vision-general-y-flujo-de-datos.md](Documentacion/Arquitectura/00-vision-general-y-flujo-de-datos.md) — visión general y flujo de datos.
- [Documentacion/Arquitectura/02-gstreamer-y-mixer.md](Documentacion/Arquitectura/02-gstreamer-y-mixer.md) — mixer, monitores, multiview, sincronización y grabación.
- [Documentacion/Arquitectura/03-webrtc-y-senalizacion-local.md](Documentacion/Arquitectura/03-webrtc-y-senalizacion-local.md) — conexión móvil por QR, señalización y WebRTC.
- [Documentacion/Notas/empaquetado-macos-fase-1.md](Documentacion/Notas/empaquetado-macos-fase-1.md) — empaquetado macOS con GStreamer externo.

## Requisitos

- Node.js y pnpm.
- GStreamer instalado en el sistema para las rutas nativas.
- En macOS, se recomienda instalar GStreamer desde los paquetes oficiales y ejecutar la app desde una terminal que tenga disponibles sus librerías.

## Desarrollo

Instalar dependencias:

```bash
pnpm install
```

Arrancar en modo desarrollo:

```bash
pnpm dev
```

Compilar:

```bash
pnpm build

# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```
