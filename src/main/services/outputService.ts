/**
 * outputService — Grabación local del Program mediante GStreamer nativo.
 *
 * Este servicio pertenece al plano de control: valida carpetas, persiste
 * ajustes y actualiza estado serializable para la UI. El plano de media
 * se queda dentro del addon GStreamer: no recibimos buffers BGRA por IPC
 * ni alimentamos un proceso FFmpeg desde Electron.
 */

import { setMobileVideoQualityMode } from './signalingService'
import { nativeGStreamerAddon as addon } from './nativeAddon'
import {
  type OutputRecordingState,
  type RecordingContainer,
  type RecordingSettings,
  type StartRecordingRequest
} from '../../shared/ipc/output-contracts'
import {
  getPersistedRecordingSettings,
  normalizeRecordingQualityCrf,
  updatePersistedRecordingSettings
} from './output/recordingSettingsStore'
import {
  buildRecordingFilePath,
  DEFAULT_PROGRAM_FRAME,
  ensureAvailableRecordingSpace,
  ensureRecordingTargetDirectory,
  readCurrentFileSize,
  resolveDefaultRecordingDirectory,
  resolveRecordingDirectory
} from './output/recordingTarget'

let recordingState: OutputRecordingState = createIdleState()
let activeStopPromise: Promise<OutputRecordingState> | null = null
let nativeRecordingActive = false

function createIdleState(): OutputRecordingState {
  return {
    status: 'idle',
    filePath: null,
    directory: null,
    container: null,
    startedAt: null,
    durationMs: 0,
    sizeBytes: 0,
    lastError: null
  }
}

function resolveRecordingSettings(request: StartRecordingRequest = {}): RecordingSettings {
  const baseSettings = getRecordingSettings()

  return {
    directory: request.directory?.trim() ? request.directory.trim() : baseSettings.directory,
    container: request.container ?? baseSettings.container,
    videoPreset: request.videoPreset ?? baseSettings.videoPreset,
    qualityCrf: normalizeRecordingQualityCrf(request.qualityCrf)
  }
}

function setRecordingErrorState(
  message: string,
  directory: string | null,
  container: RecordingContainer | null
): void {
  recordingState = {
    status: 'error',
    filePath: null,
    directory,
    container,
    startedAt: null,
    durationMs: 0,
    sizeBytes: 0,
    lastError: message
  }
}

export async function startRecording(
  request: StartRecordingRequest = {}
): Promise<OutputRecordingState> {
  if (
    nativeRecordingActive ||
    recordingState.status === 'recording' ||
    recordingState.status === 'stopping'
  ) {
    throw new Error('Ya hay una grabación activa o en proceso de cierre.')
  }

  const settings = resolveRecordingSettings(request)
  const directory = resolveRecordingDirectory(settings.directory ?? undefined)
  const allowAutoCreateDirectory = !settings.directory?.trim()

  try {
    ensureRecordingTargetDirectory(directory, allowAutoCreateDirectory)

    const filePath = buildRecordingFilePath(directory, settings.container)
    ensureAvailableRecordingSpace(directory, DEFAULT_PROGRAM_FRAME, settings)

    recordingState = {
      status: 'recording',
      filePath,
      directory,
      container: settings.container,
      startedAt: Date.now(),
      durationMs: 0,
      sizeBytes: 0,
      lastError: null
    }

    setMobileVideoQualityMode('recording')
    addon.startProgramRecording(
      filePath,
      settings.container,
      settings.videoPreset,
      settings.qualityCrf
    )
    nativeRecordingActive = true
    return getRecordingState()
  } catch (error) {
    setMobileVideoQualityMode('monitor')
    nativeRecordingActive = false
    setRecordingErrorState(
      error instanceof Error ? error.message : 'No se pudo iniciar la grabación.',
      directory,
      settings.container
    )
    throw error
  }
}

export async function stopRecording(): Promise<OutputRecordingState> {
  if (!nativeRecordingActive) {
    return getRecordingState()
  }

  if (activeStopPromise) {
    return activeStopPromise
  }

  recordingState = {
    ...recordingState,
    status: 'stopping',
    sizeBytes: readCurrentFileSize(recordingState.filePath)
  }

  activeStopPromise = Promise.resolve().then(() => {
    try {
      addon.stopProgramRecording()
      setMobileVideoQualityMode('monitor')
      const nextDuration = recordingState.startedAt
        ? Math.max(0, Date.now() - recordingState.startedAt)
        : 0
      nativeRecordingActive = false
      recordingState = {
        ...recordingState,
        status: 'idle',
        durationMs: nextDuration,
        sizeBytes: readCurrentFileSize(recordingState.filePath),
        lastError: null
      }
      return getRecordingState()
    } catch (error) {
      setMobileVideoQualityMode('monitor')
      nativeRecordingActive = false
      recordingState = {
        ...recordingState,
        status: 'error',
        sizeBytes: readCurrentFileSize(recordingState.filePath),
        lastError: error instanceof Error ? error.message : 'No se pudo detener la grabación.'
      }
      throw error
    } finally {
      activeStopPromise = null
    }
  })

  return activeStopPromise
}

export async function stopRecordingIfActive(): Promise<void> {
  if (!nativeRecordingActive) {
    return
  }

  await stopRecording()
}

export function isRecordingActive(): boolean {
  return (
    nativeRecordingActive ||
    recordingState.status === 'recording' ||
    recordingState.status === 'stopping'
  )
}

export function getRecordingState(): OutputRecordingState {
  const durationMs = recordingState.startedAt
    ? Math.max(0, Date.now() - recordingState.startedAt)
    : recordingState.durationMs

  return {
    ...recordingState,
    durationMs,
    sizeBytes: readCurrentFileSize(recordingState.filePath)
  }
}

export function getRecordingSettings(): RecordingSettings {
  return getPersistedRecordingSettings()
}

export function updateRecordingSettings(
  nextSettings?: Partial<RecordingSettings>
): RecordingSettings {
  return updatePersistedRecordingSettings(nextSettings)
}

export function getDefaultRecordingDirectory(): string {
  return resolveDefaultRecordingDirectory()
}
