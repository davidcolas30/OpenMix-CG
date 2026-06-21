import type { ReactNode } from 'react'
import type {
  MixerMonitorSurfaceConfig,
  MixerMonitorTargets
} from '../../../shared/ipc/mixer-contracts'
import {
  combinedMonitorFrameStyle,
  combinedMonitorLabelStyle,
  liveMonitorTitleStyle,
  monitorColumnStyle,
  monitorHeaderRowStyle,
  monitorPanelStyle,
  sectionTitle
} from './MixerLayout.styles'
import type { PanelSize } from './MixerLayout.types'
import { ExternalMonitorWebView, MonitorPlaceholder, MonitorWebRtcVideo } from './MonitorSurfaces'
import NativeMonitorSurface from './NativeMonitorSurface'
import VideoCanvas from './VideoCanvas'

interface VideoFrameData {
  data: Uint8Array
  height: number
  width: number
}

interface MixerMonitorPanelProps {
  combinedMonitorSize: PanelSize
  cutControls: ReactNode
  isRunning: boolean
  isVisible: boolean
  monitorCanvasSize: PanelSize
  monitorSurfaceConfig: MixerMonitorSurfaceConfig
  monitorTargets: MixerMonitorTargets
  previewMonitorTransport: 'ipc' | 'webrtc'
  startSignal: number
  onSubscribePgm: (callback: (frame: VideoFrameData) => void) => () => void
  onSubscribePvw: (callback: (frame: VideoFrameData) => void) => () => void
}

function MonitorTitle({ role }: { role: 'preview' | 'program' }): React.JSX.Element {
  return (
    <div style={monitorHeaderRowStyle}>
      <h2 style={liveMonitorTitleStyle(role)}>{role === 'preview' ? 'Preview' : 'Program'}</h2>
    </div>
  )
}

export default function MixerMonitorPanel({
  combinedMonitorSize,
  cutControls,
  isRunning,
  isVisible,
  monitorCanvasSize,
  monitorSurfaceConfig,
  monitorTargets,
  previewMonitorTransport,
  startSignal,
  onSubscribePgm,
  onSubscribePvw
}: MixerMonitorPanelProps): React.JSX.Element {
  if (previewMonitorTransport === 'webrtc' && monitorTargets.combined) {
    return (
      <section style={monitorPanelStyle}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${monitorCanvasSize.width}px ${monitorCanvasSize.width}px`,
              gridTemplateRows: 'auto auto',
              alignItems: 'center',
              justifyContent: 'center',
              columnGap: 0
            }}
          >
            <h2 style={{ ...sectionTitle, gridColumn: 1, gridRow: 1 }}>Preview</h2>
            <h2 style={{ ...sectionTitle, gridColumn: 2, gridRow: 1 }}>Program</h2>
            <div
              style={{
                gridColumn: '1 / 4',
                gridRow: 2,
                position: 'relative',
                width: `${combinedMonitorSize.width}px`,
                height: `${combinedMonitorSize.height}px`
              }}
            >
              <MonitorWebRtcVideo
                target="combined"
                label="PVW+PGM"
                borderColor="transparent"
                width={combinedMonitorSize.width}
                height={combinedMonitorSize.height}
                isRunning={isRunning}
                startSignal={startSignal}
              />
              <div style={combinedMonitorFrameStyle('#43a047', 0, monitorCanvasSize)} />
              <div
                style={combinedMonitorFrameStyle(
                  '#e53935',
                  monitorCanvasSize.width,
                  monitorCanvasSize
                )}
              />
              <span style={combinedMonitorLabelStyle('#43a047', 0)}>PVW</span>
              <span style={combinedMonitorLabelStyle('#e53935', monitorCanvasSize.width)}>PGM</span>
              <div
                style={{
                  position: 'absolute',
                  left: `${monitorCanvasSize.width - 56}px`,
                  top: 0,
                  width: '112px',
                  height: `${monitorCanvasSize.height}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {cutControls}
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section style={monitorPanelStyle}>
      <div style={monitorColumnStyle}>
        <MonitorTitle role="preview" />
        {monitorSurfaceConfig.mode === 'native' && monitorTargets.preview ? (
          <NativeMonitorSurface
            target="preview"
            label="PVW"
            borderColor="#43a047"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isVisible={isVisible}
            startSignal={startSignal}
          />
        ) : monitorSurfaceConfig.mode === 'native' ? (
          <MonitorPlaceholder
            label="PVW"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            borderColor="#43a047"
          />
        ) : previewMonitorTransport === 'webrtc' &&
          monitorSurfaceConfig.mode === 'external' &&
          monitorTargets.preview ? (
          <ExternalMonitorWebView
            target="preview"
            label="PVW"
            borderColor="#43a047"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isRunning={isRunning}
            startSignal={startSignal}
            preloadUrl={monitorSurfaceConfig.preloadUrl}
          />
        ) : previewMonitorTransport === 'webrtc' && monitorTargets.preview ? (
          <MonitorWebRtcVideo
            target="preview"
            label="PVW"
            borderColor="#43a047"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isRunning={isRunning}
            startSignal={startSignal}
          />
        ) : previewMonitorTransport === 'webrtc' ? (
          <MonitorPlaceholder
            label="PVW"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            borderColor="#43a047"
          />
        ) : (
          <VideoCanvas
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            onSubscribe={onSubscribePvw}
            label="PVW"
            borderColor="#43a047"
            showFps={isRunning}
          />
        )}
      </div>

      {cutControls}

      <div style={monitorColumnStyle}>
        <MonitorTitle role="program" />
        {monitorSurfaceConfig.mode === 'native' && monitorTargets.program ? (
          <NativeMonitorSurface
            target="program"
            label="PGM"
            borderColor="#e53935"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isVisible={isVisible}
            startSignal={startSignal}
          />
        ) : monitorSurfaceConfig.mode === 'native' ? (
          <MonitorPlaceholder
            label="PGM"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            borderColor="#e53935"
          />
        ) : previewMonitorTransport === 'webrtc' &&
          monitorSurfaceConfig.mode === 'external' &&
          monitorTargets.program ? (
          <ExternalMonitorWebView
            target="program"
            label="PGM"
            borderColor="#e53935"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isRunning={isRunning}
            startSignal={startSignal}
            preloadUrl={monitorSurfaceConfig.preloadUrl}
          />
        ) : previewMonitorTransport === 'webrtc' && monitorTargets.program ? (
          <MonitorWebRtcVideo
            target="program"
            label="PGM"
            borderColor="#e53935"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            isRunning={isRunning}
            startSignal={startSignal}
          />
        ) : previewMonitorTransport === 'webrtc' ? (
          <MonitorPlaceholder
            label="PGM"
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            borderColor="#e53935"
          />
        ) : (
          <VideoCanvas
            width={monitorCanvasSize.width}
            height={monitorCanvasSize.height}
            onSubscribe={onSubscribePgm}
            label="PGM"
            borderColor="#e53935"
            showFps={isRunning}
          />
        )}
      </div>
    </section>
  )
}
