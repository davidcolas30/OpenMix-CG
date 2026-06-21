import { useCallback, useEffect, useState } from 'react'
import type { GraphicsState } from '../../../shared/ipc/graphics-contracts'
import type {
  KeyboardShortcutActionId,
  KeyboardShortcutSettings,
  UpdateKeyboardShortcutBindingRequest
} from '../../../shared/ipc/shortcut-contracts'
import type { LocalVideoSourceInfo } from '../../../shared/ipc/source-contracts'
import { useTransientStatusMessage } from './MixerLayout.hooks'
import type { IpcResult, WorkspaceView } from './MixerLayout.types'
import {
  findShortcutBindingForEvent,
  getSelectedGraphicsItem,
  isLocalVideoSourceIndex,
  readIpcResult,
  shouldIgnoreKeyboardShortcut
} from './MixerLayout.utils'

interface UseMixerKeyboardShortcutsOptions {
  activeView: WorkspaceView
  graphicsState: GraphicsState
  isRunning: boolean
  isTransitionInProgress: boolean
  numSources: number
  previewSource: number
  onAutoTransition: () => Promise<void>
  onCut: () => Promise<void>
  onHideGraphicsItem: (itemId: string) => Promise<void>
  onLocalVideoStarted: () => void
  onSelectPreview: (index: number) => Promise<void>
  onShowGraphicsItem: (itemId: string) => Promise<void>
}

export function useMixerKeyboardShortcuts({
  activeView,
  graphicsState,
  isRunning,
  isTransitionInProgress,
  numSources,
  previewSource,
  onAutoTransition,
  onCut,
  onHideGraphicsItem,
  onLocalVideoStarted,
  onSelectPreview,
  onShowGraphicsItem
}: UseMixerKeyboardShortcutsOptions): {
  keyboardShortcutSettings: KeyboardShortcutSettings | null
  keyboardShortcutStatusMessage: string | null
  activeShortcutCount: number
  setShortcutCaptureActive: (isActive: boolean) => void
  refreshKeyboardShortcutSettings: () => Promise<void>
  handleUpdateShortcutBinding: (request: UpdateKeyboardShortcutBindingRequest) => Promise<void>
  handleResetKeyboardShortcutDefaults: () => Promise<void>
} {
  const [keyboardShortcutSettings, setKeyboardShortcutSettings] =
    useState<KeyboardShortcutSettings | null>(null)
  const [isShortcutCaptureActive, setIsShortcutCaptureActive] = useState(false)
  const {
    statusMessage: keyboardShortcutStatusMessage,
    showStatusMessage: showKeyboardShortcutStatusMessage
  } = useTransientStatusMessage()

  const refreshKeyboardShortcutSettings = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.shortcuts.getSettings()) as IpcResult<KeyboardShortcutSettings>
      const nextSettings = readIpcResult(result, 'No se pudo obtener la configuración de atajos')
      setKeyboardShortcutSettings(nextSettings)
      showKeyboardShortcutStatusMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido cargando atajos'
      showKeyboardShortcutStatusMessage(message)
    }
  }, [showKeyboardShortcutStatusMessage])

  const handleUpdateShortcutBinding = useCallback(
    async (request: UpdateKeyboardShortcutBindingRequest): Promise<void> => {
      try {
        const result = (await window.openMix.shortcuts.updateBinding(
          request
        )) as IpcResult<KeyboardShortcutSettings>
        const nextSettings = readIpcResult(result, 'No se pudo actualizar el atajo')
        setKeyboardShortcutSettings(nextSettings)
        showKeyboardShortcutStatusMessage('Atajo actualizado')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido actualizando atajo'
        showKeyboardShortcutStatusMessage(message)
        throw err
      }
    },
    [showKeyboardShortcutStatusMessage]
  )

  const handleResetKeyboardShortcutDefaults = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.shortcuts.resetDefaults()) as IpcResult<KeyboardShortcutSettings>
      const nextSettings = readIpcResult(result, 'No se pudieron restablecer los atajos')
      setKeyboardShortcutSettings(nextSettings)
      showKeyboardShortcutStatusMessage('Atajos restablecidos a los valores por defecto')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido restableciendo atajos'
      showKeyboardShortcutStatusMessage(message)
    }
  }, [showKeyboardShortcutStatusMessage])

  const findPreviewLocalVideo = useCallback(async (): Promise<LocalVideoSourceInfo | null> => {
    if (!isLocalVideoSourceIndex(previewSource)) {
      return null
    }

    const result = (await window.openMix.sources.listLocalVideos()) as IpcResult<
      LocalVideoSourceInfo[]
    >
    const localVideos = readIpcResult(result, 'No se pudo consultar los videos locales')
    return localVideos.find((source) => source.sourceIndex === previewSource) ?? null
  }, [previewSource])

  const handleTogglePreviewLocalVideo = useCallback(async (): Promise<void> => {
    try {
      const source = await findPreviewLocalVideo()
      if (!source) {
        showKeyboardShortcutStatusMessage('No hay un video local cargado en Preview')
        return
      }

      const paused = source.playbackState !== 'paused'
      const result = (await window.openMix.sources.setLocalVideoPaused({
        sourceIndex: source.sourceIndex,
        paused
      })) as IpcResult<LocalVideoSourceInfo>
      const nextSource = readIpcResult(result, 'No se pudo cambiar la pausa del video local')

      if (!paused) {
        onLocalVideoStarted()
      }

      showKeyboardShortcutStatusMessage(`${nextSource.name} ${paused ? 'pausado' : 'reanudado'}`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido controlando el video local'
      showKeyboardShortcutStatusMessage(message)
    }
  }, [findPreviewLocalVideo, onLocalVideoStarted, showKeyboardShortcutStatusMessage])

  const handleRestartPreviewLocalVideo = useCallback(async (): Promise<void> => {
    try {
      const source = await findPreviewLocalVideo()
      if (!source) {
        showKeyboardShortcutStatusMessage('No hay un video local cargado en Preview')
        return
      }

      const result = (await window.openMix.sources.restartLocalVideo(
        source.sourceIndex
      )) as IpcResult<LocalVideoSourceInfo>
      const nextSource = readIpcResult(result, 'No se pudo reiniciar el video local')
      onLocalVideoStarted()
      showKeyboardShortcutStatusMessage(`${nextSource.name} reiniciado`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido reiniciando el video local'
      showKeyboardShortcutStatusMessage(message)
    }
  }, [findPreviewLocalVideo, onLocalVideoStarted, showKeyboardShortcutStatusMessage])

  const dispatchKeyboardShortcutAction = useCallback(
    async (actionId: KeyboardShortcutActionId): Promise<void> => {
      if (actionId === 'mixer.cut') {
        if (isRunning && !isTransitionInProgress) {
          await onCut()
        }
        return
      }

      if (actionId === 'mixer.auto') {
        if (isRunning && !isTransitionInProgress) {
          await onAutoTransition()
        }
        return
      }

      if (actionId.startsWith('preview.source.')) {
        const index = Number(actionId.replace('preview.source.', ''))
        if (isRunning && !isTransitionInProgress && index >= 0 && index < numSources) {
          await onSelectPreview(index)
        }
        return
      }

      if (actionId === 'graphics.show-selected') {
        const selectedItem = getSelectedGraphicsItem(graphicsState)
        if (selectedItem) {
          await onShowGraphicsItem(selectedItem.itemId)
        }
        return
      }

      if (actionId === 'graphics.hide-selected') {
        const selectedItem = getSelectedGraphicsItem(graphicsState)
        if (selectedItem) {
          await onHideGraphicsItem(selectedItem.itemId)
        }
        return
      }

      if (actionId === 'local-video.toggle-preview') {
        await handleTogglePreviewLocalVideo()
        return
      }

      if (actionId === 'local-video.restart-preview') {
        await handleRestartPreviewLocalVideo()
      }
    },
    [
      graphicsState,
      handleRestartPreviewLocalVideo,
      handleTogglePreviewLocalVideo,
      isRunning,
      isTransitionInProgress,
      numSources,
      onAutoTransition,
      onCut,
      onHideGraphicsItem,
      onSelectPreview,
      onShowGraphicsItem
    ]
  )

  useEffect(() => {
    if (!keyboardShortcutSettings || isShortcutCaptureActive || activeView === 'shortcuts') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || shouldIgnoreKeyboardShortcut(event)) {
        return
      }

      const binding = findShortcutBindingForEvent(keyboardShortcutSettings, event)
      if (!binding) {
        return
      }

      event.preventDefault()
      void dispatchKeyboardShortcutAction(binding.actionId)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [
    activeView,
    dispatchKeyboardShortcutAction,
    isShortcutCaptureActive,
    keyboardShortcutSettings
  ])

  const activeShortcutCount =
    keyboardShortcutSettings?.bindings.filter((binding) => binding.enabled && binding.accelerator)
      .length ?? 0

  return {
    keyboardShortcutSettings,
    keyboardShortcutStatusMessage,
    activeShortcutCount,
    setShortcutCaptureActive: setIsShortcutCaptureActive,
    refreshKeyboardShortcutSettings,
    handleUpdateShortcutBinding,
    handleResetKeyboardShortcutDefaults
  }
}
