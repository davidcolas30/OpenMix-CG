import type { RefObject } from 'react'
import type { GraphicsState } from '../../../shared/ipc/graphics-contracts'
import type { OutputRecordingState, RecordingSettings } from '../../../shared/ipc/output-contracts'
import openMixHeaderLogo from '../../../../resources/brand/final/openmix-cg-logo-horizontal-ui-dark-header.png'
import {
  appHeaderStyle,
  brandBlockStyle,
  brandHeadingStyle,
  brandLogoStyle,
  buttonStyle,
  headerActionsStyle,
  headerLeftStyle,
  recordButtonStyle,
  recordingClusterStyle,
  recordingDotStyle,
  recordingMetaRowStyle,
  recordingStatusRowStyle,
  recordingSummaryStyle,
  viewBadgeStyle,
  viewTabIndicatorStyle,
  viewTabStyle,
  viewTabsStyle
} from './MixerLayout.styles'
import type { ViewTabIndicator, WorkspaceView } from './MixerLayout.types'
import { formatBytes, formatDuration, getRecordingStatusLabel } from './MixerLayout.utils'

interface MixerAppHeaderProps {
  activeShortcutCount: number
  activeView: WorkspaceView
  graphicsState: GraphicsState
  isRunning: boolean
  recordingSettings: RecordingSettings
  recordingState: OutputRecordingState
  viewTabIndicator: ViewTabIndicator
  viewTabsRef: RefObject<HTMLDivElement | null>
  onRegisterViewTab: (view: WorkspaceView, node: HTMLButtonElement | null) => void
  onSelectView: (view: WorkspaceView) => void
  onStart: () => void
  onStop: () => void
  onToggleRecording: () => void
}

export default function MixerAppHeader({
  activeShortcutCount,
  activeView,
  graphicsState,
  isRunning,
  recordingSettings,
  recordingState,
  viewTabIndicator,
  viewTabsRef,
  onRegisterViewTab,
  onSelectView,
  onStart,
  onStop,
  onToggleRecording
}: MixerAppHeaderProps): React.JSX.Element {
  const isRecordingButtonDisabled =
    !isRunning && recordingState.status !== 'recording' && recordingState.status !== 'stopping'

  return (
    <header style={appHeaderStyle}>
      <div style={headerLeftStyle}>
        <div style={brandBlockStyle}>
          <h1 style={brandHeadingStyle}>
            <img
              src={openMixHeaderLogo}
              alt="OpenMix-CG"
              draggable={false}
              style={brandLogoStyle}
            />
          </h1>
        </div>

        <div ref={viewTabsRef} style={viewTabsStyle}>
          <div className="openmix-tab-indicator" style={viewTabIndicatorStyle(viewTabIndicator)} />
          <button
            className="openmix-control-button"
            ref={(node) => {
              onRegisterViewTab('mixer', node)
            }}
            onClick={() => onSelectView('mixer')}
            style={viewTabStyle(activeView === 'mixer')}
          >
            Mixer
          </button>
          <button
            className="openmix-control-button"
            ref={(node) => {
              onRegisterViewTab('audio', node)
            }}
            onClick={() => onSelectView('audio')}
            style={viewTabStyle(activeView === 'audio')}
          >
            Audio
            <span style={viewBadgeStyle(activeView === 'audio')}>SYNC</span>
          </button>
          <button
            className="openmix-control-button"
            ref={(node) => {
              onRegisterViewTab('graphics', node)
            }}
            onClick={() => onSelectView('graphics')}
            style={viewTabStyle(activeView === 'graphics')}
          >
            Grafismo
            <span style={viewBadgeStyle(graphicsState.visibleItemCount > 0)}>
              {graphicsState.visibleItemCount > 0
                ? `${graphicsState.visibleItemCount} ON`
                : graphicsState.items.length > 0
                  ? 'PRESET'
                  : 'VACÍO'}
            </span>
          </button>
          <button
            className="openmix-control-button"
            ref={(node) => {
              onRegisterViewTab('options', node)
            }}
            onClick={() => onSelectView('options')}
            style={viewTabStyle(activeView === 'options')}
          >
            Opciones
            <span style={viewBadgeStyle(recordingState.status === 'recording')}>REC</span>
          </button>
          <button
            className="openmix-control-button"
            ref={(node) => {
              onRegisterViewTab('shortcuts', node)
            }}
            onClick={() => onSelectView('shortcuts')}
            style={viewTabStyle(activeView === 'shortcuts')}
          >
            Atajos
            <span style={viewBadgeStyle(activeShortcutCount > 0)}>
              {activeShortcutCount > 0 ? `${activeShortcutCount} ON` : 'VACÍO'}
            </span>
          </button>
        </div>
      </div>
      <div style={headerActionsStyle}>
        <div style={recordingClusterStyle}>
          <div
            style={recordingSummaryStyle(recordingState.status)}
            title={
              recordingState.lastError ??
              recordingSettings.directory ??
              recordingState.directory ??
              'Se usará la carpeta por defecto de vídeos'
            }
          >
            <div style={recordingStatusRowStyle}>
              <span style={recordingDotStyle(recordingState.status)} />
              <span>{getRecordingStatusLabel(recordingState.status)}</span>
            </div>
            <div style={recordingMetaRowStyle}>
              <span>{formatDuration(recordingState.durationMs)}</span>
              <span>{formatBytes(recordingState.sizeBytes)}</span>
              <span>{recordingSettings.container.toUpperCase()}</span>
              <span>{recordingSettings.videoPreset}</span>
            </div>
          </div>

          <button
            className="openmix-control-button"
            onClick={onToggleRecording}
            disabled={isRecordingButtonDisabled}
            style={recordButtonStyle(recordingState.status, isRecordingButtonDisabled)}
          >
            {recordingState.status === 'recording' || recordingState.status === 'stopping'
              ? 'Detener REC'
              : 'REC'}
          </button>
        </div>

        {!isRunning ? (
          <button
            className="openmix-control-button"
            onClick={onStart}
            style={buttonStyle('#2a7a2a')}
          >
            Iniciar Mixer
          </button>
        ) : (
          <button
            className="openmix-control-button"
            onClick={onStop}
            style={buttonStyle('#a02020')}
          >
            Detener
          </button>
        )}
      </div>
    </header>
  )
}
