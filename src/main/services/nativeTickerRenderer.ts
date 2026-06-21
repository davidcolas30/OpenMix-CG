import {
  createCanvas,
  type Canvas,
  type CanvasRenderingContext2D
} from '@napi-rs/canvas/node-canvas'
import type {
  GraphicsFrameBounds,
  GraphicsPlacement,
  GraphicsResolution
} from '../../shared/ipc/graphics-contracts'

export interface GraphicsRendererRuntimeState {
  isVisible: boolean
  previewActive: boolean
  stackPreviewActive: boolean
  outputActive: boolean
  animationFps: number
}

export interface NativeTickerLayoutConfig {
  left: number
  bottom: number
  width: number
  height: number
  labelWidth: number
  bodyPaddingY: number
  copyGap: number
}

export interface NativeTickerStyleConfig {
  labelBackground: string
  labelBackgroundAccent?: string
  bodyBackground: string
  bodyBackgroundAccent?: string
  borderColor?: string
  labelTextColor: string
  bodyTextColor: string
  fontFamily: string
  labelFontSize: number
  bodyFontSize: number
  labelFontWeight?: number
  bodyFontWeight?: number
  labelLetterSpacingEm?: number
  bodyLetterSpacingEm?: number
  cornerRadius?: number
}

export interface NativeTickerAnimationConfig {
  durationMs: number
  offsetYPx: number
}

export interface NativeTickerAnimationsConfig {
  in?: NativeTickerAnimationConfig
  out?: NativeTickerAnimationConfig
}

export interface NativeTickerFieldValues {
  label: string
  text: string
  speed: string
}

export interface NativeTickerFrame {
  pixels: Uint8Array
  width: number
  height: number
  alphaBounds: GraphicsFrameBounds | null
  dirtyBounds: GraphicsFrameBounds | null
}

interface NativeTickerRendererOptions {
  resolution: GraphicsResolution
  layout: NativeTickerLayoutConfig
  style: NativeTickerStyleConfig
  animations?: NativeTickerAnimationsConfig
  initialValues: NativeTickerFieldValues
  onFrame: (frame: NativeTickerFrame) => void
}

interface AnimationState {
  startedAt: number
  durationMs: number
  fromProgress: number
  toProgress: number
  offsetYPx: number
  resolve: () => void
}

interface BandGeometry {
  x: number
  y: number
  width: number
  height: number
  labelWidth: number
  bodyWidth: number
  bodyPaddingY: number
  copyGap: number
  cornerRadius: number
  scale: number
}

interface BodyTextLayout {
  bodyText: string
  bodyX: number
  bodyPaddingX: number
  textBaselineY: number
  availableWidth: number
  fontSize: number
  letterSpacingPx: number
  font: string
}

const DEFAULT_LABEL_BACKGROUND_ACCENT = 'rgba(255, 255, 255, 0.16)'
const DEFAULT_BODY_BACKGROUND_ACCENT = 'rgba(255, 255, 255, 0.08)'
const DEFAULT_BORDER_COLOR = 'rgba(255, 255, 255, 0.12)'
const DEFAULT_CORNER_RADIUS = 24
const MIN_RENDER_SIZE = 1
const MIN_TICKER_SPEED_SECONDS = 4
const MAX_TICKER_SPEED_SECONDS = 60
const MIN_TIMER_INTERVAL_MS = 16

export class NativeTickerRenderer {
  private readonly resolution: GraphicsResolution
  private readonly layout: NativeTickerLayoutConfig
  private readonly style: NativeTickerStyleConfig
  private readonly animations: NativeTickerAnimationsConfig
  private readonly onFrame: (frame: NativeTickerFrame) => void

  private values: NativeTickerFieldValues
  private placement: GraphicsPlacement = { offsetX: 0, offsetY: 0 }
  private runtimeState: GraphicsRendererRuntimeState = {
    isVisible: false,
    previewActive: false,
    stackPreviewActive: false,
    outputActive: false,
    animationFps: 1
  }
  private visibilityProgress = 0
  private animation: AnimationState | null = null
  private frameRate = 1
  private renderWidth: number
  private renderHeight: number
  private renderZoomFactor = 1
  private bandCanvas: Canvas
  private bandContext: CanvasRenderingContext2D
  private staticBandCanvas: Canvas
  private staticBandContext: CanvasRenderingContext2D
  private bodyTextStripCanvas: Canvas
  private bodyTextStripContext: CanvasRenderingContext2D
  private bandCanvasWidth = 1
  private bandCanvasHeight = 1
  private staticBandDirty = true
  private bodyTextStripDirty = true
  private bodyTextStripCacheKey = ''
  private bodyTextStripCycleWidth = 1
  private framePixels: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0))
  private lastDestinationBounds: GraphicsFrameBounds | null = null
  private tickerCycleOrigin = Date.now()
  private renderTimer: NodeJS.Timeout | null = null
  private disposed = false

  public constructor(options: NativeTickerRendererOptions) {
    this.resolution = options.resolution
    this.layout = options.layout
    this.style = options.style
    this.animations = options.animations ?? {}
    this.onFrame = options.onFrame
    this.values = {
      label: options.initialValues.label,
      text: options.initialValues.text,
      speed: options.initialValues.speed
    }
    this.renderWidth = Math.max(MIN_RENDER_SIZE, options.resolution.width)
    this.renderHeight = Math.max(MIN_RENDER_SIZE, options.resolution.height)
    this.bandCanvas = createCanvas(1, 1)
    const context = this.bandCanvas.getContext('2d')

    if (!context) {
      throw new Error('No se pudo crear el contexto 2D del renderer native de ticker')
    }

    this.bandContext = context
    this.staticBandCanvas = createCanvas(1, 1)
    const staticContext = this.staticBandCanvas.getContext('2d')

    if (!staticContext) {
      throw new Error('No se pudo crear el contexto 2D estático del renderer native de ticker')
    }

    this.staticBandContext = staticContext
    this.bodyTextStripCanvas = createCanvas(1, 1)
    const bodyTextContext = this.bodyTextStripCanvas.getContext('2d')

    if (!bodyTextContext) {
      throw new Error('No se pudo crear el contexto 2D del texto del ticker native')
    }

    this.bodyTextStripContext = bodyTextContext
    this.renderNow()
  }

  public isDisposed(): boolean {
    return this.disposed
  }

  public dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = null
    }
  }

  public async updateField(fieldId: string, value: string): Promise<void> {
    if (fieldId === 'label' || fieldId === 'text' || fieldId === 'speed') {
      this.values = {
        ...this.values,
        [fieldId]: value
      }

      if (fieldId === 'label') {
        this.staticBandDirty = true
      }

      if (fieldId === 'text') {
        this.bodyTextStripDirty = true
      }

      this.tickerCycleOrigin = Date.now()
      this.renderNow()
      this.syncRenderLoop()
    }
  }

  public async setPlacement(placement: GraphicsPlacement): Promise<void> {
    this.placement = { ...placement }
    this.renderNow()
  }

  public async setRuntimeState(runtimeState: GraphicsRendererRuntimeState): Promise<void> {
    this.runtimeState = { ...runtimeState }
    this.syncRenderLoop()
    this.renderNow()
  }

  public async animateIn(): Promise<void> {
    return this.startAnimation(this.animations.in, 1)
  }

  public async animateOut(): Promise<void> {
    return this.startAnimation(this.animations.out, 0)
  }

  public async preparePreview(): Promise<void> {
    if (this.animation) {
      this.animation.resolve()
      this.animation = null
    }

    this.visibilityProgress = 1
    this.renderNow()
    this.syncRenderLoop()
  }

  public setRenderConfig(width: number, height: number, zoomFactor: number): void {
    const nextWidth = Math.max(MIN_RENDER_SIZE, Math.round(width))
    const nextHeight = Math.max(MIN_RENDER_SIZE, Math.round(height))
    const nextZoomFactor = Math.max(0.01, zoomFactor)

    if (
      nextWidth === this.renderWidth &&
      nextHeight === this.renderHeight &&
      nextZoomFactor === this.renderZoomFactor
    ) {
      return
    }

    this.renderWidth = nextWidth
    this.renderHeight = nextHeight
    this.renderZoomFactor = nextZoomFactor
    this.staticBandDirty = true
    this.bodyTextStripDirty = true
    this.renderNow()
  }

  public setFrameRate(frameRate: number): void {
    const nextFrameRate = Math.max(1, Math.round(frameRate))
    if (nextFrameRate === this.frameRate) {
      return
    }

    this.frameRate = nextFrameRate
    this.syncRenderLoop()
  }

  private async startAnimation(
    config: NativeTickerAnimationConfig | undefined,
    targetProgress: 0 | 1
  ): Promise<void> {
    if (this.disposed) {
      return
    }

    if (!config || config.durationMs <= 0) {
      this.visibilityProgress = targetProgress
      this.animation = null
      this.renderNow()
      this.syncRenderLoop()
      return
    }

    if (this.animation) {
      this.animation.resolve()
      this.animation = null
    }

    await new Promise<void>((resolve) => {
      this.animation = {
        startedAt: Date.now(),
        durationMs: Math.max(1, Math.round(config.durationMs)),
        fromProgress: this.visibilityProgress,
        toProgress: targetProgress,
        offsetYPx: Math.max(0, Math.round(config.offsetYPx)),
        resolve
      }

      this.renderNow()
      this.syncRenderLoop()
    })
  }

  private shouldAnimateScroll(): boolean {
    return (
      (this.runtimeState.stackPreviewActive ||
        (this.runtimeState.isVisible &&
          (this.runtimeState.previewActive || this.runtimeState.outputActive))) &&
      this.values.text.trim().length > 0
    )
  }

  private needsContinuousRender(): boolean {
    return this.animation !== null || this.shouldAnimateScroll()
  }

  private syncRenderLoop(): void {
    if (this.disposed) {
      return
    }

    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = null
    }

    if (!this.needsContinuousRender()) {
      return
    }

    const frameIntervalMs = Math.max(
      MIN_TIMER_INTERVAL_MS,
      Math.round(1000 / Math.max(1, this.frameRate, this.runtimeState.animationFps))
    )

    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      this.renderNow()
      this.syncRenderLoop()
    }, frameIntervalMs)
  }

  private updateAnimationProgress(now: number): { opacity: number; translateY: number } {
    if (!this.animation) {
      return {
        opacity: this.visibilityProgress,
        translateY: 0
      }
    }

    const elapsed = now - this.animation.startedAt
    const ratio = Math.max(0, Math.min(1, elapsed / Math.max(1, this.animation.durationMs)))
    const easedRatio = 1 - (1 - ratio) * (1 - ratio)
    this.visibilityProgress =
      this.animation.fromProgress +
      (this.animation.toProgress - this.animation.fromProgress) * easedRatio

    const offset = (1 - this.visibilityProgress) * this.animation.offsetYPx

    if (ratio >= 1) {
      this.visibilityProgress = this.animation.toProgress
      const resolve = this.animation.resolve
      this.animation = null
      resolve()
    }

    return {
      opacity: this.visibilityProgress,
      translateY: offset
    }
  }

  private resolveGeometry(): BandGeometry {
    const scale = Math.max(
      0.01,
      Math.min(
        this.renderWidth / Math.max(1, this.resolution.width),
        this.renderHeight / Math.max(1, this.resolution.height)
      )
    )

    const width = Math.max(1, Math.round(this.layout.width * scale))
    const height = Math.max(1, Math.round(this.layout.height * scale))
    const labelWidth = Math.max(1, Math.round(this.layout.labelWidth * scale))
    const x = Math.round((this.layout.left + this.placement.offsetX) * scale)
    const y = Math.round(
      this.renderHeight - height - (this.layout.bottom - this.placement.offsetY) * scale
    )

    return {
      x,
      y,
      width,
      height,
      labelWidth,
      bodyWidth: Math.max(1, width - labelWidth),
      bodyPaddingY: Math.max(0, Math.round(this.layout.bodyPaddingY * scale)),
      copyGap: Math.max(24, Math.round(this.layout.copyGap * scale)),
      cornerRadius: Math.max(
        6,
        Math.round((this.style.cornerRadius ?? DEFAULT_CORNER_RADIUS) * scale)
      ),
      scale
    }
  }

  private ensureBandCanvas(width: number, height: number): void {
    if (width === this.bandCanvasWidth && height === this.bandCanvasHeight) {
      return
    }

    this.bandCanvas = createCanvas(width, height)
    const context = this.bandCanvas.getContext('2d')

    if (!context) {
      throw new Error('No se pudo recrear el contexto 2D del ticker native')
    }

    this.bandContext = context
    this.staticBandCanvas = createCanvas(width, height)
    const staticContext = this.staticBandCanvas.getContext('2d')

    if (!staticContext) {
      throw new Error('No se pudo recrear el contexto 2D estático del ticker native')
    }

    this.staticBandContext = staticContext
    this.bandCanvasWidth = width
    this.bandCanvasHeight = height
    this.staticBandDirty = true
    this.bodyTextStripDirty = true
  }

  private renderStaticBand(geometry: BandGeometry): void {
    const ctx = this.staticBandContext
    ctx.clearRect(0, 0, geometry.width, geometry.height)
    this.drawBackground(ctx, geometry, 1)
    this.drawLabel(ctx, geometry, 1)
    this.staticBandDirty = false
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    geometry: BandGeometry,
    opacity: number
  ): void {
    const radius = geometry.cornerRadius
    const labelAccentHeight = Math.max(3, Math.round(geometry.height * 0.18))
    const bodyAccentHeight = Math.max(2, Math.round(geometry.height * 0.08))

    ctx.save()
    ctx.globalAlpha = opacity

    ctx.beginPath()
    ctx.roundRect(0, 0, geometry.labelWidth, geometry.height, radius)
    ctx.fillStyle = this.style.labelBackground
    ctx.fill()

    ctx.beginPath()
    ctx.roundRect(
      geometry.labelWidth - radius,
      0,
      geometry.bodyWidth + radius,
      geometry.height,
      radius
    )
    ctx.fillStyle = this.style.bodyBackground
    ctx.fill()

    ctx.beginPath()
    ctx.roundRect(0, 0, geometry.labelWidth, labelAccentHeight, [radius, radius, 0, 0])
    ctx.fillStyle = this.style.labelBackgroundAccent ?? DEFAULT_LABEL_BACKGROUND_ACCENT
    ctx.fill()

    ctx.beginPath()
    ctx.roundRect(geometry.labelWidth, 0, geometry.bodyWidth, bodyAccentHeight, [0, radius, 0, 0])
    ctx.fillStyle = this.style.bodyBackgroundAccent ?? DEFAULT_BODY_BACKGROUND_ACCENT
    ctx.fill()

    ctx.strokeStyle = this.style.borderColor ?? DEFAULT_BORDER_COLOR
    ctx.lineWidth = Math.max(1, Math.round(geometry.scale * 1.4))
    ctx.beginPath()
    ctx.roundRect(0, 0, geometry.width, geometry.height, radius)
    ctx.stroke()

    ctx.restore()
  }

  private drawLabel(ctx: CanvasRenderingContext2D, geometry: BandGeometry, opacity: number): void {
    const fontSize = Math.max(12, Math.round(this.style.labelFontSize * geometry.scale))
    const letterSpacingPx = Math.max(0, fontSize * (this.style.labelLetterSpacingEm ?? 0))

    ctx.save()
    ctx.globalAlpha = opacity
    ctx.fillStyle = this.style.labelTextColor
    ctx.font = `${this.style.labelFontWeight ?? 800} ${fontSize}px ${this.style.fontFamily}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.letterSpacing = `${letterSpacingPx}px`
    ctx.fillText(this.values.label.toUpperCase(), geometry.labelWidth / 2, geometry.height / 2)
    ctx.restore()
  }

  private drawBodyText(
    ctx: CanvasRenderingContext2D,
    geometry: BandGeometry,
    opacity: number,
    now: number
  ): void {
    const layout = this.resolveBodyTextLayout(geometry)

    ctx.save()
    ctx.beginPath()
    ctx.rect(layout.bodyX, 0, geometry.bodyWidth, geometry.height)
    ctx.clip()
    ctx.globalAlpha = opacity
    ctx.fillStyle = this.style.bodyTextColor
    ctx.font = layout.font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.letterSpacing = `${layout.letterSpacingPx}px`

    if (layout.bodyText.length === 0) {
      ctx.restore()
      return
    }

    const cycleWidth = this.ensureBodyTextStrip(layout, geometry)

    if (!this.shouldAnimateScroll() || cycleWidth <= layout.availableWidth) {
      ctx.fillText(layout.bodyText, layout.bodyX + layout.bodyPaddingX, layout.textBaselineY)
      ctx.restore()
      return
    }

    const speedSeconds = this.resolveTickerSpeedSeconds()
    const cycleDurationMs = Math.max(1, Math.round(speedSeconds * 1000))
    const cycleProgress = ((now - this.tickerCycleOrigin) % cycleDurationMs) / cycleDurationMs
    const scrollOffset = Math.round(cycleWidth * cycleProgress)

    // Rasterizamos el texto una vez y durante el scroll solo movemos una ventana
    // sobre esa tira para quitar measureText/fillText del camino caliente.
    ctx.drawImage(
      this.bodyTextStripCanvas,
      scrollOffset,
      0,
      layout.availableWidth,
      geometry.height,
      layout.bodyX + layout.bodyPaddingX,
      0,
      layout.availableWidth,
      geometry.height
    )

    ctx.restore()
  }

  private resolveBodyTextLayout(geometry: BandGeometry): BodyTextLayout {
    const fontSize = Math.max(14, Math.round(this.style.bodyFontSize * geometry.scale))
    const letterSpacingPx = Math.max(0, fontSize * (this.style.bodyLetterSpacingEm ?? 0))

    return {
      bodyText: this.values.text.trim(),
      bodyX: geometry.labelWidth,
      bodyPaddingX: Math.max(18, Math.round(geometry.scale * 28)),
      textBaselineY: geometry.height / 2,
      availableWidth: Math.max(
        1,
        geometry.bodyWidth - Math.max(18, Math.round(geometry.scale * 28)) * 2
      ),
      fontSize,
      letterSpacingPx,
      font: `${this.style.bodyFontWeight ?? 600} ${fontSize}px ${this.style.fontFamily}`
    }
  }

  private ensureBodyTextStrip(layout: BodyTextLayout, geometry: BandGeometry): number {
    const cacheKey = [
      layout.bodyText,
      layout.font,
      layout.letterSpacingPx,
      layout.availableWidth,
      geometry.copyGap,
      geometry.height,
      this.style.bodyTextColor
    ].join('|')

    if (!this.bodyTextStripDirty && this.bodyTextStripCacheKey === cacheKey) {
      return this.bodyTextStripCycleWidth
    }

    const measureContext = this.bodyTextStripContext
    measureContext.font = layout.font
    measureContext.letterSpacing = `${layout.letterSpacingPx}px`
    const textMetrics = measureContext.measureText(layout.bodyText)
    const cycleWidth = Math.max(textMetrics.width + geometry.copyGap, layout.availableWidth)
    const stripWidth = Math.max(1, Math.ceil(cycleWidth * 2))

    this.bodyTextStripCanvas = createCanvas(stripWidth, geometry.height)
    const stripContext = this.bodyTextStripCanvas.getContext('2d')

    if (!stripContext) {
      throw new Error('No se pudo recrear el contexto 2D del texto del ticker native')
    }

    this.bodyTextStripContext = stripContext
    stripContext.clearRect(0, 0, stripWidth, geometry.height)
    stripContext.fillStyle = this.style.bodyTextColor
    stripContext.font = layout.font
    stripContext.textBaseline = 'middle'
    stripContext.textAlign = 'left'
    stripContext.letterSpacing = `${layout.letterSpacingPx}px`
    stripContext.fillText(layout.bodyText, layout.availableWidth, layout.textBaselineY)
    stripContext.fillText(layout.bodyText, layout.availableWidth + cycleWidth, layout.textBaselineY)

    this.bodyTextStripCacheKey = cacheKey
    this.bodyTextStripCycleWidth = cycleWidth
    this.bodyTextStripDirty = false

    return cycleWidth
  }

  private resolveTickerSpeedSeconds(): number {
    const parsedSpeed = Number.parseFloat(this.values.speed)
    if (!Number.isFinite(parsedSpeed)) {
      return 18
    }

    return Math.max(MIN_TICKER_SPEED_SECONDS, Math.min(MAX_TICKER_SPEED_SECONDS, parsedSpeed))
  }

  private createTransparentFrame(width: number, height: number): Uint8Array<ArrayBuffer> {
    return new Uint8Array(new ArrayBuffer(width * height * 4))
  }

  private ensureFrameBuffer(): Uint8Array<ArrayBuffer> {
    const expectedLength = this.renderWidth * this.renderHeight * 4
    if (this.framePixels.length === expectedLength) {
      return this.framePixels
    }

    this.framePixels = this.createTransparentFrame(this.renderWidth, this.renderHeight)
    this.lastDestinationBounds = null
    return this.framePixels
  }

  private cloneBounds(bounds: GraphicsFrameBounds | null): GraphicsFrameBounds | null {
    return bounds ? { ...bounds } : null
  }

  private mergeDirtyBounds(
    previousBounds: GraphicsFrameBounds | null,
    nextBounds: GraphicsFrameBounds | null
  ): GraphicsFrameBounds | null {
    if (!previousBounds) {
      return this.cloneBounds(nextBounds)
    }

    if (!nextBounds) {
      return this.cloneBounds(previousBounds)
    }

    const minX = Math.min(previousBounds.x, nextBounds.x)
    const minY = Math.min(previousBounds.y, nextBounds.y)
    const maxX = Math.max(previousBounds.x + previousBounds.width, nextBounds.x + nextBounds.width)
    const maxY = Math.max(
      previousBounds.y + previousBounds.height,
      nextBounds.y + nextBounds.height
    )

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  private clearFrameBounds(pixels: Uint8Array, bounds: GraphicsFrameBounds | null): void {
    if (!bounds) {
      return
    }

    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      const rowStart = (y * this.renderWidth + bounds.x) * 4
      const rowEnd = rowStart + bounds.width * 4
      pixels.fill(0, rowStart, rowEnd)
    }
  }

  private convertBandImageDataToBgraFrame(
    rgbaPixels: Uint8ClampedArray,
    geometry: BandGeometry,
    translateY: number,
    opacity: number
  ): NativeTickerFrame {
    const framePixels = this.ensureFrameBuffer()
    const previousBounds = this.lastDestinationBounds

    if (opacity <= 0) {
      const dirtyBounds = this.cloneBounds(previousBounds)
      this.clearFrameBounds(framePixels, dirtyBounds)
      this.lastDestinationBounds = null

      return {
        pixels: framePixels,
        width: this.renderWidth,
        height: this.renderHeight,
        alphaBounds: null,
        dirtyBounds
      }
    }

    const destinationBounds = this.clampBounds({
      x: geometry.x,
      y: Math.round(geometry.y + translateY),
      width: geometry.width,
      height: geometry.height
    })
    const dirtyBounds = this.mergeDirtyBounds(previousBounds, destinationBounds)

    this.clearFrameBounds(framePixels, dirtyBounds)

    if (!destinationBounds) {
      this.lastDestinationBounds = null

      return {
        pixels: framePixels,
        width: this.renderWidth,
        height: this.renderHeight,
        alphaBounds: null,
        dirtyBounds
      }
    }

    const sourceOffsetX = Math.max(0, destinationBounds.x - geometry.x)
    const sourceOffsetY = Math.max(0, destinationBounds.y - Math.round(geometry.y + translateY))

    for (let row = 0; row < destinationBounds.height; row += 1) {
      const sourceRow = sourceOffsetY + row
      const destinationRow = destinationBounds.y + row

      for (let column = 0; column < destinationBounds.width; column += 1) {
        const sourceColumn = sourceOffsetX + column
        const sourceIndex = (sourceRow * geometry.width + sourceColumn) * 4
        const destinationIndex =
          (destinationRow * this.renderWidth + destinationBounds.x + column) * 4

        framePixels[destinationIndex] = rgbaPixels[sourceIndex + 2]
        framePixels[destinationIndex + 1] = rgbaPixels[sourceIndex + 1]
        framePixels[destinationIndex + 2] = rgbaPixels[sourceIndex]
        framePixels[destinationIndex + 3] = rgbaPixels[sourceIndex + 3]
      }
    }

    this.lastDestinationBounds = { ...destinationBounds }

    return {
      pixels: framePixels,
      width: this.renderWidth,
      height: this.renderHeight,
      alphaBounds: destinationBounds,
      dirtyBounds
    }
  }

  private clampBounds(bounds: GraphicsFrameBounds): GraphicsFrameBounds | null {
    const startX = Math.max(0, Math.min(this.renderWidth, bounds.x))
    const startY = Math.max(0, Math.min(this.renderHeight, bounds.y))
    const endX = Math.max(startX, Math.min(this.renderWidth, bounds.x + bounds.width))
    const endY = Math.max(startY, Math.min(this.renderHeight, bounds.y + bounds.height))

    if (startX >= endX || startY >= endY) {
      return null
    }

    return {
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY
    }
  }

  private renderNow(): void {
    if (this.disposed) {
      return
    }

    const now = Date.now()
    const geometry = this.resolveGeometry()
    const animationState = this.updateAnimationProgress(now)

    this.ensureBandCanvas(geometry.width, geometry.height)

    const ctx = this.bandContext
    ctx.clearRect(0, 0, geometry.width, geometry.height)

    if (animationState.opacity > 0) {
      if (this.staticBandDirty) {
        this.renderStaticBand(geometry)
      }

      ctx.save()
      ctx.globalAlpha = animationState.opacity
      ctx.drawImage(this.staticBandCanvas, 0, 0)
      ctx.restore()
      this.drawBodyText(ctx, geometry, animationState.opacity, now)
    }

    const imageData = ctx.getImageData(0, 0, geometry.width, geometry.height)
    const frame = this.convertBandImageDataToBgraFrame(
      imageData.data,
      geometry,
      animationState.translateY,
      animationState.opacity
    )

    this.onFrame(frame)
  }
}
