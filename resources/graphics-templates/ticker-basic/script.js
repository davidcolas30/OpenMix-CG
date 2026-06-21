class TickerTemplate {
  constructor() {
    this.root = document.getElementById('ticker')
    this.label = this.root.querySelector('[data-field="label"]')
    this.primaryCopy = document.getElementById('ticker-copy-a')
    this.secondaryCopy = document.getElementById('ticker-copy-b')
    this.track = document.getElementById('ticker-track')
    this.shell = document.getElementById('ticker-shell')
    this.baseLeft = 72
    this.baseBottom = 46
    this.defaultText = this.primaryCopy.textContent ?? ''
    this.defaultLabel = this.label.textContent ?? ''
    this.animationPromise = null
    this.motionTimer = null
    this.lastMotionTickAt = 0
    this.currentOffset = 0
    this.cycleDistance = 1280
    this.cycleDurationMs = 18000
    this.runtimeState = {
      isVisible: false,
      previewActive: false,
      stackPreviewActive: false,
      outputActive: false,
      animationFps: 0
    }

    this.setPlacement({ offsetX: 0, offsetY: 0 })
    this.#applySpeed('18')
    this.#syncText(this.defaultText)
    this.setRuntimeState(this.runtimeState)
    window.addEventListener('resize', () => this.#refreshCycleDistance())
  }

  getFields() {
    return [
      {
        id: 'label',
        label: 'Etiqueta',
        type: 'text',
        defaultValue: this.defaultLabel,
        maxLength: 20
      },
      {
        id: 'text',
        label: 'Texto',
        type: 'text',
        defaultValue: this.defaultText,
        maxLength: 220
      },
      {
        id: 'speed',
        label: 'Duracion del ciclo',
        type: 'number',
        defaultValue: '18'
      }
    ]
  }

  updateField(fieldId, value) {
    if (fieldId === 'label') {
      this.label.textContent = this.#normalizeText(value, this.defaultLabel)
      return
    }

    if (fieldId === 'text') {
      this.#syncText(value)
      return
    }

    if (fieldId === 'speed') {
      this.#applySpeed(value)
    }
  }

  setPlacement(placement) {
    const offsetX = Number.isFinite(placement?.offsetX) ? placement.offsetX : 0
    const offsetY = Number.isFinite(placement?.offsetY) ? placement.offsetY : 0

    this.root.style.left = `${this.baseLeft + offsetX}px`
    this.root.style.bottom = `${this.baseBottom - offsetY}px`
  }

  async animateIn() {
    this.root.classList.remove('animate-in', 'animate-out')
    this.root.classList.add('pre-enter')
    void this.root.offsetWidth
    this.root.classList.add('animate-in')
    this.root.classList.remove('pre-enter')
    await this.#waitForAnimationEnd('animate-in')
  }

  async animateOut() {
    this.root.classList.remove('animate-in', 'pre-enter')
    this.root.classList.add('animate-out')
    await this.#waitForAnimationEnd('animate-out')
    this.root.classList.add('pre-enter')
    await this.#waitForAnimationFrames(2)
  }

  prepareIn() {
    this.root.classList.remove('animate-in', 'animate-out')
    this.root.classList.add('pre-enter')
  }

  async preparePreview() {
    this.root.classList.remove('animate-in', 'animate-out', 'pre-enter')
    await this.#waitForAnimationFrames(2)
  }

  setRuntimeState(runtimeState) {
    this.runtimeState = {
      isVisible: Boolean(runtimeState?.isVisible),
      previewActive: Boolean(runtimeState?.previewActive),
      stackPreviewActive: Boolean(runtimeState?.stackPreviewActive),
      outputActive: Boolean(runtimeState?.outputActive),
      animationFps: this.#sanitizeAnimationFps(runtimeState?.animationFps)
    }

    this.#syncMotionLoop()
  }

  #syncText(value) {
    const normalizedText = this.#normalizeText(value, this.defaultText)
    this.primaryCopy.textContent = normalizedText
    this.secondaryCopy.textContent = normalizedText
    requestAnimationFrame(() => this.#refreshCycleDistance())
  }

  #applySpeed(value) {
    const parsed = Number.parseFloat(value)
    const duration = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 8), 40) : 18
    this.cycleDurationMs = duration * 1000
    document.documentElement.style.setProperty('--ticker-duration', `${duration}s`)
  }

  #refreshCycleDistance() {
    const shellWidth = this.shell.getBoundingClientRect().width
    const primaryWidth = this.primaryCopy.getBoundingClientRect().width
    const distance = Math.max(primaryWidth, shellWidth)
    this.cycleDistance = Math.max(1, Math.round(distance))
    this.currentOffset %= this.cycleDistance
    this.#applyCurrentOffset()
    document.documentElement.style.setProperty('--ticker-cycle-distance', `${this.cycleDistance}px`)
  }

  #sanitizeAnimationFps(value) {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) {
      return 0
    }

    return Math.min(Math.max(Math.round(parsed), 0), 30)
  }

  #syncMotionLoop() {
    if (!this.#shouldAnimate()) {
      this.#stopMotionLoop()
      return
    }

    if (this.motionTimer !== null) {
      return
    }

    this.lastMotionTickAt = performance.now()
    this.motionTimer = window.setTimeout(
      () => this.#tickMotionLoop(),
      this.#resolveMotionIntervalMs()
    )
  }

  #stopMotionLoop() {
    if (this.motionTimer !== null) {
      window.clearTimeout(this.motionTimer)
      this.motionTimer = null
    }
  }

  #shouldAnimate() {
    return (
      this.runtimeState.stackPreviewActive ||
      this.runtimeState.outputActive ||
      this.runtimeState.previewActive
    )
  }

  #resolveMotionIntervalMs() {
    if (this.runtimeState.animationFps <= 0) {
      return 1000
    }

    return Math.max(16, Math.round(1000 / this.runtimeState.animationFps))
  }

  #tickMotionLoop() {
    if (!this.#shouldAnimate()) {
      this.#stopMotionLoop()
      return
    }

    const now = performance.now()
    const elapsedMs = Math.max(1, now - this.lastMotionTickAt)
    this.lastMotionTickAt = now

    // Movemos el ticker a la cadencia pedida por el motor para no renderizar a 60 Hz si solo hay preview.
    this.currentOffset =
      (this.currentOffset + (this.cycleDistance * elapsedMs) / Math.max(this.cycleDurationMs, 1)) %
      this.cycleDistance
    this.#applyCurrentOffset()

    this.motionTimer = window.setTimeout(
      () => this.#tickMotionLoop(),
      this.#resolveMotionIntervalMs()
    )
  }

  #applyCurrentOffset() {
    this.track.style.transform = `translate3d(${-Math.round(this.currentOffset)}px, 0, 0)`
  }

  #normalizeText(value, fallback) {
    const normalized = String(value ?? '').trim()
    return normalized.length > 0 ? normalized : fallback
  }

  #waitForAnimationEnd(className) {
    if (this.animationPromise) {
      return this.animationPromise
    }

    this.animationPromise = new Promise((resolve) => {
      this.root.addEventListener(
        'animationend',
        () => {
          this.root.classList.remove(className)
          this.animationPromise = null
          resolve()
        },
        { once: true }
      )
    })

    return this.animationPromise
  }

  #waitForAnimationFrames(frameCount) {
    return new Promise((resolve) => {
      let remaining = Math.max(1, frameCount)
      const tick = () => {
        remaining -= 1
        if (remaining <= 0) {
          resolve()
          return
        }

        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    })
  }
}

window.__openmixTemplate = new TickerTemplate()
