import { useCallback, useMemo, useRef } from 'react'
import type {
  GraphicsOverlayTargets,
  GraphicsPlacement,
  GraphicsPreviewFrame,
  GraphicsState,
  GraphicsTemplateSummary
} from '../../../shared/ipc/graphics-contracts'
import VideoCanvas from './VideoCanvas'
import TransientStatusToast from './TransientStatusToast'

type GraphicsPreviewBackground = 'black' | 'white'
type GraphicsPanelMode = 'sidebar' | 'workspace'

interface GraphicsPanelProps {
  mode?: GraphicsPanelMode
  templates: GraphicsTemplateSummary[]
  graphicsState: GraphicsState
  previewBackground: GraphicsPreviewBackground
  statusMessage: string | null
  onSelectPreviewBackground: (background: GraphicsPreviewBackground) => void
  onAddTemplate: (templateId: string) => void
  onSelectItem: (itemId: string) => void
  onRemoveItem: (itemId: string) => void
  onUpdateField: (itemId: string, fieldId: string, value: string) => void
  onSetPlacement: (itemId: string, placement: GraphicsPlacement) => void
  onSetOverlayTargets: (itemId: string, targets: GraphicsOverlayTargets) => void
  onShowItem: (itemId: string) => void
  onHideItem: (itemId: string) => void
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  basePlacement: GraphicsPlacement
  lastPlacement: GraphicsPlacement
}

export default function GraphicsPanel({
  mode = 'sidebar',
  templates,
  graphicsState,
  previewBackground,
  statusMessage,
  onSelectPreviewBackground,
  onAddTemplate,
  onSelectItem,
  onRemoveItem,
  onUpdateField,
  onSetPlacement,
  onSetOverlayTargets,
  onShowItem,
  onHideItem
}: GraphicsPanelProps): React.JSX.Element {
  const dragStateRef = useRef<DragState | null>(null)
  const isWorkspaceMode = mode === 'workspace'
  const previewDimensions = isWorkspaceMode
    ? { width: 480, height: 270 }
    : { width: 344, height: 194 }

  const subscribePreview = useCallback(
    (callback: (frame: GraphicsPreviewFrame) => void) =>
      window.openMix.graphics.onPreviewFrame(callback),
    []
  )

  const selectedItem = useMemo(
    () => graphicsState.items.find((item) => item.itemId === graphicsState.selectedItemId) ?? null,
    [graphicsState.items, graphicsState.selectedItemId]
  )

  const previewToneIsLight = previewBackground === 'white'
  const previewBorderColor = graphicsState.visibleItemCount > 0 ? '#49a5b8' : '#5d6778'
  const selectedDiagnostics = graphicsState.diagnostics.selectedItem
  const aggregateDiagnostics = graphicsState.diagnostics.aggregate
  const activeOutputs = selectedItem
    ? [
        selectedItem.overlayTargets.preview ? 'PVW' : null,
        selectedItem.overlayTargets.program ? 'PGM' : null
      ].filter(Boolean)
    : []

  const clearDragState = useCallback((surface: HTMLDivElement | null, pointerId?: number) => {
    if (surface && pointerId !== undefined && surface.hasPointerCapture(pointerId)) {
      surface.releasePointerCapture(pointerId)
    }

    dragStateRef.current = null
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!selectedItem || !graphicsState.previewReady) {
        return
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        basePlacement: selectedItem.placement,
        lastPlacement: selectedItem.placement
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [graphicsState.previewReady, selectedItem]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId || !selectedItem) {
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return
      }

      const deltaX =
        ((event.clientX - dragState.startX) / rect.width) * selectedItem.resolution.width
      const deltaY =
        ((event.clientY - dragState.startY) / rect.height) * selectedItem.resolution.height

      const nextPlacement = {
        offsetX: Math.round(dragState.basePlacement.offsetX + deltaX),
        offsetY: Math.round(dragState.basePlacement.offsetY + deltaY)
      }

      if (
        nextPlacement.offsetX === dragState.lastPlacement.offsetX &&
        nextPlacement.offsetY === dragState.lastPlacement.offsetY
      ) {
        return
      }

      dragState.lastPlacement = nextPlacement
      onSetPlacement(selectedItem.itemId, nextPlacement)
    },
    [onSetPlacement, selectedItem]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      clearDragState(event.currentTarget, event.pointerId)
    },
    [clearDragState]
  )

  return (
    <aside style={panelStyle(mode)}>
      <div style={panelHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>Grafismo</p>
          <h2 style={panelTitleStyle}>Plantillas y overlays</h2>
        </div>
        <div style={statusPillStyle(graphicsState.visibleItemCount > 0)}>
          {graphicsState.visibleItemCount > 0
            ? `${graphicsState.visibleItemCount} ON AIR`
            : graphicsState.items.length > 0
              ? 'PRESET'
              : 'VACÍO'}
        </div>
      </div>

      <TransientStatusToast message={statusMessage} />

      <div
        className={isWorkspaceMode ? 'openmix-graphics-workspace' : undefined}
        style={contentLayoutStyle(mode)}
      >
        <div style={contentColumnStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionTitleStyle}>Preview de pila</span>
              <span style={sectionMetaStyle}>
                {selectedItem
                  ? `${selectedItem.templateName}${activeOutputs.length > 0 ? ` → ${activeOutputs.join(' + ')}` : ' · preset'}`
                  : 'Sin selección'}
              </span>
            </div>

            <div
              style={{
                ...previewSurfaceStyle,
                width: previewDimensions.width + 4,
                height: previewDimensions.height + 4,
                backgroundColor: previewToneIsLight ? '#edf2f7' : '#05070a',
                cursor: selectedItem ? 'grab' : 'default'
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <VideoCanvas
                width={previewDimensions.width}
                height={previewDimensions.height}
                onSubscribe={subscribePreview}
                label={graphicsState.items.length > 0 ? 'GFX STACK' : 'SIN GFX'}
                borderColor={previewBorderColor}
                backgroundColor={previewToneIsLight ? '#edf2f7' : '#05070a'}
                labelColor={previewToneIsLight ? '#18202c' : '#f8fafc'}
                fpsColor={previewToneIsLight ? '#1b4332' : '#8de3a7'}
                showFps={graphicsState.previewReady}
              />
              <div style={safeAreaStyle} />
            </div>

            <div style={previewToolbarStyle}>
              <div style={toggleRowStyle}>
                <button
                  className="openmix-control-button"
                  onClick={() => onSelectPreviewBackground('black')}
                  style={miniToggleStyle(previewBackground === 'black')}
                >
                  Fondo negro
                </button>
                <button
                  className="openmix-control-button"
                  onClick={() => onSelectPreviewBackground('white')}
                  style={miniToggleStyle(previewBackground === 'white')}
                >
                  Fondo blanco
                </button>
              </div>
              <button
                className="openmix-control-button"
                onClick={() =>
                  selectedItem && onSetPlacement(selectedItem.itemId, { offsetX: 0, offsetY: 0 })
                }
                disabled={!selectedItem}
                style={ghostButtonStyle}
              >
                Centrar seleccionada
              </button>
            </div>

            <div style={placementReadoutStyle}>
              {selectedItem
                ? `X ${selectedItem.placement.offsetX}px · Y ${selectedItem.placement.offsetY}px`
                : 'Selecciona un grafismo para moverlo'}
            </div>

            <div style={diagnosticsCardStyle}>
              <div style={sectionHeaderStyle}>
                <span style={sectionTitleStyle}>Rendimiento de render</span>
                <span style={sectionMetaStyle}>
                  {selectedItem ? 'Instancia seleccionada' : 'Agregado'}
                </span>
              </div>

              <div style={diagnosticsGridStyle}>
                <div style={diagnosticMetricStyle}>
                  <span style={diagnosticLabelStyle}>Paints</span>
                  <strong style={diagnosticValueStyle}>
                    {(selectedDiagnostics ?? aggregateDiagnostics).totalPaintCount}
                  </strong>
                </div>
                <div style={diagnosticMetricStyle}>
                  <span style={diagnosticLabelStyle}>Área dirty media</span>
                  <strong style={diagnosticValueStyle}>
                    {(selectedDiagnostics ?? aggregateDiagnostics).averageDirtyCoveragePercent}%
                  </strong>
                </div>
                <div style={diagnosticMetricStyle}>
                  <span style={diagnosticLabelStyle}>Dirty último</span>
                  <strong style={diagnosticValueStyle}>
                    {(selectedDiagnostics ?? aggregateDiagnostics).lastDirtyCoveragePercent}%
                  </strong>
                </div>
                <div style={diagnosticMetricStyle}>
                  <span style={diagnosticLabelStyle}>Paints casi full-frame</span>
                  <strong style={diagnosticValueStyle}>
                    {(selectedDiagnostics ?? aggregateDiagnostics).fullFramePaintRatePercent}%
                  </strong>
                </div>
              </div>

              <div style={diagnosticsFootnoteStyle}>
                {selectedDiagnostics
                  ? `Raster ${selectedDiagnostics.frameWidth}x${selectedDiagnostics.frameHeight} · ${selectedDiagnostics.fullFramePaintCount} paints casi full-frame`
                  : `Raster agregado ${aggregateDiagnostics.frameWidth}x${aggregateDiagnostics.frameHeight} · ${aggregateDiagnostics.fullFramePaintCount} paints casi full-frame`}
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionTitleStyle}>Instancia seleccionada</span>
              <span style={sectionMetaStyle}>
                {selectedItem ? selectedItem.templateName : 'Sin selección'}
              </span>
            </div>

            {!selectedItem ? (
              <div style={emptyStateStyle}>
                Añade una plantilla y selecciona una instancia para editarla, enrutarla o llevarla
                al aire.
              </div>
            ) : (
              <>
                <div style={selectedItemSummaryStyle(selectedItem.isVisible)}>
                  <div>
                    <div style={selectedItemNameStyle}>{selectedItem.templateName}</div>
                    <div style={selectedItemMetaStyle}>
                      {selectedItem.category} · {selectedItem.format} · {selectedItem.itemId}
                    </div>
                  </div>
                  <div style={selectedItemBadgeStyle(selectedItem.isVisible)}>
                    {selectedItem.isVisible ? 'ON AIR' : 'PRESET'}
                  </div>
                </div>

                <div style={checkboxListStyle}>
                  <label style={checkboxItemStyle}>
                    <input
                      className="openmix-input"
                      type="checkbox"
                      checked={selectedItem.overlayTargets.preview}
                      onChange={(event) =>
                        onSetOverlayTargets(selectedItem.itemId, {
                          ...selectedItem.overlayTargets,
                          preview: event.target.checked
                        })
                      }
                    />
                    Superponer sobre Preview
                  </label>
                  <label style={checkboxItemStyle}>
                    <input
                      className="openmix-input"
                      type="checkbox"
                      checked={selectedItem.overlayTargets.program}
                      onChange={(event) =>
                        onSetOverlayTargets(selectedItem.itemId, {
                          ...selectedItem.overlayTargets,
                          program: event.target.checked
                        })
                      }
                    />
                    Superponer sobre Program
                  </label>
                </div>

                <div style={toggleRowStyle}>
                  <button
                    className="openmix-control-button"
                    onClick={() => onShowItem(selectedItem.itemId)}
                    style={primaryButtonStyle}
                  >
                    Subir overlay
                  </button>
                  <button
                    className="openmix-control-button"
                    onClick={() => onHideItem(selectedItem.itemId)}
                    style={ghostButtonStyle}
                  >
                    Bajar overlay
                  </button>
                  <button
                    className="openmix-control-button"
                    onClick={() => onRemoveItem(selectedItem.itemId)}
                    style={dangerButtonStyle}
                  >
                    Quitar instancia
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <div style={contentColumnStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionTitleStyle}>Plantillas</span>
              <span style={sectionMetaStyle}>{templates.length} disponibles</span>
            </div>

            <div style={templateListStyle}>
              {templates.map((template) => {
                const usageCount = graphicsState.items.filter(
                  (item) => item.templateId === template.id
                ).length

                return (
                  <div
                    className="openmix-interactive-row"
                    key={template.id}
                    style={templateCardStyle(usageCount > 0)}
                  >
                    <div style={templateOverviewStyle}>
                      <div style={templatePreviewFrameStyle}>
                        {template.previewImageDataUrl ? (
                          <img
                            src={template.previewImageDataUrl}
                            alt={`Miniatura de ${template.name}`}
                            style={templatePreviewImageStyle}
                          />
                        ) : (
                          <div style={templatePreviewPlaceholderStyle}>{template.category}</div>
                        )}
                      </div>
                      <div>
                        <div style={templateNameStyle}>{template.name}</div>
                        <div style={templateMetaStyle}>
                          {template.category} · {template.format}
                          {usageCount > 0 ? ` · ${usageCount} en pila` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={templateActionsStyle}>
                      <button
                        className="openmix-control-button"
                        onClick={() => onAddTemplate(template.id)}
                        style={primaryButtonStyle}
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionTitleStyle}>Pila de grafismos</span>
              <span style={sectionMetaStyle}>{graphicsState.items.length} cargados</span>
            </div>

            {graphicsState.items.length === 0 ? (
              <div style={emptyStateStyle}>Todavía no hay overlays cargados en la pila.</div>
            ) : (
              <div style={stackListStyle}>
                {graphicsState.items.map((item, index) => {
                  const isSelected = item.itemId === graphicsState.selectedItemId
                  const routedOutputs = [
                    item.overlayTargets.preview ? 'PVW' : null,
                    item.overlayTargets.program ? 'PGM' : null
                  ].filter(Boolean)

                  return (
                    <div
                      className="openmix-interactive-row"
                      key={item.itemId}
                      style={stackItemCardStyle(isSelected, item.isVisible)}
                    >
                      <div style={stackItemHeaderStyle}>
                        <div>
                          <div style={stackItemNameStyle}>
                            {index + 1}. {item.templateName}
                          </div>
                          <div style={stackItemMetaStyle}>
                            {item.category} ·{' '}
                            {routedOutputs.length > 0 ? routedOutputs.join(' + ') : 'Sin salida'}
                          </div>
                        </div>
                        <div style={stackItemBadgeStyle(item.isVisible)}>
                          {item.isVisible ? 'ON AIR' : 'PRESET'}
                        </div>
                      </div>

                      <div style={stackItemActionsStyle}>
                        <button
                          className="openmix-control-button"
                          onClick={() => onSelectItem(item.itemId)}
                          style={isSelected ? activeTemplateButtonStyle : ghostButtonStyle}
                        >
                          {isSelected ? 'Editando' : 'Editar'}
                        </button>
                        <button
                          className="openmix-control-button"
                          onClick={() =>
                            item.isVisible ? onHideItem(item.itemId) : onShowItem(item.itemId)
                          }
                          style={item.isVisible ? ghostButtonStyle : primaryButtonStyle}
                        >
                          {item.isVisible ? 'Bajar' : 'Subir'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section style={fieldsSectionStyle(isWorkspaceMode, selectedItem?.fields.length ?? 0)}>
            <div style={sectionHeaderStyle}>
              <span style={sectionTitleStyle}>Campos</span>
              <span style={sectionMetaStyle}>
                {selectedItem ? `${selectedItem.fields.length} editables` : 'Sin selección'}
              </span>
            </div>

            {!selectedItem ? (
              <div style={emptyStateStyle}>
                Selecciona una instancia de la pila para editar sus campos.
              </div>
            ) : selectedItem.fields.length === 0 ? (
              <div style={emptyStateStyle}>
                La plantilla seleccionada no expone campos editables.
              </div>
            ) : (
              <div style={fieldListStyle}>
                {selectedItem.fields.map((field) => (
                  <label key={`${selectedItem.itemId}:${field.id}`} style={fieldRowStyle}>
                    <span style={fieldLabelStyle}>{field.label}</span>
                    <input
                      className="openmix-input"
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={selectedItem.currentValues[field.id] ?? field.defaultValue}
                      maxLength={field.maxLength}
                      onChange={(event) =>
                        onUpdateField(selectedItem.itemId, field.id, event.target.value)
                      }
                      style={fieldInputStyle}
                    />
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </aside>
  )
}

function panelStyle(mode: GraphicsPanelMode): React.CSSProperties {
  return {
    width: '100%',
    position: 'relative',
    maxWidth: mode === 'workspace' ? undefined : '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: mode === 'workspace' ? '16px' : '14px',
    borderRadius: '10px',
    background: 'linear-gradient(180deg, rgba(12, 18, 28, 0.96), rgba(18, 26, 38, 0.94))',
    border: '1px solid rgba(124, 145, 173, 0.18)',
    boxShadow: '0 16px 36px rgba(2, 8, 23, 0.32)',
    minHeight: 0,
    minWidth: 0,
    overflow: mode === 'workspace' ? 'visible' : 'hidden',
    boxSizing: 'border-box',
    margin: 0,
    alignSelf: 'stretch'
  }
}

function contentLayoutStyle(mode: GraphicsPanelMode): React.CSSProperties {
  if (mode === 'workspace') {
    return {
      display: 'grid',
      gap: '12px',
      minHeight: 0,
      alignItems: 'start'
    }
  }

  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: 0,
    overflow: 'hidden'
  }
}

const contentColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minHeight: 0
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7dd3fc'
}

const panelTitleStyle: React.CSSProperties = {
  margin: '2px 0 0',
  fontSize: '19px',
  color: '#f8fafc'
}

function statusPillStyle(hasOnAirItems: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: '999px',
    backgroundColor: hasOnAirItems ? 'rgba(73, 165, 184, 0.2)' : 'rgba(100, 116, 139, 0.18)',
    border: `1px solid ${hasOnAirItems ? 'rgba(73, 165, 184, 0.48)' : 'rgba(100, 116, 139, 0.3)'}`,
    color: hasOnAirItems ? '#a5f3fc' : '#cbd5e1',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em'
  }
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '9px',
  padding: '11px',
  borderRadius: '10px',
  backgroundColor: 'rgba(15, 23, 42, 0.48)',
  border: '1px solid rgba(124, 145, 173, 0.12)'
}

function fieldsSectionStyle(isWorkspaceMode: boolean, fieldCount: number): React.CSSProperties {
  const hasEditableFields = fieldCount > 0

  return {
    ...sectionStyle,
    flex: hasEditableFields ? 1 : 'initial',
    minHeight: hasEditableFields && isWorkspaceMode ? 220 : 0,
    maxHeight: hasEditableFields && isWorkspaceMode ? 320 : undefined,
    overflow: 'hidden'
  }
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px'
}

const sectionTitleStyle: React.CSSProperties = {
  color: '#e2e8f0',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase'
}

const sectionMetaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px'
}

const previewSurfaceStyle: React.CSSProperties = {
  position: 'relative',
  alignSelf: 'center',
  borderRadius: '4px',
  fontSize: 0,
  lineHeight: 0,
  overflow: 'hidden'
}

const safeAreaStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 'calc(8% + 3px)',
  border: '1px dashed rgba(125, 211, 252, 0.35)',
  borderRadius: '8px',
  pointerEvents: 'none'
}

const previewToolbarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap'
}

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
}

function miniToggleStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: '999px',
    border: `1px solid ${isActive ? 'rgba(73, 165, 184, 0.45)' : 'rgba(124, 145, 173, 0.22)'}`,
    backgroundColor: isActive ? 'rgba(73, 165, 184, 0.16)' : 'rgba(15, 23, 42, 0.36)',
    color: isActive ? '#a5f3fc' : '#cbd5e1',
    cursor: 'pointer',
    fontSize: '12px'
  }
}

const placementReadoutStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  textAlign: 'center'
}

const diagnosticsCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: '8px',
  backgroundColor: 'rgba(2, 8, 23, 0.42)',
  border: '1px solid rgba(124, 145, 173, 0.14)'
}

const diagnosticsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
  gap: '6px'
}

const diagnosticMetricStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '7px 8px',
  borderRadius: '7px',
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  border: '1px solid rgba(124, 145, 173, 0.12)'
}

const diagnosticLabelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em'
}

const diagnosticValueStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 700
}

const diagnosticsFootnoteStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  lineHeight: 1.4
}

function selectedItemSummaryStyle(isVisible: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '9px 10px',
    borderRadius: '8px',
    backgroundColor: isVisible ? 'rgba(73, 165, 184, 0.12)' : 'rgba(15, 23, 42, 0.38)',
    border: `1px solid ${isVisible ? 'rgba(73, 165, 184, 0.35)' : 'rgba(124, 145, 173, 0.14)'}`
  }
}

const selectedItemNameStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '14px',
  fontWeight: 700
}

const selectedItemMetaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  marginTop: '2px'
}

function selectedItemBadgeStyle(isVisible: boolean): React.CSSProperties {
  return {
    padding: '5px 8px',
    borderRadius: '999px',
    backgroundColor: isVisible ? 'rgba(8, 32, 38, 0.58)' : 'rgba(30, 41, 59, 0.7)',
    border: `1px solid ${isVisible ? 'rgba(125, 211, 252, 0.4)' : 'rgba(148, 163, 184, 0.28)'}`,
    color: isVisible ? '#cffafe' : '#cbd5e1',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em'
  }
}

const templateListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
}

const templateOverviewStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minWidth: 0,
  flex: 1
}

function templateCardStyle(isInUse: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: '8px',
    backgroundColor: isInUse ? 'rgba(73, 165, 184, 0.09)' : 'rgba(15, 23, 42, 0.38)',
    border: `1px solid ${isInUse ? 'rgba(73, 165, 184, 0.24)' : 'rgba(124, 145, 173, 0.14)'}`
  }
}

const templatePreviewFrameStyle: React.CSSProperties = {
  width: '78px',
  height: '44px',
  borderRadius: '7px',
  overflow: 'hidden',
  flexShrink: 0,
  backgroundColor: 'rgba(7, 11, 19, 0.72)',
  border: '1px solid rgba(124, 145, 173, 0.18)'
}

const templatePreviewImageStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover'
}

const templatePreviewPlaceholderStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#7dd3fc',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '4px',
  textAlign: 'center'
}

const templateNameStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '13px',
  fontWeight: 600
}

const templateMetaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  marginTop: '2px'
}

const templateActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexShrink: 0
}

const stackListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '220px',
  overflowY: 'auto',
  paddingRight: '4px'
}

function stackItemCardStyle(isSelected: boolean, isVisible: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '9px 10px',
    borderRadius: '8px',
    backgroundColor: isSelected ? 'rgba(73, 165, 184, 0.12)' : 'rgba(15, 23, 42, 0.38)',
    border: `1px solid ${isSelected ? 'rgba(73, 165, 184, 0.35)' : 'rgba(124, 145, 173, 0.14)'}`,
    boxShadow: isVisible ? 'inset 0 0 0 1px rgba(125, 211, 252, 0.12)' : 'none'
  }
}

const stackItemHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '10px'
}

const stackItemNameStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '13px',
  fontWeight: 700
}

const stackItemMetaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  marginTop: '2px'
}

function stackItemBadgeStyle(isVisible: boolean): React.CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: '999px',
    backgroundColor: isVisible ? 'rgba(8, 32, 38, 0.58)' : 'rgba(30, 41, 59, 0.7)',
    border: `1px solid ${isVisible ? 'rgba(125, 211, 252, 0.4)' : 'rgba(148, 163, 184, 0.28)'}`,
    color: isVisible ? '#cffafe' : '#cbd5e1',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    flexShrink: 0
  }
}

const stackItemActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap'
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: '7px',
  border: '1px solid rgba(73, 165, 184, 0.42)',
  backgroundColor: 'rgba(73, 165, 184, 0.18)',
  color: '#d8fbff',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600
}

const activeTemplateButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: 'rgba(30, 41, 59, 0.72)'
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: '7px',
  border: '1px solid rgba(124, 145, 173, 0.22)',
  backgroundColor: 'rgba(15, 23, 42, 0.42)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '12px'
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: '7px',
  border: '1px solid rgba(248, 113, 113, 0.34)',
  backgroundColor: 'rgba(127, 29, 29, 0.22)',
  color: '#fecaca',
  cursor: 'pointer',
  fontSize: '12px'
}

const checkboxListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
}

const checkboxItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: '#e2e8f0',
  fontSize: '13px'
}

const emptyStateStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '13px',
  lineHeight: 1.5
}

const fieldListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  gap: '10px',
  minHeight: 0,
  overflowY: 'auto',
  paddingRight: '4px'
}

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
}

const fieldLabelStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '12px',
  fontWeight: 600
}

const fieldInputStyle: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: '7px',
  border: '1px solid rgba(124, 145, 173, 0.2)',
  backgroundColor: 'rgba(7, 11, 19, 0.62)',
  color: '#f8fafc',
  fontSize: '13px'
}
