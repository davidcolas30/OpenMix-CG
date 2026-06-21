/**
 * registerGraphicsHandlers.ts — Handlers IPC del módulo de grafismo.
 *
 * Esta iteración conecta el renderer con una pila de instancias de grafismo,
 * cada una con su propio preview offscreen y control individual de overlay.
 */

import { ipcMain } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { ipcError, ipcOk } from '../../shared/ipc/contracts'
import {
  addGraphicsTemplate,
  getGraphicsMixerFrame,
  getGraphicsPreviewFrame,
  getGraphicsState,
  hideGraphicsItem,
  listGraphicsTemplates,
  removeGraphicsItem,
  selectGraphicsItem,
  setGraphicsOverlayTargets,
  setGraphicsPreviewOutput,
  setGraphicsPlacement,
  showGraphicsItem,
  updateGraphicsField
} from '../services/graphicsService'

export function registerGraphicsHandlers(): void {
  ipcMain.handle(ipcChannels.graphicsListTemplates, () => {
    try {
      return ipcOk(listGraphicsTemplates())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsAddTemplate, async (_event, templateId: string) => {
    try {
      return ipcOk(await addGraphicsTemplate(templateId))
    } catch (err) {
      console.error(`[GraphicsIPC] Error añadiendo plantilla ${templateId}:`, err)
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsSelectItem, (_event, itemId: string) => {
    try {
      return ipcOk(selectGraphicsItem(itemId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsRemoveItem, async (_event, itemId: string) => {
    try {
      return ipcOk(await removeGraphicsItem(itemId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.graphicsUpdateField,
    async (_event, args: { itemId: string; fieldId: string; value: string }) => {
      try {
        return ipcOk(await updateGraphicsField(args.itemId, args.fieldId, args.value))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(
    ipcChannels.graphicsSetPlacement,
    async (_event, args: { itemId: string; offsetX: number; offsetY: number }) => {
      try {
        return ipcOk(await setGraphicsPlacement(args.itemId, args))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(
    ipcChannels.graphicsSetOverlayTargets,
    async (_event, args: { itemId: string; preview: boolean; program: boolean }) => {
      try {
        return ipcOk(setGraphicsOverlayTargets(args.itemId, args))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.graphicsShowItem, async (_event, args: { itemId: string }) => {
    try {
      return ipcOk(await showGraphicsItem(args.itemId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsHideItem, async (_event, args: { itemId: string }) => {
    try {
      return ipcOk(await hideGraphicsItem(args.itemId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsGetState, () => {
    try {
      return ipcOk(getGraphicsState())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsGetPreviewFrame, () => {
    try {
      return ipcOk(getGraphicsPreviewFrame())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.graphicsGetMixerFrame, () => {
    try {
      return ipcOk(getGraphicsMixerFrame())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.graphicsSetPreviewOutput,
    async (
      _event,
      args: { enabled: boolean; width: number; height: number; maxFps: number }
    ) => {
      try {
        await setGraphicsPreviewOutput(args)
        return ipcOk(getGraphicsState())
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError('INTERNAL_ERROR', message)
      }
    }
  )
}
