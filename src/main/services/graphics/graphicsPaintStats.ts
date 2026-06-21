import type {
  GraphicsOverlayTargets,
  GraphicsPaintDiagnostics
} from '../../../shared/ipc/graphics-contracts'
import type { GraphicsPaintStats } from './graphicsServiceTypes'

export function createEmptyGraphicsPaintStats(): GraphicsPaintStats {
  return {
    totalPaintCount: 0,
    fullFramePaintCount: 0,
    dirtyCoverageSum: 0,
    maxDirtyCoverage: 0,
    lastDirtyCoverage: 0,
    frameWidth: 0,
    frameHeight: 0
  }
}

export function toGraphicsPaintDiagnostics(stats: GraphicsPaintStats): GraphicsPaintDiagnostics {
  const averageDirtyCoverage =
    stats.totalPaintCount > 0 ? stats.dirtyCoverageSum / stats.totalPaintCount : 0
  const fullFramePaintRate =
    stats.totalPaintCount > 0 ? stats.fullFramePaintCount / stats.totalPaintCount : 0

  return {
    totalPaintCount: stats.totalPaintCount,
    fullFramePaintCount: stats.fullFramePaintCount,
    averageDirtyCoveragePercent: Math.round(averageDirtyCoverage * 1000) / 10,
    maxDirtyCoveragePercent: Math.round(stats.maxDirtyCoverage * 1000) / 10,
    lastDirtyCoveragePercent: Math.round(stats.lastDirtyCoverage * 1000) / 10,
    fullFramePaintRatePercent: Math.round(fullFramePaintRate * 1000) / 10,
    frameWidth: stats.frameWidth,
    frameHeight: stats.frameHeight
  }
}

export function mergeGraphicsPaintStats(statsList: GraphicsPaintStats[]): GraphicsPaintStats {
  return statsList.reduce<GraphicsPaintStats>(
    (aggregate, stats) => ({
      totalPaintCount: aggregate.totalPaintCount + stats.totalPaintCount,
      fullFramePaintCount: aggregate.fullFramePaintCount + stats.fullFramePaintCount,
      dirtyCoverageSum: aggregate.dirtyCoverageSum + stats.dirtyCoverageSum,
      maxDirtyCoverage: Math.max(aggregate.maxDirtyCoverage, stats.maxDirtyCoverage),
      lastDirtyCoverage: stats.lastDirtyCoverage,
      frameWidth: stats.frameWidth,
      frameHeight: stats.frameHeight
    }),
    createEmptyGraphicsPaintStats()
  )
}

export function formatGraphicsOverlayTargets(targets: GraphicsOverlayTargets): string {
  const labels = [targets.preview ? 'PVW' : null, targets.program ? 'PGM' : null].filter(Boolean)
  return labels.length > 0 ? labels.join('+') : '-'
}
