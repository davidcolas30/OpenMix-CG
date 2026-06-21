import { app } from 'electron'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  GraphicsTemplateCategory,
  GraphicsTemplateField,
  GraphicsTemplateManifest,
  GraphicsTemplateSummary
} from '../../../shared/ipc/graphics-contracts'
import type {
  NativeTickerAnimationsConfig,
  NativeTickerLayoutConfig,
  NativeTickerStyleConfig
} from '../nativeTickerRenderer'

export type WindowBackedGraphicsTemplateFormat = 'html' | 'lottie' | 'svg'

export interface ParsedWindowTemplateManifest extends GraphicsTemplateManifest {
  format: WindowBackedGraphicsTemplateFormat
  entryHtml: string
}

export interface ParsedNativeTickerTemplateManifest extends GraphicsTemplateManifest {
  format: 'native'
  rendererId: 'ticker-v1'
  layout: NativeTickerLayoutConfig
  style: NativeTickerStyleConfig
  animations?: NativeTickerAnimationsConfig
}

export type ParsedGraphicsTemplateManifest =
  | ParsedWindowTemplateManifest
  | ParsedNativeTickerTemplateManifest

export interface LoadedGraphicsTemplate {
  manifest: ParsedGraphicsTemplateManifest
  directoryPath: string
}

const TEMPLATE_PREVIEW_CANDIDATES = [
  'preview.svg',
  'preview.png',
  'preview.jpg',
  'preview.jpeg',
  'preview.webp'
] as const

const TEMPLATE_PREVIEW_MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

export function getGraphicsTemplatesRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'graphics-templates')
    : join(app.getAppPath(), 'resources', 'graphics-templates')
}

function parseTemplateField(rawField: unknown, templateId: string): GraphicsTemplateField {
  if (typeof rawField !== 'object' || rawField === null) {
    throw new Error(`Campo inválido en la plantilla ${templateId}`)
  }

  const candidate = rawField as Record<string, unknown>

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    throw new Error(`La plantilla ${templateId} contiene un campo sin id válido`)
  }

  if (typeof candidate.label !== 'string' || candidate.label.trim().length === 0) {
    throw new Error(`El campo ${candidate.id} de ${templateId} no tiene label válido`)
  }

  if (candidate.type !== 'text' && candidate.type !== 'number' && candidate.type !== 'image') {
    throw new Error(`El campo ${candidate.id} de ${templateId} usa un tipo no soportado`)
  }

  if (typeof candidate.defaultValue !== 'string') {
    throw new Error(`El campo ${candidate.id} de ${templateId} debe definir defaultValue`)
  }

  if (candidate.maxLength !== undefined && typeof candidate.maxLength !== 'number') {
    throw new Error(`El campo ${candidate.id} de ${templateId} tiene maxLength inválido`)
  }

  return {
    id: candidate.id,
    label: candidate.label,
    type: candidate.type,
    defaultValue: candidate.defaultValue,
    maxLength: candidate.maxLength
  }
}

function requireManifestRecord(rawValue: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
    throw new Error(errorMessage)
  }

  return rawValue as Record<string, unknown>
}

function requireManifestString(
  rawRecord: Record<string, unknown>,
  key: string,
  errorMessage: string
): string {
  const value = rawRecord[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(errorMessage)
  }

  return value
}

function requireManifestNumber(
  rawRecord: Record<string, unknown>,
  key: string,
  errorMessage: string
): number {
  const value = rawRecord[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(errorMessage)
  }

  return value
}

function readOptionalManifestNumber(
  rawRecord: Record<string, unknown>,
  key: string,
  errorMessage: string
): number | undefined {
  const value = rawRecord[key]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(errorMessage)
  }

  return value
}

function readOptionalManifestString(
  rawRecord: Record<string, unknown>,
  key: string,
  errorMessage: string
): string | undefined {
  const value = rawRecord[key]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(errorMessage)
  }

  return value
}

function parseNativeTickerLayout(
  rawLayout: unknown,
  manifestPath: string
): NativeTickerLayoutConfig {
  const layout = requireManifestRecord(
    rawLayout,
    `Manifest inválido en ${manifestPath}: falta layout`
  )

  return {
    left: requireManifestNumber(
      layout,
      'left',
      `Manifest inválido en ${manifestPath}: layout.left inválido`
    ),
    bottom: requireManifestNumber(
      layout,
      'bottom',
      `Manifest inválido en ${manifestPath}: layout.bottom inválido`
    ),
    width: requireManifestNumber(
      layout,
      'width',
      `Manifest inválido en ${manifestPath}: layout.width inválido`
    ),
    height: requireManifestNumber(
      layout,
      'height',
      `Manifest inválido en ${manifestPath}: layout.height inválido`
    ),
    labelWidth: requireManifestNumber(
      layout,
      'labelWidth',
      `Manifest inválido en ${manifestPath}: layout.labelWidth inválido`
    ),
    bodyPaddingY: requireManifestNumber(
      layout,
      'bodyPaddingY',
      `Manifest inválido en ${manifestPath}: layout.bodyPaddingY inválido`
    ),
    copyGap: requireManifestNumber(
      layout,
      'copyGap',
      `Manifest inválido en ${manifestPath}: layout.copyGap inválido`
    )
  }
}

function parseNativeTickerStyle(rawStyle: unknown, manifestPath: string): NativeTickerStyleConfig {
  const style = requireManifestRecord(rawStyle, `Manifest inválido en ${manifestPath}: falta style`)

  return {
    labelBackground: requireManifestString(
      style,
      'labelBackground',
      `Manifest inválido en ${manifestPath}: style.labelBackground inválido`
    ),
    labelBackgroundAccent: readOptionalManifestString(
      style,
      'labelBackgroundAccent',
      `Manifest inválido en ${manifestPath}: style.labelBackgroundAccent inválido`
    ),
    bodyBackground: requireManifestString(
      style,
      'bodyBackground',
      `Manifest inválido en ${manifestPath}: style.bodyBackground inválido`
    ),
    bodyBackgroundAccent: readOptionalManifestString(
      style,
      'bodyBackgroundAccent',
      `Manifest inválido en ${manifestPath}: style.bodyBackgroundAccent inválido`
    ),
    borderColor: readOptionalManifestString(
      style,
      'borderColor',
      `Manifest inválido en ${manifestPath}: style.borderColor inválido`
    ),
    labelTextColor: requireManifestString(
      style,
      'labelTextColor',
      `Manifest inválido en ${manifestPath}: style.labelTextColor inválido`
    ),
    bodyTextColor: requireManifestString(
      style,
      'bodyTextColor',
      `Manifest inválido en ${manifestPath}: style.bodyTextColor inválido`
    ),
    fontFamily: requireManifestString(
      style,
      'fontFamily',
      `Manifest inválido en ${manifestPath}: style.fontFamily inválido`
    ),
    labelFontSize: requireManifestNumber(
      style,
      'labelFontSize',
      `Manifest inválido en ${manifestPath}: style.labelFontSize inválido`
    ),
    bodyFontSize: requireManifestNumber(
      style,
      'bodyFontSize',
      `Manifest inválido en ${manifestPath}: style.bodyFontSize inválido`
    ),
    labelFontWeight: readOptionalManifestNumber(
      style,
      'labelFontWeight',
      `Manifest inválido en ${manifestPath}: style.labelFontWeight inválido`
    ),
    bodyFontWeight: readOptionalManifestNumber(
      style,
      'bodyFontWeight',
      `Manifest inválido en ${manifestPath}: style.bodyFontWeight inválido`
    ),
    labelLetterSpacingEm: readOptionalManifestNumber(
      style,
      'labelLetterSpacingEm',
      `Manifest inválido en ${manifestPath}: style.labelLetterSpacingEm inválido`
    ),
    bodyLetterSpacingEm: readOptionalManifestNumber(
      style,
      'bodyLetterSpacingEm',
      `Manifest inválido en ${manifestPath}: style.bodyLetterSpacingEm inválido`
    ),
    cornerRadius: readOptionalManifestNumber(
      style,
      'cornerRadius',
      `Manifest inválido en ${manifestPath}: style.cornerRadius inválido`
    )
  }
}

function parseNativeTickerAnimations(
  rawAnimations: unknown,
  manifestPath: string
): NativeTickerAnimationsConfig | undefined {
  if (rawAnimations === undefined) {
    return undefined
  }

  const animations = requireManifestRecord(
    rawAnimations,
    `Manifest inválido en ${manifestPath}: animations inválido`
  )

  const parseAnimationEntry = (
    rawAnimation: unknown,
    animationKey: 'in' | 'out'
  ): NativeTickerAnimationsConfig['in'] | NativeTickerAnimationsConfig['out'] => {
    if (rawAnimation === undefined) {
      return undefined
    }

    const animation = requireManifestRecord(
      rawAnimation,
      `Manifest inválido en ${manifestPath}: animations.${animationKey} inválido`
    )

    return {
      durationMs: requireManifestNumber(
        animation,
        'durationMs',
        `Manifest inválido en ${manifestPath}: animations.${animationKey}.durationMs inválido`
      ),
      offsetYPx: requireManifestNumber(
        animation,
        'offsetYPx',
        `Manifest inválido en ${manifestPath}: animations.${animationKey}.offsetYPx inválido`
      )
    }
  }

  return {
    in: parseAnimationEntry(animations.in, 'in'),
    out: parseAnimationEntry(animations.out, 'out')
  }
}

function parseTemplateManifest(directoryPath: string): ParsedGraphicsTemplateManifest {
  const manifestPath = join(directoryPath, 'manifest.json')
  const rawJson = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>

  if (typeof rawJson.id !== 'string' || rawJson.id.trim().length === 0) {
    throw new Error(`Manifest inválido en ${manifestPath}: falta id`)
  }

  if (typeof rawJson.name !== 'string' || rawJson.name.trim().length === 0) {
    throw new Error(`Manifest inválido en ${manifestPath}: falta name`)
  }

  if (
    rawJson.category !== 'lower-third' &&
    rawJson.category !== 'full-screen' &&
    rawJson.category !== 'scoreboard' &&
    rawJson.category !== 'clock' &&
    rawJson.category !== 'ticker' &&
    rawJson.category !== 'bug' &&
    rawJson.category !== 'social'
  ) {
    throw new Error(`Manifest inválido en ${manifestPath}: category no soportada`)
  }

  if (
    rawJson.format !== 'html' &&
    rawJson.format !== 'lottie' &&
    rawJson.format !== 'svg' &&
    rawJson.format !== 'native'
  ) {
    throw new Error(`Manifest inválido en ${manifestPath}: format no soportado`)
  }

  if (typeof rawJson.version !== 'string' || rawJson.version.trim().length === 0) {
    throw new Error(`Manifest inválido en ${manifestPath}: falta version`)
  }

  const resolution = rawJson.resolution
  if (typeof resolution !== 'object' || resolution === null) {
    throw new Error(`Manifest inválido en ${manifestPath}: falta resolution`)
  }

  const parsedResolution = resolution as Record<string, unknown>
  if (typeof parsedResolution.width !== 'number' || typeof parsedResolution.height !== 'number') {
    throw new Error(`Manifest inválido en ${manifestPath}: resolution debe ser numérica`)
  }

  if (!Array.isArray(rawJson.fields)) {
    throw new Error(`Manifest inválido en ${manifestPath}: fields debe ser un array`)
  }

  const baseManifest = {
    id: rawJson.id as string,
    name: rawJson.name as string,
    category: rawJson.category as GraphicsTemplateCategory,
    version: rawJson.version as string,
    resolution: {
      width: parsedResolution.width,
      height: parsedResolution.height
    },
    fields: rawJson.fields.map((field) => parseTemplateField(field, rawJson.id as string))
  }

  if (rawJson.format === 'native') {
    if (rawJson.rendererId !== 'ticker-v1') {
      throw new Error(`Manifest inválido en ${manifestPath}: rendererId no soportado`)
    }

    return {
      ...baseManifest,
      format: 'native',
      rendererId: 'ticker-v1',
      layout: parseNativeTickerLayout(rawJson.layout, manifestPath),
      style: parseNativeTickerStyle(rawJson.style, manifestPath),
      animations: parseNativeTickerAnimations(rawJson.animations, manifestPath)
    }
  }

  if (typeof rawJson.entryHtml !== 'string' || rawJson.entryHtml.trim().length === 0) {
    throw new Error(`Manifest inválido en ${manifestPath}: falta entryHtml`)
  }

  return {
    ...baseManifest,
    format: rawJson.format as WindowBackedGraphicsTemplateFormat,
    entryHtml: rawJson.entryHtml,
    rendererId: undefined
  }
}

function readTemplatePreviewDataUrl(directoryPath: string): string | null {
  for (const candidateFileName of TEMPLATE_PREVIEW_CANDIDATES) {
    const candidatePath = join(directoryPath, candidateFileName)

    if (!existsSync(candidatePath)) {
      continue
    }

    const extension = candidateFileName.slice(candidateFileName.lastIndexOf('.')).toLowerCase()
    const mimeType = TEMPLATE_PREVIEW_MIME_TYPES[extension]

    if (!mimeType) {
      continue
    }

    const fileBuffer = readFileSync(candidatePath)
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`
  }

  return null
}

export function buildTemplateSummary(
  manifest: GraphicsTemplateManifest,
  directoryPath: string
): GraphicsTemplateSummary {
  return {
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    format: manifest.format,
    version: manifest.version,
    previewImageDataUrl: readTemplatePreviewDataUrl(directoryPath)
  }
}

export function discoverTemplates(): LoadedGraphicsTemplate[] {
  const templatesRoot = getGraphicsTemplatesRoot()

  if (!existsSync(templatesRoot)) {
    return []
  }

  return readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const directoryPath = join(templatesRoot, entry.name)
      const manifestPath = join(directoryPath, 'manifest.json')

      if (!existsSync(manifestPath)) {
        return []
      }

      return [
        {
          manifest: parseTemplateManifest(directoryPath),
          directoryPath
        }
      ]
    })
}
