import type { GraphicsPreviewFrame } from '../../../shared/ipc/graphics-contracts'
import {
  NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT,
  NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
  NATIVE_MIXER_OVERLAY_HEARTBEAT_FPS
} from './graphicsServiceConfig'
import { createTransparentFrame } from './graphicsFrameUtils'
import type { GraphicsOverlayTarget } from './graphicsServiceTypes'

type NativeMixerOverlayTarget = GraphicsOverlayTarget

interface NativeMixerOverlayTargetState {
  enabled: boolean
  revision: number
}

interface NativeMixerOverlaySyncOptions {
  getCompositeRevision: () => number
  getOverlayFrame: (
    target: NativeMixerOverlayTarget,
    width: number,
    height: number
  ) => GraphicsPreviewFrame | null
  hasActiveOverlay: () => boolean
  isOutputActive: () => boolean
  isTargetActive: (target: NativeMixerOverlayTarget) => boolean
  onError: (error: unknown) => void
  onSynced: () => void
  pushOverlayFrame: (target: NativeMixerOverlayTarget, frame: GraphicsPreviewFrame) => boolean
  setOverlayEnabled: (target: NativeMixerOverlayTarget, enabled: boolean) => void
}

export class NativeMixerOverlaySync {
  private readonly options: NativeMixerOverlaySyncOptions
  private heartbeatTimer: NodeJS.Timeout | null = null
  private pendingSyncTimer: NodeJS.Immediate | null = null
  private transparentOverlayFrame: GraphicsPreviewFrame | null = null
  private readonly targetState: Record<NativeMixerOverlayTarget, NativeMixerOverlayTargetState> = {
    preview: { enabled: false, revision: -1 },
    program: { enabled: false, revision: -1 }
  }

  public constructor(options: NativeMixerOverlaySyncOptions) {
    this.options = options
  }

  public sync(): void {
    if (this.pendingSyncTimer) {
      clearImmediate(this.pendingSyncTimer)
      this.pendingSyncTimer = null
    }

    try {
      this.syncTarget('preview')
      this.syncTarget('program')
      this.ensureHeartbeat()
      this.options.onSynced()
    } catch (error) {
      this.options.onError(error)
    }
  }

  public schedule(): void {
    if (this.pendingSyncTimer) {
      return
    }

    // El callback paint de Electron se ejecuta en el Main Process. Si ahi mismo
    // escalamos, copiamos y empujamos el overlay al appsrc, una animacion puede
    // bloquear momentaneamente los monitores. Al coalescer al siguiente tick,
    // cada raf usa el ultimo frame disponible sin encadenar trabajo redundante.
    this.pendingSyncTimer = setImmediate(() => this.sync())
  }

  public dispose(): void {
    this.stopHeartbeat()

    if (this.pendingSyncTimer) {
      clearImmediate(this.pendingSyncTimer)
      this.pendingSyncTimer = null
    }
  }

  private syncTarget(
    target: NativeMixerOverlayTarget,
    options: { forcePush?: boolean } = {}
  ): GraphicsPreviewFrame | null {
    if (!this.options.isOutputActive()) {
      this.clearTarget(target)
      return null
    }

    const frame = this.options.getOverlayFrame(
      target,
      NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
      NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT
    )

    if (!frame) {
      this.clearTarget(target)
      return null
    }

    const targetState = this.targetState[target]
    if (
      targetState.enabled &&
      targetState.revision === this.options.getCompositeRevision() &&
      !options.forcePush
    ) {
      return frame
    }

    const wasPushed = this.options.pushOverlayFrame(target, frame)
    this.options.setOverlayEnabled(target, wasPushed)
    targetState.enabled = wasPushed
    targetState.revision = this.options.getCompositeRevision()
    return wasPushed ? frame : null
  }

  private clearTarget(target: NativeMixerOverlayTarget): void {
    const targetState = this.targetState[target]
    if (!targetState.enabled) {
      return
    }

    // El compositor de GStreamer conserva el ultimo buffer recibido por el
    // appsrc. Si solo bajamos alpha al ocultar un grafismo, al siguiente show
    // puede reaparecer durante un frame el ultimo estado final antes de que
    // llegue el primer frame de la nueva animacion.
    this.options.pushOverlayFrame(target, this.getTransparentOverlayFrame())
    this.options.setOverlayEnabled(target, false)
    targetState.enabled = false
    targetState.revision = this.options.getCompositeRevision()
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return
    }

    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private pumpHeartbeat(): void {
    if (!this.options.hasActiveOverlay()) {
      this.stopHeartbeat()
      return
    }

    // GStreamer compositor sincroniza sus entradas. Si el grafismo HTML/offscreen
    // produce frames con jitter, el pad de overlay puede introducir pulsos en el
    // video aunque la camara vaya a 30fps. Este heartbeat repite el ultimo overlay
    // disponible a cadencia fija; asi el compositor siempre tiene una muestra
    // reciente y el jitter del motor de grafismo no arrastra al monitor.
    this.syncTarget('preview', {
      forcePush: this.options.isTargetActive('preview')
    })
    this.syncTarget('program', {
      forcePush: this.options.isTargetActive('program')
    })
  }

  private ensureHeartbeat(): void {
    // El repetidor principal del overlay vive en el addon nativo para no
    // depender del event loop de Electron. Este heartbeat JS queda como
    // herramienta experimental activable por variable de entorno.
    if (NATIVE_MIXER_OVERLAY_HEARTBEAT_FPS <= 0) {
      this.stopHeartbeat()
      return
    }

    if (!this.options.hasActiveOverlay()) {
      this.stopHeartbeat()
      return
    }

    if (this.heartbeatTimer) {
      return
    }

    const intervalMs = Math.max(1, Math.round(1000 / NATIVE_MIXER_OVERLAY_HEARTBEAT_FPS))
    this.heartbeatTimer = setInterval(() => this.pumpHeartbeat(), intervalMs)
  }

  private getTransparentOverlayFrame(): GraphicsPreviewFrame {
    if (
      !this.transparentOverlayFrame ||
      this.transparentOverlayFrame.width !== NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH ||
      this.transparentOverlayFrame.height !== NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT
    ) {
      this.transparentOverlayFrame = createTransparentFrame(
        NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
        NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT
      )
    }

    return this.transparentOverlayFrame
  }
}
