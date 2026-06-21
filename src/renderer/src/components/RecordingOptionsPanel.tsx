import type {
  OutputRecordingState,
  RecordingContainer,
  RecordingSettings,
  RecordingVideoPreset
} from '../../../shared/ipc/output-contracts'
import type { CSSProperties } from 'react'

interface RecordingOptionsPanelProps {
  settings: RecordingSettings
  recordingState: OutputRecordingState
  onSelectDirectory: () => void
  onUseAutomaticDirectory: () => void
  onResetDefaults: () => void
  onSetContainer: (container: RecordingContainer) => void
  onSetVideoPreset: (preset: RecordingVideoPreset) => void
  onSetQualityCrf: (value: number) => void
}

const containerOptions: Array<{
  value: RecordingContainer
  label: string
  hint: string
}> = [
  {
    value: 'mp4',
    label: 'MP4',
    hint: 'Compatibilidad alta para reproducción y entrega rápida.'
  },
  {
    value: 'mkv',
    label: 'MKV',
    hint: 'Más tolerante ante cierres inesperados durante una grabación.'
  }
]

const presetOptions: Array<{
  value: RecordingVideoPreset
  label: string
  hint: string
}> = [
  {
    value: 'veryfast',
    label: 'Veryfast',
    hint: 'Menos CPU, archivos algo más grandes.'
  },
  {
    value: 'fast',
    label: 'Fast',
    hint: 'Equilibrio razonable entre tamaño y coste de codificación.'
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Mejor compresión visual a costa de más CPU.'
  }
]

export default function RecordingOptionsPanel({
  settings,
  recordingState,
  onSelectDirectory,
  onUseAutomaticDirectory,
  onResetDefaults,
  onSetContainer,
  onSetVideoPreset,
  onSetQualityCrf
}: RecordingOptionsPanelProps): React.JSX.Element {
  const isLocked = recordingState.status === 'recording' || recordingState.status === 'stopping'
  const effectiveDirectory =
    settings.directory ??
    recordingState.directory ??
    'Se usará la carpeta de vídeos por defecto del sistema.'

  return (
    <section style={workspaceStyle}>
      <div style={heroCardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={heroEyebrowStyle}>Salida local</span>
          <h2 style={heroTitleStyle}>Opciones de grabación</h2>
          <p style={heroTextStyle}>
            Estos ajustes se aplican a la próxima grabación. Mientras REC está activo se bloquean
            para evitar cambios a mitad de fichero.
          </p>
        </div>

        <div style={heroAsideStyle}>
          <div style={statusPillStyle(isLocked)}>
            {isLocked ? 'REC activa: ajustes bloqueados' : 'Lista para la siguiente toma'}
          </div>
          <button
            className="openmix-control-button"
            type="button"
            onClick={onResetDefaults}
            disabled={isLocked}
            style={secondaryButtonStyle(isLocked)}
          >
            Restaurar valores base
          </button>
        </div>
      </div>

      <div style={optionsGridStyle}>
        <section style={cardStyle}>
          <header style={cardHeaderStyle}>
            <span style={cardEyebrowStyle}>Destino</span>
            <h3 style={cardTitleStyle}>Carpeta de grabación</h3>
          </header>

          <div style={pathBoxStyle}>{effectiveDirectory}</div>

          <div style={buttonRowStyle}>
            <button
              className="openmix-control-button"
              type="button"
              onClick={onSelectDirectory}
              disabled={isLocked}
              style={primaryButtonStyle(isLocked)}
            >
              Elegir carpeta
            </button>
            <button
              className="openmix-control-button"
              type="button"
              onClick={onUseAutomaticDirectory}
              disabled={isLocked || settings.directory === null}
              style={secondaryButtonStyle(isLocked || settings.directory === null)}
            >
              Usar automática
            </button>
          </div>

          <p style={helpTextStyle}>
            MP4 y MKV usarán esta ruta como carpeta base. El nombre del archivo sigue generándose
            automáticamente con fecha y hora.
          </p>
        </section>

        <section style={cardStyle}>
          <header style={cardHeaderStyle}>
            <span style={cardEyebrowStyle}>Fichero</span>
            <h3 style={cardTitleStyle}>Contenedor</h3>
          </header>

          <div style={optionGridStyle}>
            {containerOptions.map((option) => (
              <button
                className="openmix-control-button"
                key={option.value}
                type="button"
                onClick={() => onSetContainer(option.value)}
                disabled={isLocked}
                style={optionCardStyle(settings.container === option.value, isLocked)}
              >
                <span style={optionTitleStyle}>{option.label}</span>
                <span style={optionHintStyle}>{option.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <header style={cardHeaderStyle}>
            <span style={cardEyebrowStyle}>Codificador</span>
            <h3 style={cardTitleStyle}>Preset de compresión</h3>
          </header>

          <div style={optionGridStyle}>
            {presetOptions.map((option) => (
              <button
                className="openmix-control-button"
                key={option.value}
                type="button"
                onClick={() => onSetVideoPreset(option.value)}
                disabled={isLocked}
                style={optionCardStyle(settings.videoPreset === option.value, isLocked)}
              >
                <span style={optionTitleStyle}>{option.label}</span>
                <span style={optionHintStyle}>{option.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <header style={cardHeaderStyle}>
            <span style={cardEyebrowStyle}>Calidad</span>
            <h3 style={cardTitleStyle}>Factor CRF</h3>
          </header>

          <div style={sliderHeaderStyle}>
            <span style={sliderValueStyle}>{settings.qualityCrf}</span>
            <span style={sliderLegendStyle}>{getCrfDescription(settings.qualityCrf)}</span>
          </div>

          <input
            className="openmix-input"
            type="range"
            min={18}
            max={28}
            step={1}
            value={settings.qualityCrf}
            disabled={isLocked}
            onChange={(event) => onSetQualityCrf(Number(event.target.value))}
            style={rangeStyle}
          />

          <div style={rangeLegendRowStyle}>
            <span>18 · más calidad</span>
            <span>28 · más compresión</span>
          </div>

          <p style={helpTextStyle}>
            En x264 un CRF más bajo conserva más detalle pero aumenta el tamaño. 21-23 suele ser un
            punto de partida sensato en 720p30.
          </p>
        </section>
      </div>
    </section>
  )
}

function getCrfDescription(value: number): string {
  if (value <= 20) {
    return 'Detalle alto y archivo más pesado'
  }

  if (value <= 23) {
    return 'Equilibrio visual para la mayoría de tomas'
  }

  return 'Archivo más contenido con algo menos de margen visual'
}

const workspaceStyle = {
  flex: 1,
  width: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  minWidth: 0,
  minHeight: 0,
  overflow: 'visible'
} as const

const heroCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  flexWrap: 'wrap',
  padding: '20px',
  borderRadius: '18px',
  border: '1px solid rgba(73, 165, 184, 0.24)',
  background:
    'linear-gradient(135deg, rgba(8, 12, 18, 0.94), rgba(16, 24, 37, 0.92) 58%, rgba(23, 49, 68, 0.9))'
} as const

const heroEyebrowStyle = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7dd3fc'
} as const

const heroTitleStyle = {
  margin: 0,
  fontSize: '28px',
  lineHeight: 1.05,
  color: '#f8fafc'
} as const

const heroTextStyle = {
  margin: 0,
  maxWidth: '700px',
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#cbd5e1'
} as const

const heroAsideStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '10px',
  minWidth: '220px'
} as const

function statusPillStyle(isLocked: boolean): CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: '999px',
    border: `1px solid ${isLocked ? 'rgba(248, 113, 113, 0.3)' : 'rgba(125, 211, 252, 0.26)'}`,
    backgroundColor: isLocked ? 'rgba(127, 29, 29, 0.28)' : 'rgba(8, 47, 73, 0.28)',
    color: isLocked ? '#fecaca' : '#cffafe',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  } as const
}

const optionsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: '16px',
  alignItems: 'stretch',
  minWidth: 0
} as const

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  padding: '18px',
  borderRadius: '16px',
  border: '1px solid rgba(124, 145, 173, 0.18)',
  backgroundColor: 'rgba(15, 23, 42, 0.5)',
  minHeight: '100%',
  minWidth: 0,
  boxSizing: 'border-box'
} as const

const cardHeaderStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
} as const

const cardEyebrowStyle = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7c8ca4'
} as const

const cardTitleStyle = {
  margin: 0,
  fontSize: '18px',
  color: '#f8fafc'
} as const

const pathBoxStyle = {
  minHeight: '78px',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px dashed rgba(124, 145, 173, 0.28)',
  backgroundColor: 'rgba(2, 6, 23, 0.38)',
  color: '#e2e8f0',
  fontSize: '13px',
  lineHeight: 1.5,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere'
} as const

const buttonRowStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap'
} as const

function primaryButtonStyle(isDisabled: boolean): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: isDisabled ? '#475569' : 'linear-gradient(135deg, #205590, #49a5b8)',
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.65 : 1,
    transition: 'filter 120ms ease, transform 120ms ease'
  } as const
}

function secondaryButtonStyle(isDisabled: boolean): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    color: '#dbe7f3',
    fontSize: '12px',
    fontWeight: 600,
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
    transition: 'filter 120ms ease, transform 120ms ease'
  } as const
}

const helpTextStyle = {
  margin: 0,
  fontSize: '12px',
  lineHeight: 1.55,
  color: '#94a3b8'
} as const

const optionGridStyle = {
  display: 'grid',
  gap: '10px'
} as const

function optionCardStyle(isActive: boolean, isDisabled: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: `1px solid ${isActive ? 'rgba(125, 211, 252, 0.4)' : 'rgba(124, 145, 173, 0.18)'}`,
    backgroundColor: isActive ? 'rgba(8, 47, 73, 0.34)' : 'rgba(2, 6, 23, 0.3)',
    color: '#f8fafc',
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.6 : 1,
    textAlign: 'left',
    minWidth: 0,
    transition:
      'filter 120ms ease, transform 120ms ease, border-color 120ms ease, background-color 120ms ease'
  } as const
}

const optionTitleStyle = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#e2e8f0'
} as const

const optionHintStyle = {
  fontSize: '12px',
  lineHeight: 1.45,
  color: '#94a3b8'
} as const

const sliderHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap'
} as const

const sliderValueStyle = {
  minWidth: '54px',
  padding: '8px 10px',
  borderRadius: '12px',
  backgroundColor: 'rgba(8, 47, 73, 0.34)',
  border: '1px solid rgba(125, 211, 252, 0.26)',
  color: '#e0f2fe',
  fontSize: '20px',
  fontWeight: 700,
  textAlign: 'center'
} as const

const sliderLegendStyle = {
  fontSize: '12px',
  lineHeight: 1.45,
  color: '#cbd5e1'
} as const

const rangeStyle = {
  width: '100%'
} as const

const rangeLegendRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  color: '#7c8ca4',
  fontSize: '11px',
  letterSpacing: '0.04em'
} as const
