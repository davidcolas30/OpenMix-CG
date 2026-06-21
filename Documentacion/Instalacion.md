# Instalación y ejecución

Esta guía resume cómo preparar OpenMix-CG para desarrollo local y cómo generar una
aplicación `.app` de prueba en macOS. La distribución validada actualmente usa
GStreamer instalado en el sistema como prerrequisito externo.

## Requisitos

- macOS con Apple Silicon para la ruta validada de empaquetado.
- Node.js y pnpm.
- Xcode Command Line Tools para compilar el addon nativo.
- GStreamer con los plugins necesarios para WebRTC, GL, VideoToolbox y audio
  local.

En macOS, si las herramientas de compilación no están instaladas:

```bash
xcode-select --install
```

## Instalar dependencias JavaScript

Desde la raíz del repositorio:

```bash
pnpm install
```

## Instalar GStreamer en macOS

La app necesita que `gst-inspect-1.0` y las librerías de GStreamer estén
disponibles en el sistema. Con Homebrew, una instalación típica es:

```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
```

Después conviene comprobar que existen los elementos usados por la aplicación:

```bash
gst-inspect-1.0 webrtcbin
gst-inspect-1.0 glimagesink
gst-inspect-1.0 vtdec
gst-inspect-1.0 vtenc_h264_hw
gst-inspect-1.0 osxaudiosrc
```

Si alguna comprobación falla, la interfaz puede arrancar, pero fallarán partes
del pipeline de vídeo, WebRTC, monitorización, grabación o audio local.

## Compilar el addon nativo

El backend de media se integra mediante un addon N-API que enlaza con
GStreamer. Para compilarlo:

```bash
pnpm run build:native
```

El binario generado se ubica en:

```text
src/native/build/Release/gstreamer_addon.node
```

## Ejecutar en desarrollo

Para iniciar la aplicación en modo desarrollo:

```bash
pnpm dev
```

Este modo usa Electron Vite y mantiene separadas las rutas de Main, Preload y
Renderer. Es la forma recomendada para desarrollar, depurar y validar cambios.

## Compilar la aplicación

Para ejecutar las comprobaciones TypeScript y generar la build de Electron:

```bash
pnpm run build
```

Para generar una carpeta `.app` de prueba en macOS:

```bash
pnpm run package:mac:dir
```

El resultado queda en:

```text
dist/mac-arm64/OpenMix-CG.app
```

Para generar un `.dmg` de prueba:

```bash
pnpm run package:mac:dmg
```

## Qué incluye la app empaquetada

El empaquetado macOS incluye:

- los bundles `out/main`, `out/preload` y `out/renderer`;
- el addon nativo `gstreamer_addon.node`;
- las plantillas de grafismo de `resources/graphics-templates`;
- la página móvil de cámara servida por el QR.

GStreamer no se incluye dentro del bundle en esta fase. El equipo destino debe
tenerlo instalado previamente.

## Problemas frecuentes

### La app abre, pero no aparecen monitores o cámaras

Comprueba que GStreamer está instalado y que los plugins principales responden
con `gst-inspect-1.0`. En especial, `webrtcbin`, `glimagesink` y los elementos de
VideoToolbox son necesarios para la ruta validada.

### Falla la compilación del addon nativo

Revisa que estén instaladas las Xcode Command Line Tools y que `node-gyp` pueda
compilar módulos nativos. Después repite:

```bash
pnpm run build:native
```

### La cámara móvil no conecta

El modo validado es red local. El móvil y el ordenador deben estar en la misma
red y el navegador del móvil debe poder abrir la URL generada por el QR.

### La app empaquetada no funciona en otro Mac

La app generada con este método no es autocontenida. Además de copiar
`OpenMix-CG.app`, el otro Mac necesita una instalación compatible de GStreamer.

## Estado de distribución

La ruta validada actualmente es:

- desarrollo con `pnpm dev`;
- empaquetado macOS de prueba con GStreamer externo;
- firma ad-hoc para validación local.

Queda como evolución futura empaquetar GStreamer dentro del bundle o distribuir
un instalador propio con firma y notarización completas.
