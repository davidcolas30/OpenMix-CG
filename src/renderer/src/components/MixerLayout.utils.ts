import type { GraphicsItemState, GraphicsState } from '../../../shared/ipc/graphics-contracts'
import type { OutputRecordingState } from '../../../shared/ipc/output-contracts'
import type {
  KeyboardShortcutAccelerator,
  KeyboardShortcutBinding,
  KeyboardShortcutSettings
} from '../../../shared/ipc/shortcut-contracts'
import { serializeKeyboardShortcutAccelerator } from '../../../shared/ipc/shortcut-contracts'
import type { LocalVideoSourceIndex } from '../../../shared/ipc/source-contracts'
import {
  DEFAULT_MONITOR_SIZE,
  MIN_GRAPHICS_SIDEBAR_HEIGHT,
  MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT,
  MIN_MONITOR_WORKSPACE_WIDTH,
  MIN_MULTIVIEW_HEIGHT,
  MIN_QR_SIDEBAR_HEIGHT,
  MIN_SIDEBAR_WIDTH,
  MULTIVIEW_ITEM_GAP,
  MULTIVIEW_NATIVE_ASPECT_RATIO,
  MULTIVIEW_PANEL_HORIZONTAL_PADDING,
  MULTIVIEW_PANEL_VERTICAL_CHROME,
  MULTIVIEW_RESIZER_HEIGHT,
  SIDEBAR_RESIZER_WIDTH,
  SIDEBAR_SECTION_GAP,
  SIDEBAR_SECTION_RESIZER_HEIGHT
} from './MixerLayout.constants'
import type { IpcResult, PanelSize } from './MixerLayout.types'

export function readIpcResult<T>(result: IpcResult<T>, fallbackMessage: string): T {
  if (!result.ok) {
    throw new Error(result.error.message || fallbackMessage)
  }

  return result.data
}

export function getSelectedGraphicsItem(graphicsState: GraphicsState): GraphicsItemState | null {
  return graphicsState.items.find((item) => item.itemId === graphicsState.selectedItemId) ?? null
}

export function isLocalVideoSourceIndex(value: number): value is LocalVideoSourceIndex {
  return value === 1 || value === 2 || value === 3
}

export function shortcutAcceleratorFromKeyboardEvent(
  event: KeyboardEvent
): KeyboardShortcutAccelerator {
  return {
    code: event.code,
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  }
}

export function findShortcutBindingForEvent(
  settings: KeyboardShortcutSettings,
  event: KeyboardEvent
): KeyboardShortcutBinding | null {
  const accelerator = shortcutAcceleratorFromKeyboardEvent(event)
  const serializedAccelerator = serializeKeyboardShortcutAccelerator(accelerator)

  return (
    settings.bindings.find(
      (binding) =>
        binding.enabled &&
        binding.accelerator !== null &&
        serializeKeyboardShortcutAccelerator(binding.accelerator) === serializedAccelerator
    ) ?? null
  )
}

export function shouldIgnoreKeyboardShortcut(event: KeyboardEvent): boolean {
  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(0, Math.round(sizeBytes / 1024))} KB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getRecordingStatusLabel(status: OutputRecordingState['status']): string {
  switch (status) {
    case 'recording':
      return 'Grabando'
    case 'stopping':
      return 'Cerrando'
    case 'error':
      return 'Error REC'
    default:
      return 'REC inactivo'
  }
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function getSidebarWidthRange(workspaceWidth: number): { min: number; max: number } {
  const computedMax = Math.min(
    Math.floor(workspaceWidth * 0.42),
    workspaceWidth - MIN_MONITOR_WORKSPACE_WIDTH - SIDEBAR_RESIZER_WIDTH
  )
  const max = Math.max(180, computedMax)
  const min = Math.min(MIN_SIDEBAR_WIDTH, max)

  return { min, max }
}

export function clampSidebarWidth(value: number, workspaceWidth: number): number {
  const { min, max } = getSidebarWidthRange(workspaceWidth)
  return clampNumber(value, min, max)
}

export function getMaxSidebarFixedHeight(workspaceHeight: number): number {
  const fixedGaps = SIDEBAR_SECTION_GAP * 4 + SIDEBAR_SECTION_RESIZER_HEIGHT * 2
  const maxFixedHeight = workspaceHeight - MIN_QR_SIDEBAR_HEIGHT - fixedGaps

  return Math.max(MIN_GRAPHICS_SIDEBAR_HEIGHT + MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT, maxFixedHeight)
}

export function getMaxMultiviewHeight(workspaceHeight: number): number {
  return Math.max(MIN_MULTIVIEW_HEIGHT, Math.floor(workspaceHeight * 0.5))
}

export function resolveMonitorCanvasSize(
  workspaceSize: PanelSize,
  multiviewHeight: number,
  isRunning: boolean
): PanelSize {
  if (workspaceSize.width === 0 || workspaceSize.height === 0) {
    return DEFAULT_MONITOR_SIZE
  }

  const aspectRatio = 16 / 9
  const reservedControlsWidth = isRunning ? 120 : 96
  const horizontalChrome = 92
  const verticalChrome = 72
  const monitorAreaHeight = workspaceSize.height - multiviewHeight - MULTIVIEW_RESIZER_HEIGHT
  const maxWidth = Math.floor((workspaceSize.width - reservedControlsWidth - horizontalChrome) / 2)
  const maxHeight = Math.floor(monitorAreaHeight - verticalChrome)
  const width = clampNumber(Math.min(maxWidth, Math.floor(maxHeight * aspectRatio)), 280, 960)

  return {
    width,
    height: Math.round(width / aspectRatio)
  }
}

export function resolveNativeMultiviewLayout(
  workspaceWidth: number,
  multiviewHeight: number,
  includesGraphicsSlot: boolean
): { native: PanelSize; graphics?: PanelSize } {
  const availableWidth = Math.max(260, workspaceWidth - MULTIVIEW_PANEL_HORIZONTAL_PADDING)
  const availableHeight = Math.max(84, multiviewHeight - MULTIVIEW_PANEL_VERTICAL_CHROME)
  const graphicsAspectRatio = 16 / 9
  const totalAspectRatio =
    MULTIVIEW_NATIVE_ASPECT_RATIO + (includesGraphicsSlot ? graphicsAspectRatio : 0)
  const horizontalGap = includesGraphicsSlot ? MULTIVIEW_ITEM_GAP : 0
  const height = clampNumber(
    Math.min(availableHeight, (availableWidth - horizontalGap) / totalAspectRatio),
    84,
    260
  )
  const nativeSize = {
    width: Math.round(height * MULTIVIEW_NATIVE_ASPECT_RATIO),
    height
  }
  const graphicsSize = {
    width: Math.round(height * graphicsAspectRatio),
    height
  }

  return {
    native: nativeSize,
    graphics: includesGraphicsSlot ? graphicsSize : undefined
  }
}
