/**
 * shortcutSettingsService — Persistencia de atajos de teclado.
 *
 * Main Process guarda y valida esta configuracion porque implica acceso a disco.
 * El Renderer solo consume el resultado serializable y ejecuta acciones ya
 * expuestas por window.openMix, igual que si el operador pulsara un boton.
 */

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_KEYBOARD_SHORTCUT_BINDINGS,
  KEYBOARD_SHORTCUT_ACTIONS,
  createDefaultKeyboardShortcutSettings,
  isKeyboardShortcutActionId,
  serializeKeyboardShortcutAccelerator,
  type KeyboardShortcutAccelerator,
  type KeyboardShortcutBinding,
  type KeyboardShortcutSettings,
  type UpdateKeyboardShortcutBindingRequest
} from '../../shared/ipc/shortcut-contracts'

const SHORTCUT_SETTINGS_FILE_NAME = 'keyboard-shortcuts.json'

let cachedSettings: KeyboardShortcutSettings | null = null

function getShortcutSettingsFilePath(): string {
  return join(app.getPath('userData'), SHORTCUT_SETTINGS_FILE_NAME)
}

function cloneBinding(binding: KeyboardShortcutBinding): KeyboardShortcutBinding {
  return {
    ...binding,
    accelerator: binding.accelerator ? { ...binding.accelerator } : null
  }
}

function cloneSettings(settings: KeyboardShortcutSettings): KeyboardShortcutSettings {
  return {
    ...settings,
    bindings: settings.bindings.map(cloneBinding)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function sanitizeAccelerator(value: unknown): KeyboardShortcutAccelerator | null {
  if (value === null) {
    return null
  }
  if (!isRecord(value)) {
    return null
  }

  const code = typeof value.code === 'string' ? value.code.trim() : ''
  const key = typeof value.key === 'string' ? value.key : ''

  if (!code) {
    return null
  }

  return {
    code,
    key: key || code,
    altKey: normalizeBoolean(value.altKey, false),
    ctrlKey: normalizeBoolean(value.ctrlKey, false),
    metaKey: normalizeBoolean(value.metaKey, false),
    shiftKey: normalizeBoolean(value.shiftKey, false)
  }
}

function sanitizeBinding(
  value: unknown,
  fallback: KeyboardShortcutBinding
): KeyboardShortcutBinding {
  if (!isRecord(value)) {
    return cloneBinding(fallback)
  }

  const accelerator = sanitizeAccelerator(value.accelerator)
  const enabled = normalizeBoolean(value.enabled, fallback.enabled) && accelerator !== null

  return {
    actionId: fallback.actionId,
    accelerator,
    enabled
  }
}

function sanitizeSettings(value: unknown): KeyboardShortcutSettings {
  const fallbackSettings = createDefaultKeyboardShortcutSettings()
  if (!isRecord(value)) {
    return fallbackSettings
  }

  const rawBindings = Array.isArray(value.bindings) ? value.bindings : []
  const bindingsByActionId = new Map<string, unknown>()

  for (const rawBinding of rawBindings) {
    if (!isRecord(rawBinding) || !isKeyboardShortcutActionId(rawBinding.actionId)) {
      continue
    }
    bindingsByActionId.set(rawBinding.actionId, rawBinding)
  }

  const usedAccelerators = new Set<string>()
  const bindings = DEFAULT_KEYBOARD_SHORTCUT_BINDINGS.map((fallbackBinding) => {
    const candidate = bindingsByActionId.get(fallbackBinding.actionId)
    const nextBinding = sanitizeBinding(candidate, fallbackBinding)

    if (!nextBinding.enabled || !nextBinding.accelerator) {
      return nextBinding
    }

    const serialized = serializeKeyboardShortcutAccelerator(nextBinding.accelerator)
    if (usedAccelerators.has(serialized)) {
      return {
        ...nextBinding,
        accelerator: null,
        enabled: false
      }
    }

    usedAccelerators.add(serialized)
    return nextBinding
  })

  return {
    schemaVersion: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    bindings
  }
}

function persistSettings(settings: KeyboardShortcutSettings): void {
  writeFileSync(getShortcutSettingsFilePath(), JSON.stringify(settings, null, 2), 'utf8')
}

function ensureSettingsLoaded(): void {
  if (cachedSettings) {
    return
  }

  const filePath = getShortcutSettingsFilePath()
  if (!existsSync(filePath)) {
    cachedSettings = createDefaultKeyboardShortcutSettings()
    persistSettings(cachedSettings)
    return
  }

  try {
    const rawText = readFileSync(filePath, 'utf8')
    cachedSettings = sanitizeSettings(JSON.parse(rawText) as unknown)
  } catch (error) {
    console.error('[Shortcuts] No se pudo leer la configuracion persistida:', error)
    cachedSettings = createDefaultKeyboardShortcutSettings()
  }
}

function findActionLabel(actionId: string): string {
  return (
    KEYBOARD_SHORTCUT_ACTIONS.find((definition) => definition.id === actionId)?.label ?? actionId
  )
}

function ensureNoShortcutConflict(
  settings: KeyboardShortcutSettings,
  changedActionId?: string
): void {
  const seenByAccelerator = new Map<string, KeyboardShortcutBinding>()

  for (const binding of settings.bindings) {
    if (!binding.enabled || !binding.accelerator) {
      continue
    }

    const serialized = serializeKeyboardShortcutAccelerator(binding.accelerator)
    const existing = seenByAccelerator.get(serialized)
    if (!existing) {
      seenByAccelerator.set(serialized, binding)
      continue
    }

    const labelA = findActionLabel(existing.actionId)
    const labelB = findActionLabel(binding.actionId)
    const suffix = changedActionId ? ` (${findActionLabel(changedActionId)})` : ''
    throw new Error(
      `El atajo ya esta asignado a "${labelA}" y entra en conflicto con "${labelB}"${suffix}.`
    )
  }
}

export function getKeyboardShortcutSettings(): KeyboardShortcutSettings {
  ensureSettingsLoaded()
  return cloneSettings(cachedSettings ?? createDefaultKeyboardShortcutSettings())
}

export function updateKeyboardShortcutBinding(
  request: UpdateKeyboardShortcutBindingRequest
): KeyboardShortcutSettings {
  ensureSettingsLoaded()

  if (!isKeyboardShortcutActionId(request.actionId)) {
    throw new Error('Accion de atajo no reconocida.')
  }

  const currentSettings = getKeyboardShortcutSettings()
  const nextBinding = sanitizeBinding(
    {
      actionId: request.actionId,
      accelerator: request.accelerator,
      enabled: request.enabled ?? request.accelerator !== null
    },
    {
      actionId: request.actionId,
      accelerator: null,
      enabled: false
    }
  )
  const nextSettings: KeyboardShortcutSettings = {
    ...currentSettings,
    updatedAt: new Date().toISOString(),
    bindings: currentSettings.bindings.map((binding) =>
      binding.actionId === request.actionId ? nextBinding : binding
    )
  }

  ensureNoShortcutConflict(nextSettings, request.actionId)
  cachedSettings = nextSettings
  persistSettings(nextSettings)

  return cloneSettings(nextSettings)
}

export function resetKeyboardShortcutSettings(): KeyboardShortcutSettings {
  cachedSettings = createDefaultKeyboardShortcutSettings()
  persistSettings(cachedSettings)
  return cloneSettings(cachedSettings)
}
