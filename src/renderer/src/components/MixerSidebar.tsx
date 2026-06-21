import type { GraphicsState } from '../../../shared/ipc/graphics-contracts'
import { MIN_QR_SIDEBAR_HEIGHT } from './MixerLayout.constants'
import {
  mixerSidebarStyle,
  sectionTitle,
  sidebarBodyStyle,
  sidebarCardStyle,
  sidebarFixedCardStyle,
  sidebarHeaderStyle,
  sidebarMetaStyle,
  sidebarResizerGripStyle,
  sidebarResizerStyle,
  sidebarSectionResizerGripStyle,
  sidebarSectionResizerStyle
} from './MixerLayout.styles'
import type { SidebarSectionResizeState } from './MixerLayout.types'
import GraphicsQuickControls from './GraphicsQuickControls'
import LocalVideoPanel from './LocalVideoPanel'
import QRCodePanel from './QRCodePanel'

interface MixerSidebarProps {
  graphicsState: GraphicsState
  isRunning: boolean
  panelHeights: {
    graphics: number
    localVideo: number
  }
  sidebarWidth: number
  sourceNames: string[]
  onHideGraphicsItem: (itemId: string) => Promise<void>
  onLocalVideoStarted: () => void
  onResetGraphicsHeight: () => void
  onResetLocalVideoHeight: () => void
  onResetSidebarWidth: () => void
  onSelectGraphicsItem: (itemId: string) => Promise<void>
  onShowGraphicsItem: (itemId: string) => Promise<void>
  onSidebarResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  onSidebarResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onSidebarResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  onSidebarSectionResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  onSidebarSectionResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onSidebarSectionResizeStart: (
    target: SidebarSectionResizeState['target'],
    event: React.PointerEvent<HTMLDivElement>
  ) => void
  onSourcesChanged: () => Promise<void>
}

export default function MixerSidebar({
  graphicsState,
  isRunning,
  panelHeights,
  sidebarWidth,
  sourceNames,
  onHideGraphicsItem,
  onLocalVideoStarted,
  onResetGraphicsHeight,
  onResetLocalVideoHeight,
  onResetSidebarWidth,
  onSelectGraphicsItem,
  onShowGraphicsItem,
  onSidebarResizeEnd,
  onSidebarResizeMove,
  onSidebarResizeStart,
  onSidebarSectionResizeEnd,
  onSidebarSectionResizeMove,
  onSidebarSectionResizeStart,
  onSourcesChanged
}: MixerSidebarProps): React.JSX.Element {
  return (
    <>
      <div
        style={sidebarResizerStyle}
        onPointerDown={onSidebarResizeStart}
        onPointerMove={onSidebarResizeMove}
        onPointerUp={onSidebarResizeEnd}
        onPointerCancel={onSidebarResizeEnd}
        onDoubleClick={onResetSidebarWidth}
        title="Arrastra para redimensionar la columna lateral"
      >
        <div style={sidebarResizerGripStyle} />
      </div>

      <aside style={mixerSidebarStyle(sidebarWidth)}>
        <section style={sidebarFixedCardStyle(panelHeights.graphics)}>
          <div style={sidebarHeaderStyle}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Grafismos</h2>
            <span style={sidebarMetaStyle}>
              {graphicsState.visibleItemCount > 0
                ? `${graphicsState.visibleItemCount} on air`
                : graphicsState.items.length > 0
                  ? `${graphicsState.items.length} en pila`
                  : 'sin carga'}
            </span>
          </div>
          <div style={sidebarBodyStyle}>
            <GraphicsQuickControls
              items={graphicsState.items}
              selectedItemId={graphicsState.selectedItemId}
              onSelectItem={onSelectGraphicsItem}
              onShowItem={onShowGraphicsItem}
              onHideItem={onHideGraphicsItem}
            />
          </div>
        </section>

        <div
          style={sidebarSectionResizerStyle}
          onPointerDown={(event) => onSidebarSectionResizeStart('graphics', event)}
          onPointerMove={onSidebarSectionResizeMove}
          onPointerUp={onSidebarSectionResizeEnd}
          onPointerCancel={onSidebarSectionResizeEnd}
          onDoubleClick={onResetGraphicsHeight}
          title="Arrastra para ajustar la altura de grafismos"
        >
          <div style={sidebarSectionResizerGripStyle} />
        </div>

        <section style={sidebarFixedCardStyle(panelHeights.localVideo)}>
          <div style={sidebarHeaderStyle}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Vídeo local</h2>
            <span style={sidebarMetaStyle}>slots 2-4</span>
          </div>
          <div style={sidebarBodyStyle}>
            <LocalVideoPanel
              isRunning={isRunning}
              sourceNames={sourceNames}
              onSourcesChanged={onSourcesChanged}
              onLocalVideoStarted={onLocalVideoStarted}
            />
          </div>
        </section>

        <div
          style={sidebarSectionResizerStyle}
          onPointerDown={(event) => onSidebarSectionResizeStart('localVideo', event)}
          onPointerMove={onSidebarSectionResizeMove}
          onPointerUp={onSidebarSectionResizeEnd}
          onPointerCancel={onSidebarSectionResizeEnd}
          onDoubleClick={onResetLocalVideoHeight}
          title="Arrastra para ajustar la altura de vídeo local"
        >
          <div style={sidebarSectionResizerGripStyle} />
        </div>

        <section style={{ ...sidebarCardStyle, flex: '1 1 0', minHeight: MIN_QR_SIDEBAR_HEIGHT }}>
          <div style={sidebarHeaderStyle}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Cámaras WebRTC</h2>
            <span style={sidebarMetaStyle}>QR y peers</span>
          </div>
          <div style={sidebarBodyStyle}>
            <QRCodePanel />
          </div>
        </section>
      </aside>
    </>
  )
}
