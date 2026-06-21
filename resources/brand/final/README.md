# OpenMix-CG final brand assets

Assets raster finales para uso en la interfaz, documentación y
material de entrega. Todos los PNG de esta carpeta tienen canal alfa real.

## Archivos

- `openmix-cg-symbol-transparent.png`: símbolo compacto con monograma `OM`.
  Uso previsto: splash, About, icono interno o marca auxiliar. No sustituye al
  icono de Dock, que mantiene fondo oscuro integrado.
- `openmix-cg-logo-horizontal-ui-dark-transparent.png`: logo horizontal para
  cabeceras sobre la interfaz oscura de OpenMix-CG.
- `openmix-cg-logo-horizontal-ui-dark-header.png`: versión recortada del logo
  horizontal oscuro, pensada para importarse desde la cabecera del renderer sin
  margen transparente excesivo.
- `openmix-cg-logo-horizontal-docs-transparent.png`: logo horizontal para
  documentación, README o superficies claras.
- `openmix-cg-wordmark-color-transparent.png`: wordmark sin símbolo, útil para
  portada o cabeceras estrechas.
- `openmix-cg-logo-monochrome-dark-transparent.png`: versión monocroma oscura
  para fondos claros o impresión sobria.
- `openmix-cg-logo-monochrome-light-transparent.png`: versión monocroma clara
  para fondos oscuros.

## Procedencia

Estos assets parten de exploraciones de marca locales no versionadas. Algunas
imágenes originales no tenían alfa real, sino una cuadrícula de transparencia
horneada. Para preparar estas copias se usó `rembg` con el modelo
`isnet-general-use` y alpha matting, dejando los bordes suaves cuando era
posible.

## Limitación conocida

El brillo exterior se conserva de forma aceptable, pero no es idéntico a una
imagen generada originalmente sobre transparencia real. Para el icono de Dock se
mantiene una pieza raster cerrada con fondo oscuro, porque ahí el fondo forma
parte del propio icono.
