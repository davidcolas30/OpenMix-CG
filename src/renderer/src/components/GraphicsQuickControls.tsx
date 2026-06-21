import type { GraphicsItemState } from '../../../shared/ipc/graphics-contracts'

interface GraphicsQuickControlsProps {
  items: GraphicsItemState[]
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
  onShowItem: (itemId: string) => void
  onHideItem: (itemId: string) => void
}

export default function GraphicsQuickControls({
  items,
  selectedItemId,
  onSelectItem,
  onShowItem,
  onHideItem
}: GraphicsQuickControlsProps): React.JSX.Element {
  return (
    <div style={containerStyle}>
      {items.length === 0 ? (
        <div style={emptyStateStyle}>
          <span style={emptyStateTitleStyle}>Sin grafismos</span>
          <span>No hay elementos cargados todavía.</span>
        </div>
      ) : (
        <div style={listStyle}>
          {items.map((item) => {
            const isSelected = item.itemId === selectedItemId
            const routedOutputs = [
              item.overlayTargets.preview ? 'PVW' : null,
              item.overlayTargets.program ? 'PGM' : null
            ].filter(Boolean)

            return (
              <div
                key={item.itemId}
                className="openmix-interactive-row"
                style={cardStyle(isSelected, item.isVisible)}
              >
                <div style={cardHeaderStyle}>
                  <div>
                    <div style={nameStyle}>{item.templateName}</div>
                    <div style={metaStyle}>
                      {item.category} ·{' '}
                      {routedOutputs.length > 0 ? routedOutputs.join(' + ') : 'Sin salida'}
                    </div>
                  </div>
                  <div style={badgeStyle(item.isVisible)}>{item.isVisible ? 'ON' : 'PRE'}</div>
                </div>

                <div style={actionsStyle}>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => onSelectItem(item.itemId)}
                    style={isSelected ? activeButtonStyle : ghostButtonStyle}
                  >
                    {isSelected ? 'Editar' : 'Sel'}
                  </button>
                  <button
                    className="openmix-control-button"
                    type="button"
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
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  height: '100%'
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minHeight: 0,
  overflowY: 'auto',
  paddingRight: '4px'
}

function cardStyle(isSelected: boolean, isVisible: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    padding: '9px',
    borderRadius: '7px',
    backgroundColor: isSelected ? 'rgba(73, 165, 184, 0.1)' : 'rgba(7, 11, 18, 0.38)',
    border: `1px solid ${
      isVisible
        ? 'rgba(125, 211, 252, 0.36)'
        : isSelected
          ? 'rgba(73, 165, 184, 0.3)'
          : 'rgba(124, 145, 173, 0.12)'
    }`,
    boxShadow: isVisible ? 'inset 3px 0 0 rgba(73, 165, 184, 0.78)' : 'none'
  }
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '8px'
}

const nameStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '12px',
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const metaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '10px',
  marginTop: '2px'
}

function badgeStyle(isVisible: boolean): React.CSSProperties {
  return {
    padding: '3px 6px',
    borderRadius: '5px',
    backgroundColor: isVisible ? 'rgba(8, 32, 38, 0.58)' : 'rgba(30, 41, 59, 0.7)',
    border: `1px solid ${isVisible ? 'rgba(125, 211, 252, 0.4)' : 'rgba(148, 163, 184, 0.28)'}`,
    color: isVisible ? '#cffafe' : '#cbd5e1',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    flexShrink: 0
  }
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px'
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '7px',
  border: '1px solid rgba(73, 165, 184, 0.42)',
  backgroundColor: 'rgba(73, 165, 184, 0.18)',
  color: '#d8fbff',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 700,
  flex: 1
}

const activeButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: 'rgba(30, 41, 59, 0.72)'
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '7px',
  border: '1px solid rgba(124, 145, 173, 0.22)',
  backgroundColor: 'rgba(15, 23, 42, 0.42)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 700,
  flex: 1
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '12px',
  borderRadius: '7px',
  border: '1px dashed rgba(100, 116, 139, 0.32)',
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: 1.4
}

const emptyStateTitleStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontWeight: 700
}
