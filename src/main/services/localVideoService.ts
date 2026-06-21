/**
 * localVideoService — Fuentes de vídeo local para el mixer.
 *
 * El Renderer solo elige un fichero y un slot. El fichero no viaja por IPC:
 * Main valida la ruta, la convierte a file:// y el addon nativo decodifica el
 * vídeo dentro de GStreamer, alimentando los mismos selectores que WebRTC.
 */

import { BrowserWindow, dialog } from 'electron'
import { basename, extname, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import { statSync } from 'fs'
import type {
  ChooseLocalVideoResult,
  LocalVideoSourcesChangedEvent,
  LocalVideoSourceInfo,
  LoadLocalVideoSourceRequest,
  SetLocalVideoAutoPlayRequest,
  SetLocalVideoLoopRequest,
  SetLocalVideoPausedRequest
} from '../../shared/ipc/source-contracts'
import {
  isMixerMediaSourceIndex,
  isWebRtcSlotReserved,
  reserveLocalVideoSlot,
  releaseLocalVideoSlot,
  clearLocalVideoSlots,
  hasReservedLocalVideoSlots
} from './sourceSlotRegistry'
import { nativeGStreamerAddon as addon } from './nativeAddon'

const VIDEO_FILE_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'])
const requestedCuePauseDelayMs = Number(process.env.OPENMIX_LOCAL_VIDEO_CUE_PAUSE_MS ?? 120)
const LOCAL_VIDEO_CUE_PAUSE_DELAY_MS = Number.isFinite(requestedCuePauseDelayMs)
  ? Math.max(40, Math.min(1000, Math.round(requestedCuePauseDelayMs)))
  : 120

const localVideoSources = new Map<number, LocalVideoSourceInfo>()
const nativeLoadedLocalVideoSlots = new Set<number>()
const localVideoSourcesListeners = new Set<(event: LocalVideoSourcesChangedEvent) => void>()

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emitLocalVideoSourcesChanged(): void {
  const event: LocalVideoSourcesChangedEvent = { sources: listLocalVideoSources() }
  for (const listener of localVideoSourcesListeners) {
    try {
      listener(event)
    } catch (error) {
      console.warn('[LocalVideoService] No se pudo notificar el estado de vídeo local', error)
    }
  }
}

export function subscribeLocalVideoSourcesChanged(
  listener: (event: LocalVideoSourcesChangedEvent) => void
): () => void {
  localVideoSourcesListeners.add(listener)
  return () => {
    localVideoSourcesListeners.delete(listener)
  }
}

async function cueNativeLocalVideo(
  sourceIndex: 1 | 2 | 3,
  filePath: string,
  loop: boolean
): Promise<void> {
  addon.clearLocalVideoSource(sourceIndex)
  nativeLoadedLocalVideoSlots.delete(sourceIndex)

  const loaded = addon.loadLocalVideoSource(sourceIndex, pathToFileURL(filePath).toString())
  if (!loaded) {
    throw new Error('GStreamer no pudo cargar el vídeo local')
  }
  nativeLoadedLocalVideoSlots.add(sourceIndex)
  if (loop) {
    addon.setLocalVideoLoop(sourceIndex, true)
  }

  /*
   * Dejamos que decodebin publique el pad de vídeo y que llegue el primer
   * frame al selector antes de pausar. Si se pausa antes de esa negociación,
   * GStreamer puede seguir prerrolleando y consumir timeline por detrás.
   */
  await waitMs(LOCAL_VIDEO_CUE_PAUSE_DELAY_MS)
  const paused = addon.setLocalVideoPaused(sourceIndex, true)
  if (!paused) {
    addon.clearLocalVideoSource(sourceIndex)
    nativeLoadedLocalVideoSlots.delete(sourceIndex)
    throw new Error('GStreamer no pudo dejar el vídeo local en pausa')
  }
}

function assertLoadRequest(request: LoadLocalVideoSourceRequest): {
  sourceIndex: 1 | 2 | 3
  filePath: string
} {
  if (!request || typeof request !== 'object') {
    throw new Error('Solicitud de vídeo local inválida')
  }

  const sourceIndex = Number(request.sourceIndex)
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El vídeo local solo puede cargarse en las fuentes 1, 2 o 3')
  }

  if (typeof request.filePath !== 'string' || request.filePath.trim() === '') {
    throw new Error('Ruta de vídeo local vacía')
  }

  const filePath = request.filePath
  if (!isAbsolute(filePath)) {
    throw new Error('La ruta del vídeo local debe ser absoluta')
  }

  const stats = statSync(filePath)
  if (!stats.isFile()) {
    throw new Error('La ruta seleccionada no es un fichero de vídeo')
  }

  const extension = extname(filePath).toLowerCase()
  if (extension && !VIDEO_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`Extensión de vídeo no soportada: ${extension}`)
  }

  return { sourceIndex, filePath }
}

export async function chooseLocalVideoFile(
  parentWindow: BrowserWindow
): Promise<ChooseLocalVideoResult> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Seleccionar vídeo local',
    properties: ['openFile'],
    filters: [
      { name: 'Vídeo', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'] },
      { name: 'Todos los ficheros', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]
  const stats = statSync(filePath)
  return {
    canceled: false,
    file: {
      path: filePath,
      name: basename(filePath),
      sizeBytes: stats.size
    }
  }
}

export async function loadLocalVideoSource(
  request: LoadLocalVideoSourceRequest
): Promise<LocalVideoSourceInfo> {
  const { sourceIndex, filePath } = assertLoadRequest(request)
  if (isWebRtcSlotReserved(sourceIndex)) {
    throw new Error(`La fuente ${sourceIndex} está ocupada por una cámara WebRTC`)
  }

  releaseLocalVideoSlot(sourceIndex)
  localVideoSources.delete(sourceIndex)

  reserveLocalVideoSlot(sourceIndex)
  try {
    await cueNativeLocalVideo(sourceIndex, filePath, false)
  } catch (error) {
    releaseLocalVideoSlot(sourceIndex)
    throw error
  }
  const info: LocalVideoSourceInfo = {
    sourceIndex,
    path: filePath,
    name: basename(filePath),
    loadedAt: new Date().toISOString(),
    playbackState: 'paused',
    loop: false,
    autoPlayOnProgram: false
  }
  localVideoSources.set(sourceIndex, info)
  emitLocalVideoSourcesChanged()
  console.log(`[LocalVideoService] ${info.name} cargado en pausa en fuente ${sourceIndex}`)
  return info
}

export function clearLocalVideoSource(sourceIndex: number): LocalVideoSourceInfo[] {
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El índice de vídeo local debe estar entre 1 y 3')
  }

  addon.clearLocalVideoSource(sourceIndex)
  nativeLoadedLocalVideoSlots.delete(sourceIndex)
  localVideoSources.delete(sourceIndex)
  releaseLocalVideoSlot(sourceIndex)
  emitLocalVideoSourcesChanged()
  console.log(`[LocalVideoService] Fuente local ${sourceIndex} liberada`)
  return listLocalVideoSources()
}

export async function restartLocalVideoSource(sourceIndex: number): Promise<LocalVideoSourceInfo> {
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El índice de vídeo local debe estar entre 1 y 3')
  }

  const source = localVideoSources.get(sourceIndex)
  if (!source) {
    throw new Error(`No hay vídeo local cargado en la fuente ${sourceIndex}`)
  }

  await cueNativeLocalVideo(sourceIndex, source.path, source.loop)

  source.playbackState = 'paused'
  emitLocalVideoSourcesChanged()
  console.log(`[LocalVideoService] ${source.name} reiniciado en pausa en fuente ${sourceIndex}`)
  return source
}

function setLocalVideoPausedByIndex(
  sourceIndex: 1 | 2 | 3,
  paused: boolean,
  reason?: string
): LocalVideoSourceInfo {
  const source = localVideoSources.get(sourceIndex)
  if (!source) {
    throw new Error(`No hay vídeo local cargado en la fuente ${sourceIndex}`)
  }
  if (paused) {
    if (nativeLoadedLocalVideoSlots.has(sourceIndex)) {
      const updated = addon.setLocalVideoPaused(sourceIndex, true)
      if (!updated) {
        throw new Error('GStreamer no pudo pausar el vídeo local')
      }
    }
  } else if (!nativeLoadedLocalVideoSlots.has(sourceIndex)) {
    const loaded = addon.loadLocalVideoSource(sourceIndex, pathToFileURL(source.path).toString())
    if (!loaded) {
      throw new Error('GStreamer no pudo iniciar el vídeo local')
    }
    nativeLoadedLocalVideoSlots.add(sourceIndex)
    if (source.loop) {
      addon.setLocalVideoLoop(sourceIndex, true)
    }
  } else {
    const updated = addon.setLocalVideoPaused(sourceIndex, false)
    if (!updated) {
      throw new Error('GStreamer no pudo reanudar el vídeo local')
    }
  }

  source.playbackState = paused ? 'paused' : 'playing'
  emitLocalVideoSourcesChanged()
  const reasonSuffix = reason ? ` (${reason})` : ''
  console.log(
    `[LocalVideoService] ${source.name} ${paused ? 'pausado' : 'reanudado'}${reasonSuffix}`
  )
  return source
}

export function setLocalVideoPaused(request: SetLocalVideoPausedRequest): LocalVideoSourceInfo {
  if (!request || typeof request !== 'object') {
    throw new Error('Solicitud de pausa de vídeo local inválida')
  }

  const sourceIndex = Number(request.sourceIndex)
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El índice de vídeo local debe estar entre 1 y 3')
  }
  if (typeof request.paused !== 'boolean') {
    throw new Error('El estado de pausa debe ser booleano')
  }

  return setLocalVideoPausedByIndex(sourceIndex, request.paused)
}

export function setLocalVideoLoop(request: SetLocalVideoLoopRequest): LocalVideoSourceInfo {
  if (!request || typeof request !== 'object') {
    throw new Error('Solicitud de loop de vídeo local inválida')
  }

  const sourceIndex = Number(request.sourceIndex)
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El índice de vídeo local debe estar entre 1 y 3')
  }

  const source = localVideoSources.get(sourceIndex)
  if (!source) {
    throw new Error(`No hay vídeo local cargado en la fuente ${sourceIndex}`)
  }
  if (typeof request.loop !== 'boolean') {
    throw new Error('El estado de loop debe ser booleano')
  }

  const loop = request.loop
  const updated = addon.setLocalVideoLoop(sourceIndex, loop)
  if (!updated) {
    throw new Error('GStreamer no pudo actualizar el loop del vídeo local')
  }

  source.loop = loop
  emitLocalVideoSourcesChanged()
  console.log(`[LocalVideoService] ${source.name} loop=${loop ? 'on' : 'off'}`)
  return source
}

export function setLocalVideoAutoPlay(request: SetLocalVideoAutoPlayRequest): LocalVideoSourceInfo {
  if (!request || typeof request !== 'object') {
    throw new Error('Solicitud de auto play de vídeo local inválida')
  }

  const sourceIndex = Number(request.sourceIndex)
  if (!isMixerMediaSourceIndex(sourceIndex)) {
    throw new Error('El índice de vídeo local debe estar entre 1 y 3')
  }

  const source = localVideoSources.get(sourceIndex)
  if (!source) {
    throw new Error(`No hay vídeo local cargado en la fuente ${sourceIndex}`)
  }
  if (typeof request.autoPlayOnProgram !== 'boolean') {
    throw new Error('El estado de auto play debe ser booleano')
  }

  source.autoPlayOnProgram = request.autoPlayOnProgram
  emitLocalVideoSourcesChanged()
  console.log(
    `[LocalVideoService] ${source.name} autoProgram=${source.autoPlayOnProgram ? 'on' : 'off'}`
  )
  return source
}

export function resumeLocalVideoOnProgramEnter(sourceIndex: number): void {
  if (!isMixerMediaSourceIndex(sourceIndex)) return
  const source = localVideoSources.get(sourceIndex)
  if (!source?.autoPlayOnProgram) return

  try {
    setLocalVideoPausedByIndex(sourceIndex, false, 'entra en Program')
  } catch (error) {
    console.warn(
      '[LocalVideoService] No se pudo reanudar el vídeo local al entrar en Program',
      error
    )
  }
}

export function pauseLocalVideoOnProgramExit(sourceIndex: number): void {
  if (!isMixerMediaSourceIndex(sourceIndex)) return
  const source = localVideoSources.get(sourceIndex)
  if (!source?.autoPlayOnProgram) return

  try {
    setLocalVideoPausedByIndex(sourceIndex, true, 'sale de Program')
  } catch (error) {
    console.warn('[LocalVideoService] No se pudo pausar el vídeo local al salir de Program', error)
  }
}

export function listLocalVideoSources(): LocalVideoSourceInfo[] {
  return [...localVideoSources.values()].sort((a, b) => a.sourceIndex - b.sourceIndex)
}

export function getLocalVideoSourceNameOverrides(): Map<number, string> {
  return new Map(
    [...localVideoSources.values()].map((source) => [source.sourceIndex, `Vídeo: ${source.name}`])
  )
}

export function hasLocalVideoSources(): boolean {
  return hasReservedLocalVideoSlots()
}

export function clearLocalVideoSourcesForStoppedMixer(): void {
  localVideoSources.clear()
  nativeLoadedLocalVideoSlots.clear()
  clearLocalVideoSlots()
  emitLocalVideoSourcesChanged()
}
