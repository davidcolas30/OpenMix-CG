/**
 * Persistencia de ajustes de REC.
 *
 * Este modulo queda en el plano de control: solo normaliza opciones
 * serializables y las guarda en `userData`. La pipeline de media no pasa por
 * aqui.
 */

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_RECORDING_SETTINGS,
  type RecordingSettings
} from '../../../shared/ipc/output-contracts'

const RECORDING_SETTINGS_FILE_NAME = 'output-recording-settings.json'
const MIN_RECORDING_CRF = 18
const MAX_RECORDING_CRF = 28

let persistedRecordingSettings: RecordingSettings | null = null

function getRecordingSettingsFilePath(): string {
  return join(app.getPath('userData'), RECORDING_SETTINGS_FILE_NAME)
}

export function normalizeRecordingQualityCrf(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_RECORDING_SETTINGS.qualityCrf
  }

  return Math.max(MIN_RECORDING_CRF, Math.min(MAX_RECORDING_CRF, Math.round(value)))
}

export function sanitizeRecordingSettings(
  candidate?: Partial<RecordingSettings>
): RecordingSettings {
  const normalizedDirectory = candidate?.directory?.trim() ? candidate.directory.trim() : null
  const container = candidate?.container === 'mkv' ? 'mkv' : DEFAULT_RECORDING_SETTINGS.container
  const videoPreset =
    candidate?.videoPreset === 'fast' ||
    candidate?.videoPreset === 'medium' ||
    candidate?.videoPreset === 'veryfast'
      ? candidate.videoPreset
      : DEFAULT_RECORDING_SETTINGS.videoPreset

  return {
    directory: normalizedDirectory,
    container,
    videoPreset,
    qualityCrf: normalizeRecordingQualityCrf(candidate?.qualityCrf)
  }
}

function ensureRecordingSettingsLoaded(): void {
  if (persistedRecordingSettings) {
    return
  }

  const filePath = getRecordingSettingsFilePath()
  if (!existsSync(filePath)) {
    persistedRecordingSettings = { ...DEFAULT_RECORDING_SETTINGS }
    return
  }

  try {
    const rawText = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(rawText) as Partial<RecordingSettings>
    persistedRecordingSettings = sanitizeRecordingSettings(parsed)
  } catch (error) {
    console.error('Error leyendo las opciones persistidas de grabación:', error)
    persistedRecordingSettings = { ...DEFAULT_RECORDING_SETTINGS }
  }
}

function persistRecordingSettingsToDisk(settings: RecordingSettings): void {
  const filePath = getRecordingSettingsFilePath()
  writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8')
}

export function getPersistedRecordingSettings(): RecordingSettings {
  ensureRecordingSettingsLoaded()
  return { ...persistedRecordingSettings! }
}

export function updatePersistedRecordingSettings(
  nextSettings?: Partial<RecordingSettings>
): RecordingSettings {
  ensureRecordingSettingsLoaded()
  const mergedSettings = sanitizeRecordingSettings({
    ...persistedRecordingSettings,
    ...nextSettings
  })

  persistedRecordingSettings = mergedSettings
  persistRecordingSettingsToDisk(mergedSettings)
  return { ...mergedSettings }
}
