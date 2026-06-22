# Empaquetado macOS

> Nota operativa sobre la distribución macOS validada. La aplicación empaquetada
> usa GStreamer como prerrequisito externo.

## Objetivo

Generar una aplicación macOS `OpenMix-CG.app` con Electron Builder manteniendo
GStreamer como prerrequisito externo. La ruta de desarrollo no cambia:
`pnpm dev` y los comandos con variables de entorno siguen siendo la forma
principal de desarrollar y validar el producto.

## Prerrequisito externo

En la distribución validada, el ordenador destino debe tener GStreamer
instalado. En macOS Apple Silicon, la prueba validada enlaza contra librerías
de Homebrew en
`/opt/homebrew/opt/gstreamer`.

Comprobaciones recomendadas antes de abrir la app empaquetada:

```bash
brew install gstreamer
gst-inspect-1.0 webrtcbin
gst-inspect-1.0 glimagesink
gst-inspect-1.0 vtdec
gst-inspect-1.0 vtenc_h264_hw
gst-inspect-1.0 osxaudiosrc
```

Si alguna inspeccion falla, la app puede arrancar pero fallara al crear partes
del pipeline nativo.

## Comandos de empaquetado

Generar una carpeta `.app` para pruebas rápidas:

```bash
pnpm run package:mac:dir
```

El resultado queda en:

```text
dist/mac-arm64/OpenMix-CG.app
```

Generar un `.dmg` de prueba cuando la carpeta `.app` ya este validada:

```bash
pnpm run package:mac:dmg
```

## Que se empaqueta

- `out/main`, `out/preload` y `out/renderer`, generados por `electron-vite`.
- `src/native/build/Release/gstreamer_addon.node`, copiado como
  `Contents/Resources/native/gstreamer_addon.node`.
- `resources/graphics-templates`, copiado a
  `Contents/Resources/graphics-templates`.
- `src/mobile`, copiado a `Contents/Resources/mobile` para que el QR pueda
  servir la página de cámara en producción.

La carga del addon vive en `src/main/services/nativeAddon.ts`:

- en desarrollo resuelve `src/native/build/Release/gstreamer_addon.node`;
- en la app empaquetada resuelve
  `process.resourcesPath/native/gstreamer_addon.node`.

## Validación realizada

La prueba local confirma:

- `pnpm run typecheck` correcto;
- `pnpm run package:mac:dir` correcto;
- `codesign --verify --deep --strict dist/mac-arm64/OpenMix-CG.app` correcto;
- existen addon, cliente móvil y plantillas dentro de `Contents/Resources`;
- el binario empaquetado arranca el Main Process, levanta HTTPS/WebSocket y se
  puede cerrar sin fallo inmediato.

## Límites conocidos

- No es una app autocontenida: depende de GStreamer/Homebrew externo.
- La build validada es `darwin arm64`; no valida Intel ni universal.
- La firma es ad-hoc y `notarize=false`. Para distribuir fuera de pruebas hara
  falta firma de desarrollador y notarizacion.
- Se usa `com.apple.security.cs.disable-library-validation` para permitir que
  la app ad-hoc cargue Electron Framework y dylibs externas de GStreamer. Es
  aceptable para la validación local, pero debe revisarse para distribución.
- El nombre de producto y ventana ya está unificado como `OpenMix-CG`, y los
  assets base de marca ya existen para UI y empaquetado. Para una release
  pública se deben validar el icono definitivo de Dock/paquete en la app
  generada, la firma, la notarizacion y los artefactos de distribución.

## Distribución autocontenida

La evolución natural del despliegue consistiria en incluir el runtime de
GStreamer dentro del bundle o en un instalador propio. Ese empaquetado exige
resolver librerías, plugins, `gst-plugin-scanner`, rutas internas y
firma/notarizacion con más cuidado. No debe mezclarse con la validación
funcional de la aplicación.
