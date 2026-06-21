import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GraphicsPlacement, GraphicsResolution } from '../../../shared/ipc/graphics-contracts'
import { GRAPHICS_PLACEMENTS_FILE_NAME } from './graphicsServiceConfig'
import type { PersistedGraphicsPlacements } from './graphicsServiceTypes'

export function clampPlacement(
  nextPlacement: GraphicsPlacement,
  resolution: GraphicsResolution | null
): GraphicsPlacement {
  const horizontalLimit = resolution?.width ?? 1920
  const verticalLimit = resolution?.height ?? 1080

  const offsetX = Number.isFinite(nextPlacement.offsetX)
    ? Math.max(-horizontalLimit, Math.min(horizontalLimit, Math.round(nextPlacement.offsetX)))
    : 0

  const offsetY = Number.isFinite(nextPlacement.offsetY)
    ? Math.max(-verticalLimit, Math.min(verticalLimit, Math.round(nextPlacement.offsetY)))
    : 0

  return { offsetX, offsetY }
}

function sanitizePersistedPlacements(candidate: unknown): PersistedGraphicsPlacements {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {}
  }

  const sanitized: PersistedGraphicsPlacements = {}
  for (const [templateId, rawPlacement] of Object.entries(candidate)) {
    if (!rawPlacement || typeof rawPlacement !== 'object' || Array.isArray(rawPlacement)) {
      continue
    }

    const maybePlacement = rawPlacement as Partial<GraphicsPlacement>
    sanitized[templateId] = clampPlacement(
      {
        offsetX: Number(maybePlacement.offsetX ?? 0),
        offsetY: Number(maybePlacement.offsetY ?? 0)
      },
      null
    )
  }

  return sanitized
}

export class GraphicsPlacementStore {
  private persistedGraphicsPlacements: PersistedGraphicsPlacements | null = null

  private getFilePath(): string {
    return join(app.getPath('userData'), GRAPHICS_PLACEMENTS_FILE_NAME)
  }

  private ensureLoaded(): void {
    if (this.persistedGraphicsPlacements) {
      return
    }

    const filePath = this.getFilePath()
    if (!existsSync(filePath)) {
      this.persistedGraphicsPlacements = {}
      return
    }

    try {
      const rawText = readFileSync(filePath, 'utf8')
      this.persistedGraphicsPlacements = sanitizePersistedPlacements(JSON.parse(rawText))
    } catch (error) {
      console.error('[Graphics] Error leyendo posiciones persistidas:', error)
      this.persistedGraphicsPlacements = {}
    }
  }

  public getPlacement(templateId: string, resolution: GraphicsResolution): GraphicsPlacement {
    this.ensureLoaded()
    const placement = this.persistedGraphicsPlacements![templateId]
    return placement ? clampPlacement(placement, resolution) : { offsetX: 0, offsetY: 0 }
  }

  public persistPlacement(templateId: string, placement: GraphicsPlacement): void {
    this.ensureLoaded()
    this.persistedGraphicsPlacements![templateId] = placement
    writeFileSync(
      this.getFilePath(),
      JSON.stringify(this.persistedGraphicsPlacements, null, 2),
      'utf8'
    )
  }
}
