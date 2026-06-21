/**
 * registerShortcutHandlers.ts — Handlers IPC para atajos configurables.
 *
 * Solo gestionan configuracion persistente. La ejecucion del atajo se queda en
 * Renderer porque equivale a invocar botones ya disponibles en la UI.
 */

import { ipcMain } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { ipcError, ipcOk } from '../../shared/ipc/contracts'
import type {
  KeyboardShortcutSettings,
  UpdateKeyboardShortcutBindingRequest
} from '../../shared/ipc/shortcut-contracts'
import {
  getKeyboardShortcutSettings,
  resetKeyboardShortcutSettings,
  updateKeyboardShortcutBinding
} from '../services/shortcutSettingsService'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function registerShortcutHandlers(): void {
  ipcMain.handle(ipcChannels.shortcutsGetSettings, () => {
    try {
      return ipcOk(getKeyboardShortcutSettings())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<KeyboardShortcutSettings>('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.shortcutsUpdateBinding, (_event, args: unknown) => {
    try {
      if (!isRecord(args)) {
        return ipcError<KeyboardShortcutSettings>(
          'VALIDATION_ERROR',
          'La solicitud de atajo no tiene un formato valido.'
        )
      }

      return ipcOk(
        updateKeyboardShortcutBinding(args as unknown as UpdateKeyboardShortcutBindingRequest)
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<KeyboardShortcutSettings>('CONFLICT', message)
    }
  })

  ipcMain.handle(ipcChannels.shortcutsResetDefaults, () => {
    try {
      return ipcOk(resetKeyboardShortcutSettings())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<KeyboardShortcutSettings>('INTERNAL_ERROR', message)
    }
  })
}
