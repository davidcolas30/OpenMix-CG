import { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { GraphicsFrameBounds } from '../../../shared/ipc/graphics-contracts'
import { BACKGROUND_GRAPHICS_FPS } from './graphicsServiceConfig'
import {
  computeAlphaBounds,
  computeAlphaBoundsInRegion,
  isFullFrameBounds,
  mergeAlphaBounds,
  patchRasterFrameRegion,
  unpremultiplyBgraFrame,
  unpremultiplyBgraFrameRegion
} from './graphicsFrameUtils'
import { captureGraphicsPaintFrame } from './graphicsPaintCapture'
import type { LoadedGraphicsTemplate, ParsedWindowTemplateManifest } from './graphicsTemplates'
import type { GraphicsItem, GraphicsItemRenderer } from './graphicsServiceTypes'

interface HtmlWindowRendererDependencies {
  resolveRenderSize(): { width: number; height: number }
  resolveUsefulCaptureSize(): { width: number; height: number }
  findItem(itemId: string): GraphicsItem | undefined
  recordItemPaint(
    item: GraphicsItem,
    dirtyBounds: GraphicsFrameBounds | null,
    frameWidth: number,
    frameHeight: number
  ): void
  updateItemFrame(
    itemId: string,
    pixels: Uint8Array,
    width: number,
    height: number,
    alphaBounds: GraphicsFrameBounds | null
  ): void
  onWindowClosed(itemId: string): void
}

function createGraphicsItemWindow(
  itemId: string,
  width: number,
  height: number,
  dependencies: HtmlWindowRendererDependencies
): BrowserWindow {
  const window = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    paintWhenInitiallyHidden: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.webContents.setFrameRate(BACKGROUND_GRAPHICS_FPS)
  window.webContents.on('paint', (_event, dirty, image) => {
    const item = dependencies.findItem(itemId)
    const targetWidth = item?.renderWidth ?? width
    const targetHeight = item?.renderHeight ?? height
    const usefulCaptureSize = dependencies.resolveUsefulCaptureSize()
    const capturedFrame = captureGraphicsPaintFrame(image, dirty, {
      captureWidth: width,
      captureHeight: height,
      targetWidth,
      targetHeight,
      usefulWidth: usefulCaptureSize.width,
      usefulHeight: usefulCaptureSize.height
    })
    const { bitmap, frameWidth: imageWidth, frameHeight: imageHeight, dirtyBounds } = capturedFrame

    if (item) {
      dependencies.recordItemPaint(item, dirtyBounds, imageWidth, imageHeight)
    }

    if (
      item?.latestRenderedFrame &&
      item.latestRenderedFrame.width === imageWidth &&
      item.latestRenderedFrame.height === imageHeight &&
      dirtyBounds &&
      item.forceFullFramePaintsRemaining <= 0 &&
      !isFullFrameBounds(dirtyBounds, imageWidth, imageHeight)
    ) {
      const recomputeBounds = mergeAlphaBounds(item.latestRenderedFrame.alphaBounds, dirtyBounds)
      const nextPixels = item.latestRenderedFrame.data

      patchRasterFrameRegion(nextPixels, imageWidth, bitmap, dirtyBounds)
      unpremultiplyBgraFrameRegion(nextPixels, imageWidth, imageHeight, dirtyBounds)

      dependencies.updateItemFrame(
        itemId,
        nextPixels,
        imageWidth,
        imageHeight,
        computeAlphaBoundsInRegion(nextPixels, imageWidth, imageHeight, recomputeBounds)
      )

      return
    }

    if (item && item.forceFullFramePaintsRemaining > 0) {
      item.forceFullFramePaintsRemaining -= 1
    }

    const alphaBounds = computeAlphaBounds(bitmap, imageWidth, imageHeight)

    dependencies.updateItemFrame(
      itemId,
      unpremultiplyBgraFrame(bitmap, imageWidth, imageHeight, alphaBounds),
      imageWidth,
      imageHeight,
      alphaBounds
    )
  })

  window.on('closed', () => {
    dependencies.onWindowClosed(itemId)
  })

  return window
}

async function callTemplateMethod(
  window: BrowserWindow,
  methodName: string,
  args: unknown[] = []
): Promise<boolean> {
  if (window.isDestroyed()) {
    return false
  }

  const serializedMethodName = JSON.stringify(methodName)
  const serializedArguments = args.map((argument) => JSON.stringify(argument)).join(', ')
  const script = `
    (async () => {
      const template = window.__openmixTemplate;
      if (!template || typeof template[${serializedMethodName}] !== 'function') {
        return false;
      }
      await template[${serializedMethodName}](${serializedArguments});
      return true;
    })();
  `

  const result = await window.webContents.executeJavaScript(script, true)
  return result === true
}

export function createHtmlGraphicsItemRenderer(
  itemId: string,
  template: LoadedGraphicsTemplate & { manifest: ParsedWindowTemplateManifest },
  dependencies: HtmlWindowRendererDependencies
): GraphicsItemRenderer {
  const entryPath = join(template.directoryPath, template.manifest.entryHtml)
  if (!existsSync(entryPath)) {
    throw new Error(
      `La plantilla ${template.manifest.id} no contiene ${template.manifest.entryHtml}`
    )
  }

  const initialRenderSize = dependencies.resolveRenderSize()
  const window = createGraphicsItemWindow(
    itemId,
    initialRenderSize.width,
    initialRenderSize.height,
    dependencies
  )

  return {
    async load() {
      await window.loadFile(entryPath)
    },
    getWindow() {
      return window
    },
    isDisposed() {
      return window.isDestroyed()
    },
    dispose() {
      if (!window.isDestroyed()) {
        window.close()
      }
    },
    async updateField(fieldId, value) {
      await callTemplateMethod(window, 'updateField', [fieldId, value])
    },
    async setPlacement(placement) {
      const placementApplied = await callTemplateMethod(window, 'setPlacement', [placement])
      if (placementApplied || window.isDestroyed()) {
        return
      }

      const placementStyleScript = `
        (() => {
          document.documentElement.style.setProperty('--openmix-offset-x', ${JSON.stringify(`${placement.offsetX}px`)});
          document.documentElement.style.setProperty('--openmix-offset-y', ${JSON.stringify(`${placement.offsetY}px`)});
        })();
      `

      await window.webContents.executeJavaScript(placementStyleScript, true)
    },
    async setRuntimeState(runtimeState) {
      await callTemplateMethod(window, 'setRuntimeState', [runtimeState])
    },
    async prepareIn() {
      await callTemplateMethod(window, 'prepareIn')
    },
    async preparePreview() {
      await callTemplateMethod(window, 'preparePreview')
    },
    async animateIn() {
      await callTemplateMethod(window, 'animateIn')
    },
    async animateOut() {
      await callTemplateMethod(window, 'animateOut')
    },
    setRenderConfig(width, height, zoomFactor) {
      if (window.isDestroyed()) {
        return
      }

      window.setContentSize(width, height)
      window.webContents.setZoomFactor(zoomFactor)
    },
    setFrameRate(frameRate) {
      if (window.isDestroyed()) {
        return
      }

      window.webContents.setFrameRate(frameRate)
    }
  }
}
