/**
 * Punto único de carga del addon nativo de GStreamer.
 *
 * En desarrollo electron-vite ejecuta el Main Process desde out/main, por eso
 * seguimos resolviendo el binario compilado en src/native/build/Release.
 *
 * En una app empaquetada, electron-builder copia el .node a
 * Contents/Resources/native. Mantener ambas rutas aquí permite probar un .app
 * sin romper la ruta diaria de desarrollo con pnpm dev.
 */

import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { GStreamerAddon } from '../../native/gstreamer_addon'

function getCandidateAddonPaths(): string[] {
  const devPath = join(__dirname, '../../src/native/build/Release/gstreamer_addon.node')
  const packagedPath = join(process.resourcesPath, 'native', 'gstreamer_addon.node')

  return app.isPackaged ? [packagedPath, devPath] : [devPath, packagedPath]
}

export function resolveNativeAddonPath(): string {
  const candidates = getCandidateAddonPaths()
  const addonPath = candidates.find((candidate) => existsSync(candidate))

  if (!addonPath) {
    throw new Error(
      `No se ha encontrado gstreamer_addon.node. Rutas probadas: ${candidates.join(', ')}`
    )
  }

  return addonPath
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const nativeGStreamerAddon: GStreamerAddon = require(resolveNativeAddonPath())
