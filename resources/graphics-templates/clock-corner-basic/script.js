class CornerClockTemplate {
  constructor() {
    this.root = document.getElementById('clock-card')
    this.labelField = this.root.querySelector('[data-field="label"]')
    this.zoneLabelField = this.root.querySelector('[data-field="zoneLabel"]')
    this.timeNode = document.getElementById('clock-time')
    this.dateNode = document.getElementById('clock-date')
    this.baseTop = 46
    this.baseLeft = 52
    this.defaultLabel = this.labelField.textContent ?? ''
    this.defaultZoneLabel = this.zoneLabelField.textContent ?? ''
    this.timeZone = 'Europe/Madrid'
    this.animationPromise = null
    this.timerId = null

    this.setPlacement({ offsetX: 0, offsetY: 0 })
    this.#startClock()
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
        id: 'zoneLabel',
        label: 'Zona visible',
        type: 'text',
        defaultValue: this.defaultZoneLabel,
        maxLength: 24
      },
      {
        id: 'timeZone',
        label: 'Zona horaria IANA',
        type: 'text',
        defaultValue: this.timeZone,
        maxLength: 60
      }
    ]
  }

  updateField(fieldId, value) {
    if (fieldId === 'label') {
      this.labelField.textContent = this.#normalizeText(value, this.defaultLabel)
      return
    }

    if (fieldId === 'zoneLabel') {
      this.zoneLabelField.textContent = this.#normalizeText(value, this.defaultZoneLabel)
      return
    }

    if (fieldId === 'timeZone') {
      this.timeZone = this.#normalizeText(value, 'Europe/Madrid')
      this.#renderClock()
    }
  }

  setPlacement(placement) {
    const offsetX = Number.isFinite(placement?.offsetX) ? placement.offsetX : 0
    const offsetY = Number.isFinite(placement?.offsetY) ? placement.offsetY : 0

    this.root.style.left = `${this.baseLeft + offsetX}px`
    this.root.style.top = `${this.baseTop + offsetY}px`
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

  #startClock() {
    this.#renderClock()

    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
    }

    this.timerId = window.setInterval(() => this.#renderClock(), 1000)
    window.addEventListener('beforeunload', () => {
      if (this.timerId !== null) {
        window.clearInterval(this.timerId)
      }
    })
  }

  #renderClock() {
    const now = new Date()

    try {
      this.timeNode.textContent = new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: this.timeZone
      }).format(now)

      this.dateNode.textContent = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        timeZone: this.timeZone
      }).format(now)
    } catch {
      this.timeNode.textContent = new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(now)

      this.dateNode.textContent = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      }).format(now)
    }
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

window.__openmixTemplate = new CornerClockTemplate()
