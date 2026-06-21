/**
 * graphics-contracts.ts — Tipos IPC del módulo de grafismo.
 *
 * Estos contratos describen el vocabulario compartido entre Main y Renderer
 * para la Fase 4: descubrimiento de plantillas, carga de la plantilla activa,
 * edición de campos y estado básico del motor de preview.
 */

/** Categorías funcionales de plantillas soportadas por OpenMix-CG. */
export type GraphicsTemplateCategory =
  | 'lower-third'
  | 'full-screen'
  | 'scoreboard'
  | 'clock'
  | 'ticker'
  | 'bug'
  | 'social'

/** Tipo de dato editable dentro de una plantilla. */
export type GraphicsFieldType = 'text' | 'number' | 'image'

/** Formato físico de la plantilla. */
export type GraphicsTemplateFormat = 'html' | 'lottie' | 'svg' | 'native'

/** Resolución nominal de la plantilla. */
export interface GraphicsResolution {
  width: number
  height: number
}

/** Desplazamiento aplicado al grafismo dentro de su lienzo nominal. */
export interface GraphicsPlacement {
  offsetX: number
  offsetY: number
}

/** Ruteo del overlay hacia las salidas monitorizadas del mixer. */
export interface GraphicsOverlayTargets {
  preview: boolean
  program: boolean
}

/** Campo editable expuesto al operador desde la UI. */
export interface GraphicsTemplateField {
  id: string
  label: string
  type: GraphicsFieldType
  defaultValue: string
  maxLength?: number
}

/** Información resumida de una plantilla para listados y selectores. */
export interface GraphicsTemplateSummary {
  id: string
  name: string
  category: GraphicsTemplateCategory
  format: GraphicsTemplateFormat
  version: string
  previewImageDataUrl?: string | null
}

/** Manifest completo de una plantilla en disco. */
export interface GraphicsTemplateManifest extends GraphicsTemplateSummary {
  resolution: GraphicsResolution
  entryHtml?: string
  rendererId?: string
  fields: GraphicsTemplateField[]
}

/** Instancia cargada de una plantilla dentro de la pila de grafismo. */
export interface GraphicsItemState {
  itemId: string
  templateId: string
  templateName: string
  category: GraphicsTemplateCategory
  format: GraphicsTemplateFormat
  version: string
  resolution: GraphicsResolution
  fields: GraphicsTemplateField[]
  currentValues: Record<string, string>
  isVisible: boolean
  previewReady: boolean
  placement: GraphicsPlacement
  overlayTargets: GraphicsOverlayTargets
}

/** Resultado de añadir una nueva plantilla a la pila de grafismo. */
export interface GraphicsAddTemplateResult {
  item: GraphicsItemState
  state: GraphicsState
}

/** Rectángulo mínimo que contiene píxeles no transparentes dentro de un frame. */
export interface GraphicsFrameBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Frame de preview del motor de grafismo ya adaptado para la UI. */
export interface GraphicsPreviewFrame {
  width: number
  height: number
  data: Uint8Array
  alphaBounds?: GraphicsFrameBounds | null
}

/** Configuración del preview que consume la UI en cada vista. */
export interface GraphicsPreviewOutputConfig {
  enabled: boolean
  width: number
  height: number
  maxFps: number
}

/** Métricas de diagnóstico del paint offscreen de una instancia de grafismo. */
export interface GraphicsPaintDiagnostics {
  totalPaintCount: number
  fullFramePaintCount: number
  averageDirtyCoveragePercent: number
  maxDirtyCoveragePercent: number
  lastDirtyCoveragePercent: number
  fullFramePaintRatePercent: number
  frameWidth: number
  frameHeight: number
}

/** Diagnóstico runtime agregado del motor de grafismo. */
export interface GraphicsDiagnostics {
  aggregate: GraphicsPaintDiagnostics
  selectedItem: GraphicsPaintDiagnostics | null
}

/** Estado del motor de grafismo para una pila de overlays simultáneos. */
export interface GraphicsState {
  selectedItemId: string | null
  items: GraphicsItemState[]
  previewReady: boolean
  visibleItemCount: number
  diagnostics: GraphicsDiagnostics
}