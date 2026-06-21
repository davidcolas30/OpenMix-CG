/**
 * mixerSettingsService — Persistencia de la configuración de monitorización del mixer.
 *
 * Sigue el mismo patrón que outputService: settings JSON en userData,
 * carga lazy, sanitización de valores, y persistencia síncrona.
 *
 * Fase 7: Configurable monitor resolution para Preview/Program.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  DEFAULT_MIXER_MONITOR_SETTINGS,
  MIXER_MONITOR_RESOLUTION_PRESETS,
  type MixerMonitorSettings,
  type MixerMonitorResolution
} from '../../shared/ipc/mixer-contracts'

const MIXER_SETTINGS_FILE_NAME = 'mixer-monitor-settings.json'

let persistedSettings: MixerMonitorSettings | null = null

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), MIXER_SETTINGS_FILE_NAME)
}

function sanitizeMonitorSettings(candidate?: Partial<MixerMonitorSettings>): MixerMonitorSettings {
  const validResolutions = Object.keys(MIXER_MONITOR_RESOLUTION_PRESETS) as MixerMonitorResolution[]
  const monitorResolution =
    candidate?.monitorResolution && validResolutions.includes(candidate.monitorResolution)
      ? candidate.monitorResolution
      : DEFAULT_MIXER_MONITOR_SETTINGS.monitorResolution

  return {
    monitorResolution
  }
}

function ensureSettingsLoaded(): void {
  if (persistedSettings) {
    return
  }

  const filePath = getSettingsFilePath()
  if (!existsSync(filePath)) {
    persistedSettings = { ...DEFAULT_MIXER_MONITOR_SETTINGS }
    return
  }

  try {
    const rawText = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(rawText) as Partial<MixerMonitorSettings>
    persistedSettings = sanitizeMonitorSettings(parsed)
  } catch (error) {
    console.error('[MixerSettings] Error leyendo settings persistidos:', error)
    persistedSettings = { ...DEFAULT_MIXER_MONITOR_SETTINGS }
  }
}

function persistSettingsToDisk(settings: MixerMonitorSettings): void {
  const filePath = getSettingsFilePath()
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8')
}

/**
 * Devuelve los settings de monitorización cargados (lazy).
 */
export function getMixerMonitorSettings(): MixerMonitorSettings {
  ensureSettingsLoaded()
  return { ...persistedSettings! }
}

/**
 * Actualiza y persiste los settings de monitorización.
 */
export function updateMixerMonitorSettings(partial: Partial<MixerMonitorSettings>): MixerMonitorSettings {
  ensureSettingsLoaded()
  const next = sanitizeMonitorSettings({
    ...persistedSettings!,
    ...partial
  })
  persistedSettings = next
  persistSettingsToDisk(next)
  return { ...next }
}

/**
 * Resolución en píxeles para los monitores según el preset activo.
 */
export function getMonitorResolutionPixels(): { width: number; height: number } {
  const settings = getMixerMonitorSettings()
  return MIXER_MONITOR_RESOLUTION_PRESETS[settings.monitorResolution]
}
