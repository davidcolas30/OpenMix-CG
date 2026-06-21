/**
 * registerOutputHandlers.ts — Handlers IPC del módulo de output.
 */

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { ipcChannels } from '../../shared/ipc/channels'
import { ipcError, ipcOk } from '../../shared/ipc/contracts'
import type {
  OutputRecordingState,
  RecordingSettings,
  RecordingDirectoryResult,
  StartRecordingRequest
} from '../../shared/ipc/output-contracts'
import { isMixerActive } from '../services/mixerService'
import {
  getDefaultRecordingDirectory,
  getRecordingState,
  getRecordingSettings,
  startRecording,
  stopRecording,
  updateRecordingSettings
} from '../services/outputService'

export function registerOutputHandlers(): void {
  ipcMain.handle(ipcChannels.outputStartRecording, async (_event, args?: StartRecordingRequest) => {
    try {
      if (!isMixerActive()) {
        return ipcError<OutputRecordingState>(
          'CONFLICT',
          'No se puede grabar sin el mixer activo, porque todavía no existe una salida Program estable.'
        )
      }

      return ipcOk(await startRecording(args))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<OutputRecordingState>('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.outputStopRecording, async () => {
    try {
      return ipcOk(await stopRecording())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<OutputRecordingState>('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.outputGetRecordingState, () => {
    try {
      return ipcOk(getRecordingState())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<OutputRecordingState>('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(ipcChannels.outputGetRecordingSettings, () => {
    try {
      return ipcOk(getRecordingSettings())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<RecordingSettings>('INTERNAL_ERROR', message)
    }
  })

  ipcMain.handle(
    ipcChannels.outputUpdateRecordingSettings,
    (_event, args?: Partial<RecordingSettings>) => {
      try {
        return ipcOk(updateRecordingSettings(args))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return ipcError<RecordingSettings>('INTERNAL_ERROR', message)
      }
    }
  )

  ipcMain.handle(ipcChannels.outputChooseRecordingDirectory, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow()
      const dialogOptions: OpenDialogOptions = {
        title: 'Seleccionar carpeta de grabaciones',
        defaultPath: getDefaultRecordingDirectory(),
        properties: ['openDirectory', 'createDirectory']
      }
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      const data: RecordingDirectoryResult = {
        directory: result.canceled ? null : (result.filePaths[0] ?? null)
      }

      return ipcOk(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      return ipcError<RecordingDirectoryResult>('INTERNAL_ERROR', message)
    }
  })
}
