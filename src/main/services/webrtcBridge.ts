/**
 * webrtcBridge.ts — Puente entre la señalización WebSocket y GStreamer.
 *
 * Este servicio conecta los dos mundos:
 * - El servicio de señalización (WebSocket) que comunica con el móvil
 * - El addon nativo de GStreamer (webrtcbin) que procesa el vídeo
 *
 * Cuando el móvil envía una SDP offer via WebSocket, este puente:
 * 1. Crea un webrtcbin en GStreamer para ese peer
 * 2. Le pasa la SDP offer
 * 3. Recibe la SDP answer generada por GStreamer
 * 4. La envía al móvil via señalización
 *
 * Los ICE candidates fluyen en ambas direcciones a través de este puente.
 *
 * ¿Por qué un servicio separado?
 * Mantiene la separación de responsabilidades:
 * - signalingService: protocolo WebSocket + autenticación
 * - webrtcBridge: lógica de conexión SDP/ICE
 * - addon C++: procesamiento de vídeo GStreamer
 */

import { sendAnswer, sendIceCandidate, sendPeerError } from './signalingService'
import {
  ensureMixerPipelinePlaying,
  initializeGStreamer,
  suspendMixerPipelineForIdle
} from './mixerService'
import {
  isLocalVideoSlotReserved,
  reserveWebRtcSlot,
  releaseWebRtcSlot,
  clearWebRtcSlots,
  type MixerMediaSourceIndex
} from './sourceSlotRegistry'
import { hasLocalVideoSources } from './localVideoService'
import { isRecordingActive } from './outputService'
import { nativeGStreamerAddon as addon } from './nativeAddon'

/** Mapa peerId → fuente del mixer reservada para ese peer */
const activePeers = new Map<string, number>()

/** Slots WebRTC disponibles actualmente en el mixer */
const WEBRTC_SOURCE_INDEXES = [1, 2, 3] as const

function getFreeMixerSourceIndex(): MixerMediaSourceIndex | null {
  const usedIndexes = new Set(activePeers.values())
  for (const sourceIndex of WEBRTC_SOURCE_INDEXES) {
    if (!usedIndexes.has(sourceIndex) && !isLocalVideoSlotReserved(sourceIndex)) {
      return sourceIndex
    }
  }

  return null
}

/**
 * Maneja la llegada de una SDP offer de un peer.
 *
 * Crea el webrtcbin en GStreamer, configura la offer, y espera
 * la answer que GStreamer generará automáticamente.
 *
 * @param peerId - Identificador del peer
 * @param sdp - La SDP offer del móvil
 */
export function handlePeerOffer(peerId: string, sdp: RTCSessionDescriptionInit): void {
  // Asegurar que GStreamer está inicializado antes de crear elementos.
  // Si el usuario conecta un móvil antes de iniciar el mixer,
  // gst_init() aún no se habrá llamado y webrtcbin no se encontrará.
  initializeGStreamer()

  // Si ya existe un webrtcbin para este peer, NO lo destruimos.
  // Una segunda offer del mismo peer suele ser renegociación
  // (Safari puede disparar negotiationneeded más de una vez).
  // Recrear el peer aquí corta la sesión y deja el stream sin llegar.
  if (activePeers.has(peerId)) {
    console.log(`[WebRTCBridge] Peer ${peerId} ya existe, aplicando renegociación...`)
    if (sdp.sdp) {
      addon.setRemoteOffer(peerId, sdp.sdp)
    } else {
      console.error(`[WebRTCBridge] SDP offer vacía para renegociación de ${peerId}`)
    }
    return
  }

  console.log(`[WebRTCBridge] Creando webrtcbin para ${peerId}`)

  const mixerSourceIndex = getFreeMixerSourceIndex()
  if (mixerSourceIndex === null) {
    console.error(`[WebRTCBridge] No quedan slots WebRTC libres para ${peerId}`)
    sendPeerError(peerId, 'NO_SOURCE_SLOT', 'No hay más entradas WebRTC libres en el mixer actual.')
    return
  }
  ensureMixerPipelinePlaying()

  // Crear el peer en GStreamer con callbacks para answer e ICE
  addon.createWebRTCPeer(
    peerId,
    mixerSourceIndex,

    // onAnswer: GStreamer ha generado la SDP answer
    // La reenviamos al móvil via señalización WebSocket
    (answer) => {
      console.log(`[WebRTCBridge] Answer SDP generada para ${peerId}`)
      sendAnswer(peerId, {
        type: answer.type as RTCSdpType,
        sdp: answer.sdp
      })
    },

    // onIceCandidate: GStreamer ha descubierto un candidate local
    // Lo reenviamos al móvil via señalización WebSocket
    (candidate) => {
      console.log(
        `[WebRTCBridge] ICE candidate local de GStreamer para ${peerId}: mline=${candidate.sdpMLineIndex}`
      )
      sendIceCandidate(peerId, {
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex
      })
    }
  )

  reserveWebRtcSlot(mixerSourceIndex)
  activePeers.set(peerId, mixerSourceIndex)

  // Pasar la SDP offer al webrtcbin
  // Esto triggerea la creación automática de la answer
  if (sdp.sdp) {
    addon.setRemoteOffer(peerId, sdp.sdp)
  } else {
    console.error(`[WebRTCBridge] SDP offer vacía para ${peerId}`)
  }

  console.log(`[WebRTCBridge] ${peerId} asignado a la fuente ${mixerSourceIndex} del mixer`)
}

/**
 * Maneja la llegada de un ICE candidate de un peer.
 *
 * Reenvía el candidate al webrtcbin del peer en GStreamer.
 */
export function handlePeerIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
  if (!activePeers.has(peerId)) {
    // El peer puede no existir aún si el candidate llega antes de la offer
    console.warn(`[WebRTCBridge] ICE candidate para peer desconocido: ${peerId}`)
    return
  }

  // sdpMLineIndex indica a qué track de media pertenece el candidate
  // (0 = primer track en la SDP, normalmente audio o video)
  const mLineIndex = candidate.sdpMLineIndex ?? 0
  const candidateStr = candidate.candidate ?? ''

  if (candidateStr) {
    console.log(`[WebRTCBridge] ICE candidate remoto de ${peerId}: mline=${mLineIndex}`)
    addon.addRemoteIceCandidate(peerId, mLineIndex, candidateStr)
  }
}

/**
 * Limpia los recursos de un peer desconectado.
 */
export function handlePeerDisconnected(peerId: string): void {
  const sourceIndex = activePeers.get(peerId)
  if (sourceIndex !== undefined) {
    console.log(`[WebRTCBridge] Eliminando peer ${peerId} de GStreamer`)
    addon.removeWebRTCPeer(peerId)
    activePeers.delete(peerId)
    releaseWebRtcSlot(sourceIndex)
    console.log(`[WebRTCBridge] Fuente ${sourceIndex} liberada tras desconectar ${peerId}`)
    if (activePeers.size === 0 && !hasLocalVideoSources() && !isRecordingActive()) {
      suspendMixerPipelineForIdle()
    }
  }
}

/**
 * Limpia todas las cámaras WebRTC antes de destruir el mixer completo.
 *
 * Cuando el operador detiene el mixer desde la UI, los móviles pueden seguir
 * conectados unos segundos y enviar el "bye" después. Si destruyésemos primero
 * el pipeline padre, esa desconexión tardía intentaría liberar pads que ya no
 * existen. El llamador debe cerrar REC antes de entrar aquí si hay una
 * grabación activa; después esta función libera peers dinámicos y por último
 * `stopMixer()` destruye el pipeline.
 */
export function detachAllPeersBeforeMixerStop(): void {
  for (const [peerId, sourceIndex] of activePeers.entries()) {
    console.log(`[WebRTCBridge] Liberando ${peerId} antes de detener el mixer`)
    addon.removeWebRTCPeer(peerId)
    console.log(`[WebRTCBridge] Fuente ${sourceIndex} liberada antes de detener el mixer`)
  }
  activePeers.clear()
  clearWebRtcSlots()
}
