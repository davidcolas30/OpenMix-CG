class LowerThirdTemplate {
  constructor() {
    this.root = document.getElementById('lower-third')
    this.baseLeft = 88
    this.baseBottom = 84
    this.setPlacement({ offsetX: 0, offsetY: 0 })
  }

  getFields() {
    return Array.from(document.querySelectorAll('[data-field]')).map((element) => ({
      id: element.dataset.field,
      label: element.dataset.field,
      type: 'text',
      defaultValue: element.textContent ?? ''
    }))
  }

  updateField(fieldId, value) {
    const target = document.querySelector(`[data-field="${fieldId}"]`)
    if (target) {
      target.textContent = value
    }
  }

  setPlacement(placement) {
    const offsetX = Number.isFinite(placement?.offsetX) ? placement.offsetX : 0
    const offsetY = Number.isFinite(placement?.offsetY) ? placement.offsetY : 0

    this.root.style.left = `${this.baseLeft + offsetX}px`
    this.root.style.bottom = `${this.baseBottom - offsetY}px`
  }

  async animateIn() {
    this.root.classList.remove('hidden', 'animate-out')
    void this.root.offsetWidth
    this.root.classList.add('animate-in')
    await this.#waitForAnimationEnd()
    this.root.classList.remove('animate-in')
  }

  async animateOut() {
    this.root.classList.remove('animate-in')
    this.root.classList.add('animate-out')
    await this.#waitForAnimationEnd()
    this.root.classList.remove('animate-out')
    this.root.classList.add('hidden')
  }

  prepareIn() {
    this.root.classList.remove('animate-in', 'animate-out')
    this.root.classList.add('hidden')
  }

  async preparePreview() {
    this.root.classList.remove('hidden', 'animate-in', 'animate-out')
    await this.#waitForAnimationFrames(2)
  }

  #waitForAnimationEnd() {
    return new Promise((resolve) => {
      this.root.addEventListener('animationend', () => resolve(), { once: true })
    })
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

window.__openmixTemplate = new LowerThirdTemplate()
