class CornerBugTemplate {
  constructor() {
    this.root = document.getElementById('corner-bug')
    this.brandField = this.root.querySelector('[data-field="brand"]')
    this.tagField = this.root.querySelector('[data-field="tag"]')
    this.baseTop = 44
    this.baseRight = 52
    this.defaultBrand = this.brandField.textContent ?? ''
    this.defaultTag = this.tagField.textContent ?? ''
    this.animationPromise = null

    this.setPlacement({ offsetX: 0, offsetY: 0 })
  }

  getFields() {
    return [
      {
        id: 'brand',
        label: 'Marca',
        type: 'text',
        defaultValue: this.defaultBrand,
        maxLength: 14
      },
      {
        id: 'tag',
        label: 'Etiqueta',
        type: 'text',
        defaultValue: this.defaultTag,
        maxLength: 28
      }
    ]
  }

  updateField(fieldId, value) {
    if (fieldId === 'brand') {
      this.brandField.textContent = this.#normalizeText(value, this.defaultBrand)
      return
    }

    if (fieldId === 'tag') {
      this.tagField.textContent = this.#normalizeText(value, this.defaultTag)
    }
  }

  setPlacement(placement) {
    const offsetX = Number.isFinite(placement?.offsetX) ? placement.offsetX : 0
    const offsetY = Number.isFinite(placement?.offsetY) ? placement.offsetY : 0

    this.root.style.right = `${this.baseRight - offsetX}px`
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

window.__openmixTemplate = new CornerBugTemplate()
