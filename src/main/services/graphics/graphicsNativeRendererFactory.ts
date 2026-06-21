import { NativeTickerRenderer, type NativeTickerFrame } from '../nativeTickerRenderer'
import type {
  LoadedGraphicsTemplate,
  ParsedNativeTickerTemplateManifest
} from './graphicsTemplates'
import type { GraphicsItemRenderer } from './graphicsServiceTypes'

export function createNativeGraphicsItemRenderer(
  itemId: string,
  template: LoadedGraphicsTemplate & { manifest: ParsedNativeTickerTemplateManifest },
  initialValues: Record<string, string>,
  onFrame: (itemId: string, frame: NativeTickerFrame) => void
): GraphicsItemRenderer {
  const renderer = new NativeTickerRenderer({
    resolution: template.manifest.resolution,
    layout: template.manifest.layout,
    style: template.manifest.style,
    animations: template.manifest.animations,
    initialValues: {
      label: initialValues.label ?? '',
      text: initialValues.text ?? '',
      speed: initialValues.speed ?? '18'
    },
    onFrame: (frame) => {
      onFrame(itemId, frame)
    }
  })

  return {
    async load() {
      return Promise.resolve()
    },
    getWindow() {
      return null
    },
    isDisposed() {
      return renderer.isDisposed()
    },
    dispose() {
      renderer.dispose()
    },
    async updateField(fieldId, value) {
      await renderer.updateField(fieldId, value)
    },
    async setPlacement(placement) {
      await renderer.setPlacement(placement)
    },
    async setRuntimeState(runtimeState) {
      await renderer.setRuntimeState(runtimeState)
    },
    async prepareIn() {
      return Promise.resolve()
    },
    async preparePreview() {
      await renderer.preparePreview()
    },
    async animateIn() {
      await renderer.animateIn()
    },
    async animateOut() {
      await renderer.animateOut()
    },
    setRenderConfig(width, height, zoomFactor) {
      renderer.setRenderConfig(width, height, zoomFactor)
    },
    setFrameRate(frameRate) {
      renderer.setFrameRate(frameRate)
    }
  }
}
