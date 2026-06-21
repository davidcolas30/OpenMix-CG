/**
 * Resolucion y validacion del destino de REC.
 *
 * Aqui vive la parte de sistema de ficheros: carpeta por defecto, nombre del
 * archivo, lectura de tamano y comprobacion preventiva de espacio disponible.
 */

import { app } from 'electron'
import { existsSync, mkdirSync, statfsSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { RecordingContainer, RecordingSettings } from '../../../shared/ipc/output-contracts'

export interface ProgramFrameInfo {
  width: number
  height: number
}

export const DEFAULT_PROGRAM_FRAME: ProgramFrameInfo = {
  width: 1920,
  height: 1080
}

const RECORDINGS_FOLDER_NAME = 'OpenMix-CG'
const MIN_RECORDING_HEADROOM_BYTES = 256 * 1024 * 1024
const MIN_RECORDING_HEADROOM_MINUTES = 2
const RECORDING_HEADROOM_SAFETY_FACTOR = 1.25
const REFERENCE_RECORDING_AREA = DEFAULT_PROGRAM_FRAME.width * DEFAULT_PROGRAM_FRAME.height
const ESTIMATED_OUTPUT_MEGABITS_PER_SECOND: Record<RecordingSettings['videoPreset'], number> = {
  veryfast: 12,
  fast: 10,
  medium: 8
}

export function resolveDefaultRecordingDirectory(): string {
  return join(app.getPath('videos'), RECORDINGS_FOLDER_NAME)
}

export function resolveRecordingDirectory(directory?: string): string {
  return resolve(
    directory && directory.trim().length > 0 ? directory : resolveDefaultRecordingDirectory()
  )
}

function formatTimestampSegment(value: number): string {
  return String(value).padStart(2, '0')
}

export function buildRecordingFilePath(directory: string, container: RecordingContainer): string {
  const now = new Date()
  const fileName = [
    'OpenMix-CG',
    `${now.getFullYear()}-${formatTimestampSegment(now.getMonth() + 1)}-${formatTimestampSegment(now.getDate())}`,
    `${formatTimestampSegment(now.getHours())}-${formatTimestampSegment(now.getMinutes())}-${formatTimestampSegment(now.getSeconds())}`
  ].join('_')

  return join(directory, `${fileName}.${container}`)
}

function formatByteCountForMessage(value: number | bigint): string {
  const size = typeof value === 'bigint' ? Number(value) : Math.max(0, value)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unitIndex = 0
  let currentValue = size

  while (currentValue >= 1024 && unitIndex < units.length - 1) {
    currentValue /= 1024
    unitIndex += 1
  }

  const decimals = unitIndex >= 2 ? 1 : 0
  return `${currentValue.toFixed(decimals)} ${units[unitIndex]}`
}

export function ensureRecordingTargetDirectory(directory: string, allowAutoCreate: boolean): void {
  if (!existsSync(directory)) {
    // Si el usuario apuntaba a un disco externo desmontado, recrear la ruta
    // silenciosamente seria peor que fallar con un mensaje claro.
    if (!allowAutoCreate) {
      throw new Error(
        'La carpeta de grabación configurada no existe. Si está en un disco externo, comprueba que siga montado.'
      )
    }

    mkdirSync(directory, { recursive: true })
  }

  if (!statSync(directory).isDirectory()) {
    throw new Error('La ruta de grabación configurada no es una carpeta válida.')
  }
}

function getAvailableRecordingBytes(directory: string): bigint {
  const fileSystemStats = statfsSync(directory, { bigint: true })
  return fileSystemStats.bavail * fileSystemStats.bsize
}

function estimateRequiredRecordingHeadroomBytes(
  frameInfo: ProgramFrameInfo,
  settings: RecordingSettings
): bigint {
  const areaScale = (frameInfo.width * frameInfo.height) / Math.max(1, REFERENCE_RECORDING_AREA)
  const estimatedMegabitsPerSecond =
    ESTIMATED_OUTPUT_MEGABITS_PER_SECOND[settings.videoPreset] * areaScale
  const estimatedBytesPerSecond = (estimatedMegabitsPerSecond * 1_000_000) / 8
  const estimatedHeadroomBytes = Math.ceil(
    estimatedBytesPerSecond * 60 * MIN_RECORDING_HEADROOM_MINUTES * RECORDING_HEADROOM_SAFETY_FACTOR
  )

  return BigInt(Math.max(MIN_RECORDING_HEADROOM_BYTES, estimatedHeadroomBytes))
}

export function ensureAvailableRecordingSpace(
  directory: string,
  frameInfo: ProgramFrameInfo,
  settings: RecordingSettings
): void {
  const availableBytes = getAvailableRecordingBytes(directory)
  const requiredBytes = estimateRequiredRecordingHeadroomBytes(frameInfo, settings)

  if (availableBytes >= requiredBytes) {
    return
  }

  throw new Error(
    `Espacio insuficiente en la carpeta de grabación. Disponibles ${formatByteCountForMessage(availableBytes)}; ` +
      `se recomiendan al menos ${formatByteCountForMessage(requiredBytes)} para iniciar REC con margen de seguridad.`
  )
}

export function readCurrentFileSize(filePath: string | null): number {
  if (!filePath || !existsSync(filePath)) {
    return 0
  }

  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}
