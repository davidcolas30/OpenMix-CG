# OpenMix-CG brand assets

Carpeta de marca versionada para la interfaz, documentación y empaquetado.

## Contenido versionado

- `final/`: selección raster final con transparencia real para UI,
  documentación y marca auxiliar.
- `resources/icon.png`: icono raster usado por Electron en desarrollo.
- `build/icon.png` y `build/icon.icns`: exportaciones usadas por el
  empaquetado de macOS.

Las exploraciones, variantes descartadas y referencias generadas se conservan
solo como material local no versionado.

## Uso propuesto

- App icon: usar `resources/icon.png`, `build/icon.png` y `build/icon.icns`.
- Cabecera de la UI: usar
  `final/openmix-cg-logo-horizontal-ui-dark-header.png`.
- Documentación o README: usar
  `final/openmix-cg-logo-horizontal-docs-transparent.png` o
  `final/openmix-cg-wordmark-color-transparent.png`.
- Pantallas pequeñas, About o splash auxiliar: usar
  `final/openmix-cg-symbol-transparent.png`.

El icono de Dock/app ya está exportado a `resources/icon.png`,
`build/icon.png` y `build/icon.icns`. Los assets de `final/` se mantienen
separados para UI y documentación.
