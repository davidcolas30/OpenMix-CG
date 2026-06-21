/**
 * MixerService — Servicio del mixer que gestiona el pipeline GStreamer.
 *
 * Este servicio vive en el Main Process de Electron y encapsula toda
 * la interacción con el addon nativo de GStreamer para el mezclador.
 *
 * Responsabilidades:
 * 1. Cargar e inicializar el addon nativo
 * 2. Crear el pipeline del mixer (4 fuentes, 2 compositores, thumbnails)
 * 3. Gestionar el estado del mixer (PGM/PVW/corte)
 * 4. Reenviar frames de PGM, PVW y thumbnails al Renderer via IPC
 * 5. Reenviar mensajes del bus GStreamer al Renderer
 *
 * NOTA SOBRE FRAMES POR IPC:
 * En esta fase los monitores PGM/PVW siguen viajando hacia la UI como
 * frames raw serializados. Es útil para iterar rápido, pero es una ruta
 * de diagnóstico, no la arquitectura final del plano de media.
 *
 * En producción, el PGM saldría directamente del pipeline GStreamer
 * hacia encoding/streaming sin pasar por IPC. Solo el preview a
 * baja resolución usaría IPC para la UI.
 */

import { BrowserWindow, WebContents } from 'electron'
import { join } from 'path'
import { ipcChannels } from '../../shared/ipc/channels'
import type {
  MixerAutoTransitionRequest,
  MixerNativeMonitorLayout,
  MixerNativeMonitorTarget,
  MixerMonitorSurfaceConfig,
  MixerMonitorTargets,
  MixerRecordingAudioState
} from '../../shared/ipc/mixer-contracts'
import {
  MAX_MIXER_TRANSITION_DURATION_MS,
  MIN_MIXER_TRANSITION_DURATION_MS
} from '../../shared/ipc/mixer-contracts'
import type {
  GstFrameInfo,
  GstThumbFrameInfo,
  GstBusMessage
} from '../../native/gstreamer_addon'
import { isRecordingActive, stopRecordingIfActive } from './outputService'
import { setGraphicsOutputActive } from './graphicsService'
import { getMonitorResolutionPixels } from './mixerSettingsService'
import { nativeGStreamerAddon as addon } from './nativeAddon'
import {
  clearLocalVideoSourcesForStoppedMixer,
  getLocalVideoSourceNameOverrides,
  pauseLocalVideoOnProgramExit,
  resumeLocalVideoOnProgramEnter
} from './localVideoService'

// ────────────────────────────────────────────────────────────
// Estado del servicio
// ────────────────────────────────────────────────────────────

let isInitialized = false
let isMixerRunning = false
let isMixerPipelinePlaying = false

function isStutterIsolationEnabled(): boolean {
  const rawMode = process.env.OPENMIX_STUTTER_ISOLATION?.trim().toLowerCase()
  return (
    rawMode === 'on' ||
    rawMode === 'true' ||
    rawMode === '1' ||
    rawMode === 'monitors' ||
    rawMode === 'minimal' ||
    rawMode === 'big-monitors'
  )
}

function isWebRtcStandaloneRxEnabled(): boolean {
  const rawMode = process.env.OPENMIX_WEBRTC_STANDALONE_RX?.trim().toLowerCase()
  return rawMode === 'on' || rawMode === 'true' || rawMode === '1' || rawMode === 'enabled'
}

function resolvePreviewMonitorTransport(): 'ipc' | 'webrtc' {
  const explicitTransport = process.env.OPENMIX_MONITOR_TRANSPORT?.toLowerCase()
  if (explicitTransport === 'webrtc') {
    return 'webrtc'
  }
  if (explicitTransport === 'ipc') {
    return 'ipc'
  }

  const monitorIpcMode = process.env.OPENMIX_MONITOR_IPC?.toLowerCase()
  if (monitorIpcMode === 'pgm' || monitorIpcMode === 'none' || monitorIpcMode === 'off') {
    return 'webrtc'
  }

  return 'ipc'
}

const PREVIEW_MONITOR_TRANSPORT = resolvePreviewMonitorTransport()

function resolveMonitorSurfaceConfig(): MixerMonitorSurfaceConfig {
  const rawMode = process.env.OPENMIX_BIG_MONITORS_SURFACE?.trim().toLowerCase()
  const mode: MixerMonitorSurfaceConfig['mode'] =
    rawMode === 'native' || rawMode === 'gst' || rawMode === 'gstreamer'
      ? 'native'
      : rawMode === 'external' || rawMode === 'webview'
        ? 'external'
        : 'inline'
  const rawMultiviewSurface = process.env.OPENMIX_MULTIVIEW_SURFACE?.trim().toLowerCase()
  const multiviewSurface: MixerMonitorSurfaceConfig['multiviewSurface'] =
    rawMultiviewSurface === 'native' || rawMultiviewSurface === 'gst'
      ? 'native'
      : 'webrtc'

  if (mode === 'native') {
    /**
     * OPENMIX_BIG_MONITORS_SURFACE=native expresa una decision de arquitectura:
     * Preview/Program deben presentarse como superficies nativas de GStreamer,
     * no como IPC crudo ni como WebRTC local dentro de Chromium. Activamos la
     * rama nativa automaticamente para evitar configuraciones a medias.
     */
    process.env.OPENMIX_NATIVE_MONITOR_WINDOWS = 'on'

    if (!process.env.OPENMIX_NATIVE_MONITOR_SINK) {
      /**
       * osxvideosink ha provocado abortos intermitentes de AppKit al recibir
       * los primeros frames dentro de Electron:
       * !NSOpenGLBalanceCurrentContext() -> GstOSXVideoSinkObject::showFrame.
       * glimagesink tambien implementa GstVideoOverlay, mantiene el plano de
       * media en GStreamer y evita esa ruta concreta de libgstosxvideo.
       */
      process.env.OPENMIX_NATIVE_MONITOR_SINK = 'glimagesink'
    }
  }

  return {
    mode,
    preloadUrl: mode === 'external' ? `file://${join(__dirname, '../preload/index.js')}` : null,
    multiviewSurface
  }
}

function resolveMonitorTargets(): MixerMonitorTargets {
  const rawBigMonitorMode = process.env.OPENMIX_BIG_MONITORS_MODE?.trim().toLowerCase()
  const combinedBigMonitors =
    rawBigMonitorMode === 'combined' ||
    rawBigMonitorMode === 'atlas' ||
    rawBigMonitorMode === 'single'

  const rawTargets = process.env.OPENMIX_MONITOR_TARGETS?.trim().toLowerCase()
  if ((!rawTargets || rawTargets === '') && isStutterIsolationEnabled()) {
    return {
      preview: !combinedBigMonitors,
      program: !combinedBigMonitors,
      combined: combinedBigMonitors,
      multiview: false
    }
  }

  if (!rawTargets || rawTargets === 'all') {
    return {
      preview: !combinedBigMonitors,
      program: !combinedBigMonitors,
      combined: combinedBigMonitors,
      multiview: true
    }
  }
  if (rawTargets === 'none' || rawTargets === 'off') {
    return { preview: false, program: false, combined: false, multiview: false }
  }

  const tokens = new Set(
    rawTargets
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
  )

  return {
    preview: tokens.has('preview') || tokens.has('pvw'),
    program: tokens.has('program') || tokens.has('pgm'),
    combined: combinedBigMonitors || tokens.has('combined') || tokens.has('big'),
    multiview: tokens.has('multiview') || tokens.has('mv')
  }
}

const MONITOR_TARGETS = resolveMonitorTargets()
const MONITOR_SURFACE_CONFIG = resolveMonitorSurfaceConfig()

if (!process.env.OPENMIX_MULTIVIEW) {
  /**
   * OPENMIX_MONITOR_TARGETS gobierna qué monitores pide realmente la UI.
   * El addon nativo se inicializa después, así que podemos traducir aquí
   * esa decisión de control en una guarda del plano de media: si la
   * multiview no se muestra, sus ramas GStreamer no deben seguir componiendo.
   */
  process.env.OPENMIX_MULTIVIEW = MONITOR_TARGETS.multiview ? 'on' : 'off'
}

if (!process.env.OPENMIX_COMBINED_MONITOR) {
  /**
   * El monitor combinado es una salida experimental. Si la UI no lo pide,
   * el compositor nativo correspondiente debe quedar dormido; si no,
   * force-live puede seguir generando frames negros aunque nadie los vea.
   */
  process.env.OPENMIX_COMBINED_MONITOR = MONITOR_TARGETS.combined ? 'on' : 'off'
}

interface RendererIpcDiagnostics {
  label: string
  frames: number
  bytes: number
  lastReportAt: number
}

const IPC_DIAGNOSTIC_LOG_INTERVAL_MS = 2000

const pgmRendererIpcDiagnostics: RendererIpcDiagnostics = {
  label: 'PGM',
  frames: 0,
  bytes: 0,
  lastReportAt: 0
}

const pvwRendererIpcDiagnostics: RendererIpcDiagnostics = {
  label: 'PVW',
  frames: 0,
  bytes: 0,
  lastReportAt: 0
}

const sourceRendererIpcDiagnostics: RendererIpcDiagnostics = {
  label: 'THUMB',
  frames: 0,
  bytes: 0,
  lastReportAt: 0
}

type NativeMonitorHostState = {
  window: BrowserWindow | null
  attached: boolean
  lastLayout: MixerNativeMonitorLayout | null
  lastAppliedBounds: { x: number; y: number; width: number; height: number } | null
  visible: boolean
}

const nativeMonitorHosts: Record<MixerNativeMonitorTarget, NativeMonitorHostState> = {
  preview: {
    window: null,
    attached: false,
    lastLayout: null,
    lastAppliedBounds: null,
    visible: false
  },
  program: {
    window: null,
    attached: false,
    lastLayout: null,
    lastAppliedBounds: null,
    visible: false
  },
  multiview: {
    window: null,
    attached: false,
    lastLayout: null,
    lastAppliedBounds: null,
    visible: false
  },
  'audio-reference': {
    window: null,
    attached: false,
    lastLayout: null,
    lastAppliedBounds: null,
    visible: false
  }
}

// ────────────────────────────────────────────────────────────
// Funciones del servicio
// ────────────────────────────────────────────────────────────

function trackRendererIpcFrame(diagnostics: RendererIpcDiagnostics, frame: GstFrameInfo): void {
  diagnostics.frames += 1
  diagnostics.bytes += frame.data.byteLength

  const now = Date.now()
  if (diagnostics.lastReportAt === 0) {
    diagnostics.lastReportAt = now
    return
  }

  const elapsedMs = now - diagnostics.lastReportAt
  if (elapsedMs < IPC_DIAGNOSTIC_LOG_INTERVAL_MS) {
    return
  }

  const fps = (diagnostics.frames * 1000) / elapsedMs
  const mibPerSecond = (diagnostics.bytes * 1000) / elapsedMs / (1024 * 1024)
  console.log(
    `[MixerService] IPC ${diagnostics.label}: ` +
      `${fps.toFixed(1)}fps ${mibPerSecond.toFixed(1)}MiB/s hacia Renderer`
  )

  diagnostics.frames = 0
  diagnostics.bytes = 0
  diagnostics.lastReportAt = now
}

function createNativeMonitorHostWindow(
  mainWindow: BrowserWindow,
  target: MixerNativeMonitorTarget
): BrowserWindow {
  const hostWindow = new BrowserWindow({
    parent: mainWindow,
    width: 320,
    height: 180,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: '#000000',
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })

  hostWindow.setIgnoreMouseEvents(true)
  hostWindow.setMenuBarVisibility(false)
  void hostWindow.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent('<!doctype html><body style="margin:0;background:#000"></body>')
  )
  hostWindow.on('closed', () => {
    nativeMonitorHosts[target] = {
      window: null,
      attached: false,
      lastLayout: nativeMonitorHosts[target].lastLayout,
      lastAppliedBounds: null,
      visible: false
    }
  })

  console.log(`[MixerService] Ventana host nativa creada para ${target}`)
  return hostWindow
}

function ensureNativeMonitorHostWindow(
  mainWindow: BrowserWindow,
  target: MixerNativeMonitorTarget
): BrowserWindow {
  const state = nativeMonitorHosts[target]
  if (state.window && !state.window.isDestroyed()) {
    return state.window
  }

  const hostWindow = createNativeMonitorHostWindow(mainWindow, target)
  state.window = hostWindow
  state.attached = false
  state.lastAppliedBounds = null
  state.visible = false
  return hostWindow
}

function attachNativeMonitorHostWindow(
  mainWindow: BrowserWindow,
  target: MixerNativeMonitorTarget
): BrowserWindow {
  const state = nativeMonitorHosts[target]
  const hostWindow = ensureNativeMonitorHostWindow(mainWindow, target)
  if (!state.attached) {
    const attached = addon.setNativeMonitorWindowHandle(target, hostWindow.getNativeWindowHandle())
    state.attached = attached
    if (!attached) {
      console.warn(`[MixerService] Monitor nativo ${target} no disponible; no se abre su valve`)
    }
  }
  return hostWindow
}

function hideNativeMonitorHost(target: MixerNativeMonitorTarget): void {
  const state = nativeMonitorHosts[target]
  if (state.window && !state.window.isDestroyed()) {
    state.window.hide()
  }
  state.visible = false
  /**
   * El handle nativo queda asociado al pipeline GStreamer actual. Si el mixer se
   * destruye y se crea de nuevo, la ventana Electron puede ser la misma, pero el
   * sink nativo ya es otro elemento; por eso forzamos una nueva conexion al
   * volver a mostrar cualquier superficie.
   */
  state.attached = false
  state.lastAppliedBounds = null
  try {
    addon.setNativeMonitorVisible(target, false)
  } catch {
    // El pipeline puede estar destruido durante cierre; ocultar la ventana es suficiente.
  }
}

function hideNativeMonitorHosts(): void {
  hideNativeMonitorHost('preview')
  hideNativeMonitorHost('program')
  hideNativeMonitorHost('multiview')
  hideNativeMonitorHost('audio-reference')
}

export function setNativeMonitorSurfaceLayout(
  mainWindow: BrowserWindow,
  layout: MixerNativeMonitorLayout
): boolean {
  if (MONITOR_SURFACE_CONFIG.mode !== 'native') {
    return false
  }

  const state = nativeMonitorHosts[layout.target]
  state.lastLayout = layout

  if (
    !layout.visible ||
    !isMixerRunning ||
    mainWindow.isDestroyed() ||
    layout.rect.width < 8 ||
    layout.rect.height < 8
  ) {
    hideNativeMonitorHost(layout.target)
    return true
  }

  const hostWindow = attachNativeMonitorHostWindow(mainWindow, layout.target)
  const contentBounds = mainWindow.getContentBounds()
  const bounds = {
    x: Math.round(contentBounds.x + layout.rect.x),
    y: Math.round(contentBounds.y + layout.rect.y),
    width: Math.max(8, Math.round(layout.rect.width)),
    height: Math.max(8, Math.round(layout.rect.height))
  }

  const lastBounds = state.lastAppliedBounds
  const boundsChanged =
    !lastBounds ||
    lastBounds.x !== bounds.x ||
    lastBounds.y !== bounds.y ||
    lastBounds.width !== bounds.width ||
    lastBounds.height !== bounds.height

  if (boundsChanged) {
    /**
     * setBounds() cruza de Electron a AppKit y puede interrumpir la cadencia
     * de osxvideosink si se llama de forma redundante durante el renderizado.
     * Guardamos el rectangulo redondeado que realmente aplica Electron para
     * tocar la ventana nativa solo cuando cambia de verdad.
     */
    hostWindow.setBounds(bounds, false)
    state.lastAppliedBounds = bounds
  }
  if (!hostWindow.isVisible()) {
    hostWindow.showInactive()
  }
  if (!state.visible) {
    addon.setNativeMonitorVisible(layout.target, true)
    state.visible = true
  }

  return true
}

/**
 * Inicializa GStreamer. Llamar una vez al arrancar la app.
 */
export function initializeGStreamer(): void {
  if (isInitialized) return
  addon.initialize()
  isInitialized = true
  console.log('[MixerService] GStreamer inicializado')
}

/**
 * Crea y arranca el pipeline del mixer.
 *
 * Configura 4 callbacks que GStreamer llamará desde sus threads internos:
 * - PGM frames: se reenvían al Renderer por el canal mixer:pgm-frame
 * - PVW frames: se reenvían por mixer:pvw-frame
 * - Thumbnail frames: se reenvían por mixer:source-frame (incluyen sourceIndex)
 * - Bus messages: se reenvían por mixer:bus-message
 *
 * @param mainWindow — La ventana principal de Electron
 */
export function startMixer(mainWindow: BrowserWindow): void {
  if (!isInitialized) {
    throw new Error('GStreamer no está inicializado. Llama a initializeGStreamer() primero.')
  }
  if (isMixerRunning) {
    console.warn('[MixerService] El mixer ya está corriendo')
    return
  }

  if (isWebRtcStandaloneRxEnabled()) {
    isMixerRunning = true
    isMixerPipelinePlaying = false
    console.log(
      '[MixerService] Mixer omitido por OPENMIX_WEBRTC_STANDALONE_RX=on; ' +
        'solo se medira recepcion WebRTC directa a fakesink'
    )
    return
  }

  // Callback para frames del Program (PGM)
  const onPgmFrame = (frame: GstFrameInfo): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(ipcChannels.mixerPgmFrame, {
      width: frame.width,
      height: frame.height,
      format: frame.format,
      data: frame.data
    })
    trackRendererIpcFrame(pgmRendererIpcDiagnostics, frame)
  }

  // Callback para frames del Preview (PVW)
  const onPvwFrame = (frame: GstFrameInfo): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(ipcChannels.mixerPvwFrame, {
      width: frame.width,
      height: frame.height,
      format: frame.format,
      data: frame.data
    })
    trackRendererIpcFrame(pvwRendererIpcDiagnostics, frame)
  }

  // Callback para thumbnails de fuentes (incluye sourceIndex)
  const onThumbFrame = (frame: GstThumbFrameInfo): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(ipcChannels.mixerSourceFrame, {
      sourceIndex: frame.sourceIndex,
      width: frame.width,
      height: frame.height,
      format: frame.format,
      data: frame.data
    })
    trackRendererIpcFrame(sourceRendererIpcDiagnostics, frame)
  }

  // Callback para mensajes del bus GStreamer
  const onBusMessage = (msg: GstBusMessage): void => {
    console.log(`[GStreamer Bus] ${msg.type}: ${msg.message || ''}`)
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(ipcChannels.mixerBusMessage, msg)
  }

  // Callback heredado para la rama Program 1080p. La Fase 1 de la
  // reestructuración mueve REC al plano de media nativo, así que esta salida
  // queda apagada salvo que una prueba legacy llame setProgramRecordingEnabled().
  const onPgmRecordingFrame = (): void => {
    // Intencionadamente vacío: grabar ya no implica pasar frames crudos por Electron.
  }

  const onAudioReferenceFrame = (frame: GstFrameInfo): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(ipcChannels.mixerAudioReferenceFrame, {
      width: frame.width,
      height: frame.height,
      format: frame.format,
      data: frame.data
    })
  }

  // Crear el pipeline del mixer con monitores configurables y una
  // salida Program adicional de mayor calidad para grabación local.
  const monitorPixels = getMonitorResolutionPixels()
  addon.createMixerPipeline(
    onPgmFrame,
    onPvwFrame,
    onThumbFrame,
    onBusMessage,
    onPgmRecordingFrame,
    onAudioReferenceFrame,
    monitorPixels.width,
    monitorPixels.height
  )

  isMixerRunning = true
  isMixerPipelinePlaying = false
  console.log(
    '[MixerService] Mixer preparado — arrancará el plano de media al conectar una cámara, ' +
      `monitor=${monitorPixels.width}x${monitorPixels.height}`
  )
}

/**
 * Arranca el pipeline pesado de media solo cuando hace falta.
 *
 * El pipeline puede estar creado para reservar appsrcs, pads y callbacks, pero
 * mantenerlo en PLAYING sin cámaras hace que GStreamer componga PGM/PVW en
 * vacío. Separar "pipeline preparado" de "media en marcha" reduce el consumo
 * de CPU en espera sin cambiar el flujo WebRTC cuando llega una cámara.
 */
export function ensureMixerPipelinePlaying(): void {
  if (isWebRtcStandaloneRxEnabled()) {
    return
  }

  if (!isMixerRunning) {
    throw new Error('El mixer no está preparado. Inicia el mixer antes de conectar cámaras.')
  }
  if (isMixerPipelinePlaying) return

  setGraphicsOutputActive(true)
  addon.startPipeline()
  isMixerPipelinePlaying = true
  console.log('[MixerService] Plano de media del mixer arrancado')
}

/**
 * Pausa el plano de media cuando no quedan cámaras.
 *
 * Conservamos el pipeline creado para poder reactivarlo rápidamente con la
 * siguiente cámara, pero volvemos a GST_STATE_NULL para que las fuentes de
 * prueba, compositores y appsinks no sigan consumiendo CPU en reposo.
 */
export function suspendMixerPipelineForIdle(): void {
  if (isWebRtcStandaloneRxEnabled()) {
    return
  }

  if (isRecordingActive()) {
    return
  }

  if (!isMixerRunning || !isMixerPipelinePlaying) return

  addon.stopPipeline()
  setGraphicsOutputActive(false)
  isMixerPipelinePlaying = false
  console.log('[MixerService] Plano de media del mixer pausado por reposo')
}

/**
 * Detiene y destruye el pipeline del mixer.
 */
export async function stopMixer(): Promise<void> {
  if (!isMixerRunning) return

  /*
   * REC vive en una rama dinamica de GStreamer. Antes de llevar el pipeline a
   * NULL hay que mandar EOS a esa rama y dejar que el muxer escriba el indice
   * final del contenedor; si destruimos primero el pipeline, el MP4 puede quedar
   * con cabecera incompleta aunque el fichero exista en disco.
   */
  await stopRecordingIfActive().catch((error) => {
    console.error(
      '[MixerService] No se pudo cerrar la grabación activa al detener el mixer:',
      error
    )
  })
  setGraphicsOutputActive(false)
  hideNativeMonitorHosts()
  if (isWebRtcStandaloneRxEnabled()) {
    isMixerRunning = false
    isMixerPipelinePlaying = false
    console.log('[MixerService] Mixer standalone detenido')
    return
  }

  if (isMixerPipelinePlaying) {
    addon.stopPipeline()
  }
  addon.destroyPipeline()
  clearLocalVideoSourcesForStoppedMixer()
  isMixerRunning = false
  isMixerPipelinePlaying = false
  console.log('[MixerService] Mixer detenido')
}

export function getPreviewMonitorTransport(): { transport: 'ipc' | 'webrtc'; enabled: boolean } {
  console.log(`[MixerService] Transporte monitor Preview: ${PREVIEW_MONITOR_TRANSPORT}`)
  return {
    transport: PREVIEW_MONITOR_TRANSPORT,
    enabled: PREVIEW_MONITOR_TRANSPORT === 'webrtc'
  }
}

export function getMonitorSurfaceConfig(): MixerMonitorSurfaceConfig {
  console.log(
    `[MixerService] Superficie monitores grandes: ${MONITOR_SURFACE_CONFIG.mode}; ` +
      `multiview=${MONITOR_SURFACE_CONFIG.multiviewSurface}`
  )
  return { ...MONITOR_SURFACE_CONFIG }
}

export function getMonitorTargets(): MixerMonitorTargets {
  console.log(
    '[MixerService] Monitores WebRTC activos: ' +
      `preview=${MONITOR_TARGETS.preview} program=${MONITOR_TARGETS.program} ` +
      `combined=${MONITOR_TARGETS.combined} multiview=${MONITOR_TARGETS.multiview}`
  )
  return { ...MONITOR_TARGETS }
}

export function getRecordingAudioState(): MixerRecordingAudioState {
  const state = addon.getRecordingAudioState()
  return {
    enabled: Boolean(state.enabled),
    active: Boolean(state.active),
    source: state.source,
    delayMs: state.delayMs
  }
}

export function setRecordingAudioDelayMs(delayMs: number): MixerRecordingAudioState {
  if (!Number.isFinite(delayMs)) {
    throw new Error('Delay de audio inválido.')
  }

  const roundedDelayMs = Math.round(delayMs)
  addon.setRecordingAudioDelayMs(roundedDelayMs)
  return getRecordingAudioState()
}

export function startPreviewMonitorWebRTC(targetWebContents: WebContents, sdp: string): void {
  if (!isMixerRunning) {
    throw new Error('El mixer no está preparado. Inicia el mixer antes de crear el monitor WebRTC.')
  }

  addon.startPreviewMonitorWebRTC(
    sdp,
    (answer) => {
      if (targetWebContents.isDestroyed()) return
      console.log('[MixerService] Answer WebRTC local de Preview enviada al Renderer')
      targetWebContents.send(ipcChannels.mixerPreviewMonitorWebRtcAnswer, answer)
    },
    (candidate) => {
      if (targetWebContents.isDestroyed()) return
      targetWebContents.send(ipcChannels.mixerPreviewMonitorWebRtcIceCandidate, candidate)
    }
  )
  console.log('[MixerService] Monitor Preview WebRTC local iniciado')
}

export function startProgramMonitorWebRTC(targetWebContents: WebContents, sdp: string): void {
  if (!isMixerRunning) {
    throw new Error('El mixer no está preparado. Inicia el mixer antes de crear el monitor WebRTC.')
  }

  addon.startProgramMonitorWebRTC(
    sdp,
    (answer) => {
      if (targetWebContents.isDestroyed()) return
      console.log('[MixerService] Answer WebRTC local de Program enviada al Renderer')
      targetWebContents.send(ipcChannels.mixerProgramMonitorWebRtcAnswer, answer)
    },
    (candidate) => {
      if (targetWebContents.isDestroyed()) return
      targetWebContents.send(ipcChannels.mixerProgramMonitorWebRtcIceCandidate, candidate)
    }
  )
  console.log('[MixerService] Monitor Program WebRTC local iniciado')
}

export function startCombinedMonitorWebRTC(targetWebContents: WebContents, sdp: string): void {
  if (!isMixerRunning) {
    throw new Error('El mixer no está preparado. Inicia el mixer antes de crear el monitor WebRTC.')
  }

  addon.startCombinedMonitorWebRTC(
    sdp,
    (answer) => {
      if (targetWebContents.isDestroyed()) return
      console.log('[MixerService] Answer WebRTC local combinado enviada al Renderer')
      targetWebContents.send(ipcChannels.mixerCombinedMonitorWebRtcAnswer, answer)
    },
    (candidate) => {
      if (targetWebContents.isDestroyed()) return
      targetWebContents.send(ipcChannels.mixerCombinedMonitorWebRtcIceCandidate, candidate)
    }
  )
  console.log('[MixerService] Monitor combinado Preview+Program WebRTC local iniciado')
}

export function addCombinedMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void {
  addon.addCombinedMonitorIceCandidate(sdpMLineIndex, candidate)
}

export function stopCombinedMonitorWebRTC(): void {
  addon.stopCombinedMonitorWebRTC()
  console.log('[MixerService] Monitor combinado Preview+Program WebRTC local detenido')
}

export function startMultiviewMonitorWebRTC(targetWebContents: WebContents, sdp: string): void {
  if (!isMixerRunning) {
    throw new Error('El mixer no está preparado. Inicia el mixer antes de crear el monitor WebRTC.')
  }

  addon.startMultiviewMonitorWebRTC(
    sdp,
    (answer) => {
      if (targetWebContents.isDestroyed()) return
      console.log('[MixerService] Answer WebRTC local de Multiview enviada al Renderer')
      targetWebContents.send(ipcChannels.mixerMultiviewMonitorWebRtcAnswer, answer)
    },
    (candidate) => {
      if (targetWebContents.isDestroyed()) return
      targetWebContents.send(ipcChannels.mixerMultiviewMonitorWebRtcIceCandidate, candidate)
    }
  )
  console.log('[MixerService] Monitor Multiview WebRTC local iniciado')
}

export function addPreviewMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void {
  if (!isMixerRunning) return
  const candidateKind = candidate.includes('.local')
    ? 'mdns'
    : candidate.includes(' typ host')
      ? 'host'
      : candidate.includes(' typ srflx')
        ? 'srflx'
        : 'other'
  console.log(`[MixerService] ICE Renderer→PVW: mline=${sdpMLineIndex} kind=${candidateKind}`)
  addon.addPreviewMonitorIceCandidate(sdpMLineIndex, candidate)
}

export function addProgramMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void {
  if (!isMixerRunning) return
  const candidateKind = candidate.includes('.local')
    ? 'mdns'
    : candidate.includes(' typ host')
      ? 'host'
      : candidate.includes(' typ srflx')
        ? 'srflx'
        : 'other'
  console.log(`[MixerService] ICE Renderer→PGM: mline=${sdpMLineIndex} kind=${candidateKind}`)
  addon.addProgramMonitorIceCandidate(sdpMLineIndex, candidate)
}

export function addMultiviewMonitorIceCandidate(sdpMLineIndex: number, candidate: string): void {
  if (!isMixerRunning) return
  const candidateKind = candidate.includes('.local')
    ? 'mdns'
    : candidate.includes(' typ host')
      ? 'host'
      : candidate.includes(' typ srflx')
        ? 'srflx'
        : 'other'
  console.log(`[MixerService] ICE Renderer→MULTIVIEW: mline=${sdpMLineIndex} kind=${candidateKind}`)
  addon.addMultiviewMonitorIceCandidate(sdpMLineIndex, candidate)
}

export function stopPreviewMonitorWebRTC(): void {
  if (!isMixerRunning) return
  addon.stopPreviewMonitorWebRTC()
  console.log('[MixerService] Monitor Preview WebRTC local detenido')
}

export function stopProgramMonitorWebRTC(): void {
  if (!isMixerRunning) return
  addon.stopProgramMonitorWebRTC()
  console.log('[MixerService] Monitor Program WebRTC local detenido')
}

export function stopMultiviewMonitorWebRTC(): void {
  if (!isMixerRunning) return
  addon.stopMultiviewMonitorWebRTC()
  console.log('[MixerService] Monitor Multiview WebRTC local detenido')
}

function applyLocalVideoAutoTransport(
  previousProgramSource: number,
  nextProgramSource: number
): void {
  if (previousProgramSource === nextProgramSource) {
    return
  }

  /*
   * La politica "Auto Program" imita el comportamiento de playout de un
   * switcher: el clip que entra al aire arranca, y el clip que deja Program
   * queda congelado. El operador sigue controlando la opcion desde React, pero
   * el transporte real vive en el bin nativo de GStreamer.
   */
  resumeLocalVideoOnProgramEnter(nextProgramSource)
  pauseLocalVideoOnProgramExit(previousProgramSource)
}

function clampAutoTransitionDelayMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) {
    return MIN_MIXER_TRANSITION_DURATION_MS
  }
  return Math.max(
    MIN_MIXER_TRANSITION_DURATION_MS,
    Math.min(MAX_MIXER_TRANSITION_DURATION_MS, Math.round(durationMs))
  )
}

/**
 * Cambia la fuente activa en Program.
 * @param index — Índice de la fuente (0-3)
 */
export function setProgramSource(index: number): void {
  if (!isMixerRunning) throw new Error('El mixer no está corriendo')
  const previousProgramSource = addon.getMixerState().programSource
  addon.setProgramSource(index)
  applyLocalVideoAutoTransport(previousProgramSource, index)
}

/**
 * Cambia la fuente activa en Preview.
 * @param index — Índice de la fuente (0-3)
 */
export function setPreviewSource(index: number): void {
  if (!isMixerRunning) throw new Error('El mixer no está corriendo')
  addon.setPreviewSource(index)
}

/**
 * Ejecuta un corte: intercambia las fuentes de PGM y PVW.
 */
export function cut(): void {
  if (!isMixerRunning) throw new Error('El mixer no está corriendo')
  const previousProgramSource = addon.getMixerState().programSource
  addon.cut()
  const nextProgramSource = addon.getMixerState().programSource
  applyLocalVideoAutoTransport(previousProgramSource, nextProgramSource)
}

/**
 * Ejecuta una transición AUTO usando la fuente actual de Preview como destino.
 */
export function autoTransition(request: MixerAutoTransitionRequest): void {
  if (!isMixerRunning) throw new Error('El mixer no está corriendo')
  const previousState = addon.getMixerState()
  addon.autoTransition(request.transitionId, request.durationMs)
  const immediateState = addon.getMixerState()

  if (
    previousState.programSource !== immediateState.programSource ||
    !immediateState.isTransitionInProgress
  ) {
    applyLocalVideoAutoTransport(previousState.programSource, immediateState.programSource)
    return
  }

  resumeLocalVideoOnProgramEnter(previousState.previewSource)
  const delayMs = clampAutoTransitionDelayMs(request.durationMs)
  setTimeout(() => {
    if (!isMixerRunning) return
    const currentState = addon.getMixerState()
    if (currentState.programSource !== previousState.programSource) {
      pauseLocalVideoOnProgramExit(previousState.programSource)
    }
  }, delayMs + 50)
}

/**
 * Devuelve el estado actual del mixer.
 */
export function getMixerState(): {
  programSource: number
  previewSource: number
  numSources: number
  sourceNames: string[]
  isRunning: boolean
  isPipelinePlaying: boolean
  isTransitionInProgress: boolean
} {
  if (!isMixerRunning) {
    return {
      programSource: 0,
      previewSource: 1,
      numSources: 0,
      sourceNames: [],
      isRunning: false,
      isPipelinePlaying: false,
      isTransitionInProgress: false
    }
  }

  const state = addon.getMixerState()
  const sourceNameOverrides = getLocalVideoSourceNameOverrides()
  return {
    ...state,
    sourceNames: state.sourceNames.map((name, index) => sourceNameOverrides.get(index) ?? name),
    isRunning: true,
    isPipelinePlaying: isMixerPipelinePlaying
  }
}

/** Indica si el mixer está activo */
export function isMixerActive(): boolean {
  return isMixerRunning
}
