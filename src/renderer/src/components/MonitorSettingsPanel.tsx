import {
  MIXER_MONITOR_RESOLUTION_PRESETS,
  type MixerMonitorResolution
} from '../../../shared/ipc/mixer-contracts'
import {
  monitorEyebrowStyle,
  monitorHeroCardStyle,
  monitorOptionCardStyle,
  monitorOptionHintStyle,
  monitorOptionLabelStyle,
  monitorOptionsGridStyle,
  monitorResetButtonStyle,
  monitorTextStyle,
  monitorTitleStyle
} from './MixerLayout.styles'

interface MonitorSettingsPanelProps {
  isRunning: boolean
  monitorResolution: MixerMonitorResolution
  onResetMonitorSettings: () => void
  onSetMonitorResolution: (monitorResolution: MixerMonitorResolution) => void
}

export default function MonitorSettingsPanel({
  isRunning,
  monitorResolution,
  onResetMonitorSettings,
  onSetMonitorResolution
}: MonitorSettingsPanelProps): React.JSX.Element {
  return (
    <div style={monitorHeroCardStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={monitorEyebrowStyle}>Mixer</span>
        <h2 style={monitorTitleStyle}>Calidad de monitorización</h2>
        <p style={monitorTextStyle}>
          Resolución de los monitores Preview y Program. No afecta la grabación ni la señal interna
          del mixer.
          {isRunning && (
            <span style={{ color: '#fbbf24', display: 'block', marginTop: '4px' }}>
              El mixer está activo. Los cambios se aplican al reiniciar.
            </span>
          )}
        </p>
      </div>

      <div style={monitorOptionsGridStyle}>
        {(
          Object.entries(MIXER_MONITOR_RESOLUTION_PRESETS) as [
            MixerMonitorResolution,
            { width: number; height: number; label: string }
          ][]
        ).map(([key, preset]) => (
          <button
            className="openmix-control-button"
            type="button"
            key={key}
            onClick={() => onSetMonitorResolution(key)}
            style={monitorOptionCardStyle(monitorResolution === key)}
          >
            <span style={monitorOptionLabelStyle}>{preset.label}</span>
            <span style={monitorOptionHintStyle}>
              {preset.width}×{preset.height}
            </span>
          </button>
        ))}
      </div>

      <button
        className="openmix-control-button"
        type="button"
        onClick={onResetMonitorSettings}
        style={monitorResetButtonStyle}
      >
        Restablecer valores por defecto
      </button>
    </div>
  )
}
