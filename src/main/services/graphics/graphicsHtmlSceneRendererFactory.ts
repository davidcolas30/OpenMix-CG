import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  BACKGROUND_GRAPHICS_FPS,
  MIXER_MONITOR_GRAPHICS_FPS,
  MIXER_MONITOR_GRAPHICS_HEIGHT,
  MIXER_MONITOR_GRAPHICS_WIDTH
} from './graphicsServiceConfig'
import type { LoadedGraphicsTemplate, ParsedWindowTemplateManifest } from './graphicsTemplates'
import type {
  GraphicsItem,
  GraphicsItemRenderer,
  GraphicsOverlayTarget,
  HtmlGraphicsSceneState,
  HtmlGraphicsSceneTarget
} from './graphicsServiceTypes'
import type { GraphicsRendererRuntimeState } from '../nativeTickerRenderer'

interface HtmlSceneRendererDependencies {
  resolveRenderSize(): { width: number; height: number }
  getScene(target: HtmlGraphicsSceneTarget): HtmlGraphicsSceneState
  getExistingScene(target: HtmlGraphicsSceneTarget): HtmlGraphicsSceneState | null
  executeScript<T>(target: HtmlGraphicsSceneTarget, script: string): Promise<T>
  findItem(itemId: string): GraphicsItem | undefined
  isStackPreviewVisible(item: GraphicsItem): boolean
  getOverlayTargetList(item: GraphicsItem): GraphicsOverlayTarget[]
}

function callHtmlSceneTemplateMethod(
  dependencies: HtmlSceneRendererDependencies,
  itemId: string,
  methodName: string,
  args: unknown[] = [],
  targets: readonly HtmlGraphicsSceneTarget[] = ['preview', 'program', 'stack']
): Promise<void> {
  const serializedItemId = JSON.stringify(itemId)
  const serializedMethodName = JSON.stringify(methodName)
  const serializedArguments = JSON.stringify(args)

  return Promise.all(
    targets.map((target) =>
      dependencies.executeScript<void>(
        target,
        `
          window.__openmixScene.callTemplateMethod(
            ${serializedItemId},
            ${serializedMethodName},
            ${serializedArguments}
          );
        `
      )
    )
  ).then(() => undefined)
}

export function createHtmlSceneGraphicsItemRenderer(
  itemId: string,
  template: LoadedGraphicsTemplate & { manifest: ParsedWindowTemplateManifest },
  dependencies: HtmlSceneRendererDependencies
): GraphicsItemRenderer {
  const entryPath = join(template.directoryPath, template.manifest.entryHtml)
  if (!existsSync(entryPath)) {
    throw new Error(
      `La plantilla ${template.manifest.id} no contiene ${template.manifest.entryHtml}`
    )
  }

  const entryUrl = pathToFileURL(entryPath).toString()
  const initialRenderSize = dependencies.resolveRenderSize()
  const nominalWidth = template.manifest.resolution.width
  const nominalHeight = template.manifest.resolution.height

  const htmlSceneTargets = ['preview', 'program', 'stack'] as const
  const getActiveOutputSceneTargets = (): GraphicsOverlayTarget[] => {
    const item = dependencies.findItem(itemId)
    if (!item) {
      return []
    }

    return dependencies.getOverlayTargetList(item)
  }

  const addItemToScene = (target: HtmlGraphicsSceneTarget): Promise<void> => {
    const scene = dependencies.getScene(target)
    const targetRenderSize =
      target === 'stack'
        ? {
            width: MIXER_MONITOR_GRAPHICS_WIDTH,
            height: MIXER_MONITOR_GRAPHICS_HEIGHT
          }
        : initialRenderSize
    scene.items.set(itemId, {
      itemId,
      templateName: template.manifest.name,
      entryUrl,
      nominalWidth,
      nominalHeight,
      frameRate: BACKGROUND_GRAPHICS_FPS
    })

    return dependencies.executeScript<void>(
      target,
      `
        (async () => {
          await window.__openmixScene.addItem({
            itemId: ${JSON.stringify(itemId)},
            entryUrl: ${JSON.stringify(entryUrl)},
            nominalWidth: ${JSON.stringify(nominalWidth)},
            nominalHeight: ${JSON.stringify(nominalHeight)},
            renderWidth: ${JSON.stringify(targetRenderSize.width)},
            renderHeight: ${JSON.stringify(targetRenderSize.height)}
          });
        })();
      `
    )
  }

  return {
    async load() {
      await Promise.all(htmlSceneTargets.map(addItemToScene))
      await dependencies.executeScript<void>(
        'stack',
        `
          (async () => {
            window.__openmixScene.setOutputState(${JSON.stringify(itemId)}, true, true);
            await window.__openmixScene.callTemplateMethod(${JSON.stringify(itemId)}, 'prepareIn', []);
            await window.__openmixScene.callTemplateMethod(${JSON.stringify(itemId)}, 'animateIn', []);
          })();
        `
      )
    },
    getWindow() {
      return null
    },
    isDisposed() {
      return htmlSceneTargets.every((target) => {
        const scene = dependencies.getExistingScene(target)
        return !scene || scene.window.isDestroyed() || !scene.items.has(itemId)
      })
    },
    dispose() {
      for (const target of htmlSceneTargets) {
        const scene = dependencies.getExistingScene(target)
        scene?.items.delete(itemId)
        void dependencies
          .executeScript<void>(
            target,
            `window.__openmixScene.removeItem(${JSON.stringify(itemId)});`
          )
          .catch(() => undefined)
      }
    },
    async updateField(fieldId, value) {
      await callHtmlSceneTemplateMethod(dependencies, itemId, 'updateField', [fieldId, value])
    },
    async setPlacement(placement) {
      await callHtmlSceneTemplateMethod(dependencies, itemId, 'setPlacement', [placement])
    },
    async setRuntimeState(runtimeState) {
      const item = dependencies.findItem(itemId)
      const stackPreviewVisible = item ? dependencies.isStackPreviewVisible(item) : false
      const stackPreviewAnimationFps = stackPreviewVisible
        ? Math.max(MIXER_MONITOR_GRAPHICS_FPS, runtimeState.animationFps)
        : 0
      const stackRuntimeState: GraphicsRendererRuntimeState = {
        ...runtimeState,
        isVisible: stackPreviewVisible,
        previewActive: false,
        stackPreviewActive: stackPreviewVisible,
        outputActive: false,
        animationFps: stackPreviewAnimationFps
      }

      const stackScene = dependencies.getScene('stack')
      const stackSceneItem = stackScene.items.get(itemId)
      if (stackSceneItem) {
        stackSceneItem.frameRate = stackPreviewVisible
          ? MIXER_MONITOR_GRAPHICS_FPS
          : BACKGROUND_GRAPHICS_FPS
        const stackMaxFrameRate = Math.max(
          BACKGROUND_GRAPHICS_FPS,
          ...Array.from(stackScene.items.values()).map((sceneItem) => sceneItem.frameRate)
        )
        stackScene.window.webContents.setFrameRate(stackMaxFrameRate)
      }

      await Promise.all(
        (['preview', 'program'] as const).map((target) =>
          dependencies.executeScript<void>(
            target,
            `
              (async () => {
                window.__openmixScene.setOutputState(
                  ${JSON.stringify(itemId)},
                  ${JSON.stringify(Boolean(runtimeState.isVisible))},
                  ${JSON.stringify(Boolean(item?.overlayTargets[target]))}
                );
                await window.__openmixScene.callTemplateMethod(
                  ${JSON.stringify(itemId)},
                  'setRuntimeState',
                  ${JSON.stringify([runtimeState])}
                );
              })();
            `
          )
        )
      )
      await dependencies.executeScript<void>(
        'stack',
        `
          (async () => {
            window.__openmixScene.setOutputState(
              ${JSON.stringify(itemId)},
              ${JSON.stringify(stackPreviewVisible)},
              true
            );
            await window.__openmixScene.callTemplateMethod(
              ${JSON.stringify(itemId)},
              'setRuntimeState',
              ${JSON.stringify([stackRuntimeState])}
            );
          })();
        `
      )
    },
    async prepareIn() {
      await callHtmlSceneTemplateMethod(
        dependencies,
        itemId,
        'prepareIn',
        [],
        getActiveOutputSceneTargets()
      )
    },
    async preparePreview() {
      await callHtmlSceneTemplateMethod(
        dependencies,
        itemId,
        'preparePreview',
        [],
        getActiveOutputSceneTargets()
      )
    },
    async animateIn() {
      await callHtmlSceneTemplateMethod(
        dependencies,
        itemId,
        'animateIn',
        [],
        getActiveOutputSceneTargets()
      )
    },
    async animateOut() {
      await callHtmlSceneTemplateMethod(
        dependencies,
        itemId,
        'animateOut',
        [],
        getActiveOutputSceneTargets()
      )
    },
    setRenderConfig(width, height, zoomFactor) {
      void zoomFactor
      for (const target of htmlSceneTargets) {
        const scene = dependencies.getScene(target)
        const targetRenderSize =
          target === 'stack'
            ? {
                width: MIXER_MONITOR_GRAPHICS_WIDTH,
                height: MIXER_MONITOR_GRAPHICS_HEIGHT
              }
            : { width, height }
        scene.items.set(itemId, {
          itemId,
          templateName: template.manifest.name,
          entryUrl,
          nominalWidth,
          nominalHeight,
          frameRate: BACKGROUND_GRAPHICS_FPS
        })
        void dependencies
          .executeScript<void>(
            target,
            `
              window.__openmixScene.setRenderConfig(
                ${JSON.stringify(itemId)},
                ${JSON.stringify(targetRenderSize.width)},
                ${JSON.stringify(targetRenderSize.height)},
                ${JSON.stringify(nominalWidth)},
                ${JSON.stringify(nominalHeight)}
              );
            `
          )
          .catch(() => undefined)
      }
    },
    setFrameRate(frameRate) {
      const item = dependencies.findItem(itemId)
      for (const target of htmlSceneTargets) {
        const scene = dependencies.getScene(target)
        const sceneItem = scene.items.get(itemId)
        if (sceneItem) {
          sceneItem.frameRate =
            target === 'stack'
              ? item && dependencies.isStackPreviewVisible(item)
                ? MIXER_MONITOR_GRAPHICS_FPS
                : BACKGROUND_GRAPHICS_FPS
              : frameRate
        }
        const maxFrameRate = Math.max(
          BACKGROUND_GRAPHICS_FPS,
          ...Array.from(scene.items.values()).map((item) => item.frameRate)
        )
        scene.window.webContents.setFrameRate(maxFrameRate)
      }
    }
  }
}
