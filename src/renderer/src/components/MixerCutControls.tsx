import {
  MAX_MIXER_TRANSITION_DURATION_MS,
  MIN_MIXER_TRANSITION_DURATION_MS,
  type MixerTransitionId
} from '../../../shared/ipc/mixer-contracts'
import { AUTO_MIXER_TRANSITIONS } from './MixerLayout.constants'
import {
  autoTransitionButtonStyle,
  autoTransitionMetaStyle,
  autoTransitionPanelStyle,
  autoTransitionSelectStyle,
  autoTransitionTitleStyle,
  cutButtonStyle,
  cutColumnStyle,
  sourceSelectButtonStyle,
  sourceSelectNumberStyle,
  sourceSelectRoleStyle,
  sourceSelectorHeaderStyle,
  sourceSelectorPanelStyle
} from './MixerLayout.styles'

interface MixerCutControlsProps {
  isCompact: boolean
  isRunning: boolean
  isTransitionInProgress: boolean
  numSources: number
  previewSource: number
  programSource: number
  selectedTransitionDurationMs: number
  selectedTransitionId: MixerTransitionId
  sourceNames: string[]
  onAutoTransition: () => void
  onCut: () => void
  onSelectPreview: (index: number) => void
  onSetTransitionDurationMs: (durationMs: number) => void
  onSetTransitionId: (transitionId: MixerTransitionId) => void
}

export default function MixerCutControls({
  isCompact,
  isRunning,
  isTransitionInProgress,
  numSources,
  previewSource,
  programSource,
  selectedTransitionDurationMs,
  selectedTransitionId,
  sourceNames,
  onAutoTransition,
  onCut,
  onSelectPreview,
  onSetTransitionDurationMs,
  onSetTransitionId
}: MixerCutControlsProps): React.JSX.Element {
  const isControlDisabled = !isRunning || isTransitionInProgress

  return (
    <div style={cutColumnStyle(isCompact)}>
      <button
        className="openmix-control-button"
        onClick={onCut}
        disabled={isControlDisabled}
        style={cutButtonStyle(!isControlDisabled, isCompact)}
        title="Intercambiar Preview ↔ Program"
      >
        CUT
      </button>

      <div style={autoTransitionPanelStyle(isCompact)}>
        <span style={autoTransitionTitleStyle}>AUTO</span>
        <select
          className="openmix-select"
          value={selectedTransitionId}
          disabled={isControlDisabled}
          onChange={(event) => onSetTransitionId(event.target.value as MixerTransitionId)}
          style={autoTransitionSelectStyle(isControlDisabled, isCompact)}
          title="Transición usada por el botón AUTO"
        >
          {AUTO_MIXER_TRANSITIONS.map((transition) => (
            <option key={transition.id} value={transition.id}>
              {transition.label}
            </option>
          ))}
        </select>

        <input
          type="range"
          min={MIN_MIXER_TRANSITION_DURATION_MS}
          max={MAX_MIXER_TRANSITION_DURATION_MS}
          step={50}
          value={selectedTransitionDurationMs}
          disabled={isControlDisabled}
          onChange={(event) => {
            onSetTransitionDurationMs(Number(event.target.value))
          }}
          title="Duración de la transición AUTO"
        />

        <span style={autoTransitionMetaStyle}>
          {selectedTransitionDurationMs} ms
          {isTransitionInProgress ? ' · EN CURSO' : ''}
        </span>

        <button
          className="openmix-control-button"
          onClick={onAutoTransition}
          disabled={isControlDisabled}
          style={autoTransitionButtonStyle(isControlDisabled, isCompact)}
          title="Lanzar la transición seleccionada"
        >
          AUTO
        </button>
      </div>

      {isRunning && (
        <div style={sourceSelectorPanelStyle(isCompact)}>
          <div style={sourceSelectorHeaderStyle}>
            <span>PVW</span>
          </div>
          {Array.from({ length: numSources }, (_, index) => (
            <button
              className="openmix-control-button"
              key={index}
              type="button"
              onClick={() => onSelectPreview(index)}
              disabled={isTransitionInProgress}
              style={sourceSelectButtonStyle(
                index === programSource,
                index === previewSource,
                isTransitionInProgress,
                isCompact
              )}
              title={`Enviar ${sourceNames[index] ?? `Fuente ${index + 1}`} a Preview`}
            >
              <span style={sourceSelectNumberStyle}>F{index + 1}</span>
              <span style={sourceSelectRoleStyle(index === programSource, index === previewSource)}>
                {index === programSource ? 'PGM' : index === previewSource ? 'PVW' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
