import { BrowserWindow, app, type NativeImage } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BACKGROUND_GRAPHICS_FPS,
  MIXER_MONITOR_GRAPHICS_HEIGHT,
  MIXER_MONITOR_GRAPHICS_WIDTH,
  NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT,
  NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH
} from './graphicsServiceConfig'
import { scaleBgraFrame, type GraphicsDirtyRect } from './graphicsFrameUtils'
import type { HtmlGraphicsSceneState, HtmlGraphicsSceneTarget } from './graphicsServiceTypes'
import type { GraphicsPreviewFrame } from '../../../shared/ipc/graphics-contracts'

interface HtmlGraphicsSceneManagerOptions {
  onPaint(target: HtmlGraphicsSceneTarget, dirty: GraphicsDirtyRect, image: NativeImage): void
}

function createHtmlGraphicsSceneDocument(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body, #scene {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      .openmix-scene-slot {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        background: transparent;
      }

      .openmix-scene-slot iframe {
        position: absolute;
        left: 0;
        top: 0;
        border: 0;
        background: transparent !important;
        background-color: transparent !important;
        pointer-events: none;
        transform-origin: 0 0;
      }
    </style>
  </head>
  <body>
    <main id="scene"></main>
    <script>
      (() => {
        const sceneRoot = document.getElementById('scene');
        const items = new Map();
        const TEMPLATE_METHOD_TIMEOUT_MS = 3000;

        function getTemplate(itemId) {
          const item = items.get(itemId);
          if (!item || !item.iframe.contentWindow) {
            return null;
          }
          return item.iframe.contentWindow.__openmixTemplate || null;
        }

        function forceTransparentFrameDocument(iframe) {
          try {
            const frameDocument = iframe.contentDocument;
            if (!frameDocument) {
              return;
            }

            // Cada plantilla HTML ocupa un lienzo completo 1920x1080. Si
            // Chromium aplanara ese iframe con fondo opaco, el overlay superior
            // taparia a los inferiores antes de llegar a nuestra llave de alpha.
            frameDocument.documentElement.style.background = 'transparent';
            frameDocument.documentElement.style.backgroundColor = 'transparent';
            if (frameDocument.body) {
              frameDocument.body.style.background = 'transparent';
              frameDocument.body.style.backgroundColor = 'transparent';
            }

            if (!frameDocument.getElementById('openmix-transparent-iframe-style')) {
              const style = frameDocument.createElement('style');
              style.id = 'openmix-transparent-iframe-style';
              style.textContent =
                'html, body { background: transparent !important; background-color: transparent !important; }';
              (frameDocument.head || frameDocument.documentElement).appendChild(style);
            }
          } catch (error) {
            console.warn('[OpenMix-CG Scene] No se pudo forzar transparencia de iframe', error);
          }
        }

        async function callTemplateMethod(itemId, methodName, args = []) {
          const template = getTemplate(itemId);
          if (!template || typeof template[methodName] !== 'function') {
            return false;
          }

          let timeoutId = 0;
          const timeoutPromise = new Promise((resolve) => {
            timeoutId = window.setTimeout(() => {
              console.warn('[OpenMix-CG Scene] Timeout ejecutando', methodName, 'en', itemId);
              resolve(false);
            }, TEMPLATE_METHOD_TIMEOUT_MS);
          });

          const result = await Promise.race([
            Promise.resolve(template[methodName](...args)).then(() => true),
            timeoutPromise
          ]);

          window.clearTimeout(timeoutId);
          return Boolean(result);
        }

        window.__openmixScene = {
          items,
          async addItem(config) {
            if (items.has(config.itemId)) {
              return true;
            }

            const slot = document.createElement('section');
            slot.className = 'openmix-scene-slot';
            slot.dataset.itemId = config.itemId;
            slot.style.display = 'none';

            const iframe = document.createElement('iframe');
            const loadPromise = new Promise((resolve) => {
              iframe.addEventListener(
                'load',
                () => {
                  forceTransparentFrameDocument(iframe);
                  resolve(true);
                },
                { once: true }
              );
            });
            iframe.setAttribute('allowtransparency', 'true');
            iframe.src = config.entryUrl;
            iframe.style.width = config.nominalWidth + 'px';
            iframe.style.height = config.nominalHeight + 'px';
            iframe.style.background = 'transparent';
            iframe.style.backgroundColor = 'transparent';
            iframe.style.transform =
              'scale(' + (config.renderWidth / config.nominalWidth) + ',' +
              (config.renderHeight / config.nominalHeight) + ')';

            slot.appendChild(iframe);
            sceneRoot.appendChild(slot);
            items.set(config.itemId, { slot, iframe, visible: false, targetEnabled: false });

            await loadPromise;
            forceTransparentFrameDocument(iframe);

            return true;
          },
          removeItem(itemId) {
            const item = items.get(itemId);
            if (!item) {
              return;
            }
            item.slot.remove();
            items.delete(itemId);
          },
          setRenderConfig(itemId, renderWidth, renderHeight, nominalWidth, nominalHeight) {
            const item = items.get(itemId);
            if (!item) {
              return;
            }
            item.iframe.style.width = nominalWidth + 'px';
            item.iframe.style.height = nominalHeight + 'px';
            item.iframe.style.transform =
              'scale(' + (renderWidth / nominalWidth) + ',' + (renderHeight / nominalHeight) + ')';
          },
          setOutputState(itemId, isVisible, targetEnabled) {
            const item = items.get(itemId);
            if (!item) {
              return;
            }
            item.visible = Boolean(isVisible);
            item.targetEnabled = Boolean(targetEnabled);
            item.slot.style.display = item.visible && item.targetEnabled ? 'block' : 'none';
          },
          callTemplateMethod
        };
      })();
    </script>
  </body>
</html>`
}

export class HtmlGraphicsSceneManager {
  private readonly scenes: Record<HtmlGraphicsSceneTarget, HtmlGraphicsSceneState | null> = {
    preview: null,
    program: null,
    stack: null
  }

  constructor(private readonly options: HtmlGraphicsSceneManagerOptions) {}

  getSceneSize(target: HtmlGraphicsSceneTarget): { width: number; height: number } {
    if (target === 'stack') {
      return {
        width: MIXER_MONITOR_GRAPHICS_WIDTH,
        height: MIXER_MONITOR_GRAPHICS_HEIGHT
      }
    }

    return {
      width: NATIVE_MIXER_OUTPUT_OVERLAY_WIDTH,
      height: NATIVE_MIXER_OUTPUT_OVERLAY_HEIGHT
    }
  }

  getExistingScene(target: HtmlGraphicsSceneTarget): HtmlGraphicsSceneState | null {
    return this.scenes[target]
  }

  hasWindow(window: BrowserWindow): boolean {
    return Object.values(this.scenes).some((scene) => scene?.window === window)
  }

  closeAll(): void {
    for (const target of ['preview', 'program', 'stack'] as const) {
      const scene = this.scenes[target]
      if (scene && !scene.window.isDestroyed()) {
        scene.window.close()
      }
      this.scenes[target] = null
    }
  }

  getScene(target: HtmlGraphicsSceneTarget): HtmlGraphicsSceneState {
    const existingScene = this.scenes[target]
    if (existingScene && !existingScene.window.isDestroyed()) {
      return existingScene
    }

    const scene: HtmlGraphicsSceneState = {
      target,
      window: this.createWindow(target),
      items: new Map(),
      latestFrame: null,
      lastPaintTimestamp: 0,
      lastPaintReportTimestamp: Date.now(),
      lastSpikeTraceTimestamp: 0,
      paintReportCount: 0,
      paintReportSlowFrames: 0,
      paintReportMaxIntervalMs: 0
    }

    this.scenes[target] = scene
    return scene
  }

  async executeScript<T>(target: HtmlGraphicsSceneTarget, script: string): Promise<T> {
    const scene = this.getScene(target)
    await scene.window.webContents.executeJavaScript(
      'window.__openmixScene ? true : new Promise((resolve) => {' +
        'const tick = () => window.__openmixScene ? resolve(true) : requestAnimationFrame(tick);' +
        'tick();' +
        '});',
      true
    )
    return (await scene.window.webContents.executeJavaScript(script, true)) as T
  }

  getFrame(
    target: HtmlGraphicsSceneTarget,
    targetWidth: number,
    targetHeight: number
  ): GraphicsPreviewFrame | null {
    const scene = this.scenes[target]
    if (!scene?.latestFrame?.alphaBounds) {
      return null
    }

    if (scene.latestFrame.width === targetWidth && scene.latestFrame.height === targetHeight) {
      return scene.latestFrame
    }

    const scaledResult = scaleBgraFrame(
      scene.latestFrame.data,
      scene.latestFrame.width,
      scene.latestFrame.height,
      targetWidth,
      targetHeight,
      scene.latestFrame.alphaBounds
    )

    return {
      width: targetWidth,
      height: targetHeight,
      data: scaledResult.pixels,
      alphaBounds: scaledResult.alphaBounds
    }
  }

  private getSceneFilePath(): string {
    const directoryPath = join(app.getPath('userData'), 'graphics')
    mkdirSync(directoryPath, { recursive: true })
    const scenePath = join(directoryPath, 'openmix-html-graphics-scene.html')

    // Cargamos la escena agregada como file:// en vez de data:. Las plantillas
    // HTML tambien son file://, y asi evitamos un origen opaco que puede bloquear
    // el acceso a iframe.contentWindow.__openmixTemplate en Chromium.
    writeFileSync(scenePath, createHtmlGraphicsSceneDocument(), 'utf8')
    return scenePath
  }

  private createWindow(target: HtmlGraphicsSceneTarget): BrowserWindow {
    const sceneSize = this.getSceneSize(target)
    const window = new BrowserWindow({
      width: sceneSize.width,
      height: sceneSize.height,
      useContentSize: true,
      show: false,
      paintWhenInitiallyHidden: true,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        sandbox: false,
        contextIsolation: false,
        nodeIntegration: false,
        // La escena agregada necesita llamar a window.__openmixTemplate dentro
        // de iframes file:// locales. Se limita a plantillas del paquete de la
        // app, y evita N ventanas offscreen compitiendo por el Main Process.
        webSecurity: false
      }
    })

    window.webContents.setFrameRate(BACKGROUND_GRAPHICS_FPS)
    window.webContents.on('paint', (_event, dirty, image) => {
      this.options.onPaint(target, dirty, image)
    })

    void window.loadFile(this.getSceneFilePath())

    return window
  }
}
