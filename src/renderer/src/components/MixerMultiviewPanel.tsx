import type { ReactNode } from 'react'
import type {
  MixerMonitorSurfaceConfig,
  MixerMonitorTargets
} from '../../../shared/ipc/mixer-contracts'
import {
  idleStateStyle,
  multiviewContentStyle,
  multiviewHeaderStyle,
  multiviewPanelStyle,
  multiviewToggleStyle,
  nativeMultiviewHotspotStyle,
  nativeMultiviewRowStyle,
  nativeMultiviewVideoWrapStyle,
  sectionTitle
} from './MixerLayout.styles'
import type { PanelSize } from './MixerLayout.types'
import { MonitorPlaceholder, MonitorWebRtcVideo } from './MonitorSurfaces'
import NativeMonitorSurface from './NativeMonitorSurface'

interface MixerMultiviewPanelProps {
  graphicsSlot?: ReactNode
  height: number
  isMediaPlaneActive: boolean
  isRunning: boolean
  isTransitionInProgress: boolean
  isVisible: boolean
  monitorSurfaceConfig: MixerMonitorSurfaceConfig
  monitorTargets: MixerMonitorTargets
  nativeSize: PanelSize
  numSources: number
  previewSource: number
  programSource: number
  showGraphicsSlot: boolean
  sourceNames: string[]
  startSignal: number
  onSelectPreview: (index: number) => void
  onToggleGraphicsSlot: () => void
}

export default function MixerMultiviewPanel({
  graphicsSlot,
  height,
  isMediaPlaneActive,
  isRunning,
  isTransitionInProgress,
  isVisible,
  monitorSurfaceConfig,
  monitorTargets,
  nativeSize,
  numSources,
  previewSource,
  programSource,
  showGraphicsSlot,
  sourceNames,
  startSignal,
  onSelectPreview,
  onToggleGraphicsSlot
}: MixerMultiviewPanelProps): React.JSX.Element {
  const visibleSourceCount = Math.min(numSources, 4)

  return (
    <section
      style={{
        ...multiviewPanelStyle,
        height: `${height}px`,
        opacity: isRunning ? 1 : 0.72
      }}
    >
      <div style={multiviewContentStyle}>
        <div style={multiviewHeaderStyle}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Multiview</h2>
          <button
            className="openmix-control-button"
            onClick={onToggleGraphicsSlot}
            style={multiviewToggleStyle(showGraphicsSlot)}
          >
            Slot GFX
          </button>
        </div>
        {isRunning ? (
          <div style={nativeMultiviewRowStyle}>
            <div
              style={{
                ...nativeMultiviewVideoWrapStyle,
                width: `${nativeSize.width}px`,
                height: `${nativeSize.height}px`
              }}
            >
              {monitorSurfaceConfig.mode === 'native' &&
              monitorSurfaceConfig.multiviewSurface === 'native' &&
              monitorTargets.multiview &&
              isMediaPlaneActive ? (
                <NativeMonitorSurface
                  target="multiview"
                  label="MV"
                  borderColor="#49a5b8"
                  width={nativeSize.width}
                  height={nativeSize.height}
                  isVisible={isVisible}
                  startSignal={startSignal}
                />
              ) : monitorSurfaceConfig.mode === 'native' &&
                monitorSurfaceConfig.multiviewSurface === 'native' &&
                monitorTargets.multiview ? (
                <MonitorPlaceholder
                  label="MV"
                  width={nativeSize.width}
                  height={nativeSize.height}
                  borderColor="#49a5b8"
                  statusLabel="MV EN ESPERA"
                />
              ) : monitorTargets.multiview ? (
                <MonitorWebRtcVideo
                  target="multiview"
                  label="MV"
                  borderColor="#49a5b8"
                  width={nativeSize.width}
                  height={nativeSize.height}
                  isRunning={isRunning}
                  startSignal={startSignal}
                />
              ) : (
                <MonitorPlaceholder
                  label="MV"
                  width={nativeSize.width}
                  height={nativeSize.height}
                  borderColor="#49a5b8"
                />
              )}
              {Array.from({ length: visibleSourceCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectPreview(index)}
                  disabled={isTransitionInProgress}
                  style={nativeMultiviewHotspotStyle(
                    index,
                    visibleSourceCount,
                    index === programSource,
                    index === previewSource,
                    isTransitionInProgress
                  )}
                  title={`Enviar ${sourceNames[index] ?? `Fuente ${index + 1}`} a Preview`}
                >
                  <span>{sourceNames[index] ?? `Fuente ${index + 1}`}</span>
                  <strong>
                    {index === programSource ? 'PGM' : index === previewSource ? 'PVW' : ''}
                  </strong>
                </button>
              ))}
            </div>
            {graphicsSlot}
          </div>
        ) : (
          <div style={idleStateStyle}>Inicia el mixer para ver la multiview con cámaras.</div>
        )}
      </div>
    </section>
  )
}
