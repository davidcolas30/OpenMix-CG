/**
 * Registro mínimo de ocupación de slots del mixer.
 *
 * OpenMix-CG mantiene cuatro fuentes fijas en la UI: barras + tres entradas
 * reales. Las cámaras WebRTC y los vídeos locales comparten esos tres slots,
 * así que la reserva debe vivir en Main Process antes de tocar GStreamer.
 */

export const MIXER_MEDIA_SOURCE_INDEXES = [1, 2, 3] as const
export type MixerMediaSourceIndex = (typeof MIXER_MEDIA_SOURCE_INDEXES)[number]

const localVideoSlots = new Set<MixerMediaSourceIndex>()
const webRtcSlots = new Set<MixerMediaSourceIndex>()

export function isMixerMediaSourceIndex(value: number): value is MixerMediaSourceIndex {
  return MIXER_MEDIA_SOURCE_INDEXES.includes(value as MixerMediaSourceIndex)
}

export function isLocalVideoSlotReserved(sourceIndex: number): boolean {
  return isMixerMediaSourceIndex(sourceIndex) && localVideoSlots.has(sourceIndex)
}

export function isWebRtcSlotReserved(sourceIndex: number): boolean {
  return isMixerMediaSourceIndex(sourceIndex) && webRtcSlots.has(sourceIndex)
}

export function reserveLocalVideoSlot(sourceIndex: MixerMediaSourceIndex): void {
  if (webRtcSlots.has(sourceIndex)) {
    throw new Error(`La fuente ${sourceIndex} ya está ocupada por una cámara WebRTC`)
  }
  localVideoSlots.add(sourceIndex)
}

export function releaseLocalVideoSlot(sourceIndex: number): void {
  if (isMixerMediaSourceIndex(sourceIndex)) {
    localVideoSlots.delete(sourceIndex)
  }
}

export function reserveWebRtcSlot(sourceIndex: MixerMediaSourceIndex): void {
  if (localVideoSlots.has(sourceIndex)) {
    throw new Error(`La fuente ${sourceIndex} ya está ocupada por un vídeo local`)
  }
  webRtcSlots.add(sourceIndex)
}

export function releaseWebRtcSlot(sourceIndex: number): void {
  if (isMixerMediaSourceIndex(sourceIndex)) {
    webRtcSlots.delete(sourceIndex)
  }
}

export function hasReservedLocalVideoSlots(): boolean {
  return localVideoSlots.size > 0
}

export function clearLocalVideoSlots(): void {
  localVideoSlots.clear()
}

export function clearWebRtcSlots(): void {
  webRtcSlots.clear()
}
