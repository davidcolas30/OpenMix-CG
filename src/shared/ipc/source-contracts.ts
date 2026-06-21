/**
 * source-contracts.ts — Tipos IPC para gestión de fuentes de vídeo.
 *
 * Define los tipos compartidos entre Main y Renderer para:
 * - Crear tokens de conexión (QR)
 * - Consultar estado de peers (cámaras conectadas)
 * - Recibir eventos de cambio de estado de peers
 */

/** Estado de conexión de un peer (cámara móvil) */
export type PeerConnectionState = 'waiting' | 'connected' | 'streaming' | 'disconnected'

/** Información de un peer activo */
export interface PeerInfo {
  peerId: string
  state: PeerConnectionState
  name?: string
}

/** Resultado de crear un token de conexión */
export interface ConnectionTokenResult {
  peerId: string
  token: string
  /** URL completa para el QR (https://<ip>:<port>/cam?token=<token>&profile=<perfil>) */
  url: string
}

/** Evento de cambio de estado de un peer */
export interface PeerStateEvent {
  peerId: string
  state: PeerConnectionState
}

/** Índices de fuente que pueden recibir cámaras o vídeos locales. */
export type LocalVideoSourceIndex = 1 | 2 | 3

/** Fichero seleccionado desde el diálogo nativo del Main Process. */
export interface LocalVideoFileSelection {
  path: string
  name: string
  sizeBytes: number
}

/** Resultado del diálogo de selección de vídeo local. */
export type ChooseLocalVideoResult =
  | { canceled: true; file?: never }
  | { canceled: false; file: LocalVideoFileSelection }

/** Solicitud para cargar un fichero local en un slot real del mixer. */
export interface LoadLocalVideoSourceRequest {
  sourceIndex: LocalVideoSourceIndex
  filePath: string
}

/** Solicitud para pausar o reanudar un fichero local ya cargado. */
export interface SetLocalVideoPausedRequest {
  sourceIndex: LocalVideoSourceIndex
  paused: boolean
}

/** Solicitud para activar o desactivar loop en un fichero local. */
export interface SetLocalVideoLoopRequest {
  sourceIndex: LocalVideoSourceIndex
  loop: boolean
}

/** Solicitud para activar la política automática al entrar/salir de Program. */
export interface SetLocalVideoAutoPlayRequest {
  sourceIndex: LocalVideoSourceIndex
  autoPlayOnProgram: boolean
}

/** Estado de un vídeo local cargado en el mixer. */
export interface LocalVideoSourceInfo {
  sourceIndex: LocalVideoSourceIndex
  path: string
  name: string
  loadedAt: string
  playbackState: 'playing' | 'paused'
  loop: boolean
  /**
   * Si está activo, el clip se reanuda al entrar en Program y se pausa cuando
   * sale de Program. Es plano de control: solo cambia el transporte nativo.
   */
  autoPlayOnProgram: boolean
}

/** Evento ligero para sincronizar la UI cuando Main cambia estado automáticamente. */
export interface LocalVideoSourcesChangedEvent {
  sources: LocalVideoSourceInfo[]
}
