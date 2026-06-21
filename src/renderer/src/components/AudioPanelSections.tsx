import type { Dispatch, RefObject, SetStateAction } from 'react'
import NativeMonitorSurface from './NativeMonitorSurface'
import {
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  SILENCE_DB,
  VISUAL_BUFFER_OPTIONS_MS,
  VISUAL_POST_ROLL_OPTIONS_MS,
  WAVEFORM_WINDOW_OPTIONS_MS
} from './AudioPanel.constants'
import * as styles from './AudioPanel.styles'
import type {
  AudioInputSummary,
  AudioReferenceFrameSample,
  AudioReferenceSource,
  CalibrationState,
  MeterSnapshot,
  RecordingAudioState
} from './AudioPanel.types'
import {
  clampNumber,
  formatDb,
  formatRelativeTime,
  formatSeconds,
  formatVisualFrameTime
} from './AudioPanel.utils'

interface AudioReferenceSectionProps {
  canRunReferenceMonitor: boolean
  shouldRunReferenceMonitor: boolean
  isReferenceMonitorEnabled: boolean
  referenceEnabled: boolean
  effectiveReferenceStartSignal: number
  referenceSources: AudioReferenceSource[]
  selectedReferenceSource?: number
  onToggleReferenceMonitor: () => void
  onSelectReferenceSource?: (sourceIndex: number) => void
  visualBufferFrames: AudioReferenceFrameSample[]
  isVisualFreezePending: boolean
  frozenVisualBuffer: AudioReferenceFrameSample[] | null
  visualBufferMs: number
  visualPostRollMs: number
  selectedVisualFrameTime: number | null
  audioPeakAt: number | null
  onVisualBufferMsChange: Dispatch<SetStateAction<number>>
  onVisualPostRollMsChange: Dispatch<SetStateAction<number>>
  onFreezeOrResume: () => void
  onMarkVisualFrame: (frame: AudioReferenceFrameSample) => void
}

export function AudioReferenceSection({
  canRunReferenceMonitor,
  shouldRunReferenceMonitor,
  isReferenceMonitorEnabled,
  referenceEnabled,
  effectiveReferenceStartSignal,
  referenceSources,
  selectedReferenceSource,
  onToggleReferenceMonitor,
  onSelectReferenceSource,
  visualBufferFrames,
  isVisualFreezePending,
  frozenVisualBuffer,
  visualBufferMs,
  visualPostRollMs,
  selectedVisualFrameTime,
  audioPeakAt,
  onVisualBufferMsChange,
  onVisualPostRollMsChange,
  onFreezeOrResume,
  onMarkVisualFrame
}: AudioReferenceSectionProps): React.JSX.Element {
  return (
    <div style={styles.referenceCardStyle}>
      <div style={styles.cardHeaderStyle}>
        <div>
          <h3 style={styles.cardTitleStyle}>Referencia visual</h3>
          <span style={styles.cardSubtleTextStyle}>Preview ligero para marcar la claqueta</span>
        </div>
        <button
          className="openmix-control-button"
          type="button"
          onClick={onToggleReferenceMonitor}
          disabled={!canRunReferenceMonitor}
          style={styles.referenceToggleStyle(isReferenceMonitorEnabled, !canRunReferenceMonitor)}
        >
          {isReferenceMonitorEnabled ? 'Apagar monitor' : 'Activar monitor'}
        </button>
      </div>

      <div style={styles.referenceMonitorShellStyle}>
        {shouldRunReferenceMonitor ? (
          <NativeMonitorSurface
            target="audio-reference"
            label="PVW"
            borderColor="#49a5b8"
            width={400}
            height={225}
            isVisible={shouldRunReferenceMonitor}
            startSignal={effectiveReferenceStartSignal}
          />
        ) : (
          <div style={styles.referencePlaceholderStyle}>
            {canRunReferenceMonitor
              ? 'Monitor apagado. Actívalo solo cuando vayas a calibrar con claqueta.'
              : referenceEnabled
                ? 'Inicia el mixer para activar la referencia visual.'
                : 'La referencia visual está desactivada por la configuración de monitores.'}
          </div>
        )}
      </div>

      {referenceSources.length > 0 && onSelectReferenceSource && (
        <div style={styles.referenceSourceGridStyle}>
          {referenceSources.map((source) => (
            <button
              className="openmix-control-button"
              key={source.index}
              type="button"
              onClick={() => onSelectReferenceSource(source.index)}
              style={styles.referenceSourceButtonStyle(source.index === selectedReferenceSource)}
            >
              <span>F{source.index + 1}</span>
              <strong>{source.name}</strong>
            </button>
          ))}
        </div>
      )}

      <div style={styles.visualBufferHeaderStyle}>
        <span style={styles.cardSubtleTextStyle}>
          Buffer visual{' '}
          {isVisualFreezePending
            ? 'grabando post-roll'
            : frozenVisualBuffer
              ? 'congelado'
              : 'en vivo'}
        </span>
        <div style={styles.visualBufferActionsStyle}>
          <select
            className="openmix-select"
            aria-label="Duración del buffer visual"
            value={visualBufferMs}
            onChange={(event) => onVisualBufferMsChange(Number(event.target.value))}
            style={styles.compactSelectStyle}
          >
            {VISUAL_BUFFER_OPTIONS_MS.map((optionMs) => (
              <option key={optionMs} value={optionMs}>
                {formatSeconds(optionMs)}
              </option>
            ))}
          </select>
          <select
            className="openmix-select"
            aria-label="Post-roll visual"
            value={visualPostRollMs}
            onChange={(event) => onVisualPostRollMsChange(Number(event.target.value))}
            style={styles.compactSelectStyle}
          >
            {VISUAL_POST_ROLL_OPTIONS_MS.map((optionMs) => (
              <option key={optionMs} value={optionMs}>
                +{optionMs}ms
              </option>
            ))}
          </select>
          <button
            className="openmix-control-button"
            type="button"
            onClick={onFreezeOrResume}
            style={styles.secondaryButtonStyle(false)}
          >
            {frozenVisualBuffer ? 'Reanudar' : 'Congelar'}
          </button>
        </div>
      </div>

      <div style={styles.visualBufferStripStyle}>
        {visualBufferFrames.length === 0 ? (
          <div style={styles.visualBufferEmptyStyle}>
            El buffer aparecerá aquí cuando la referencia visual reciba frames.
          </div>
        ) : (
          visualBufferFrames.map((frame) => (
            <button
              key={`${frame.time}-${frame.imageUrl.length}`}
              type="button"
              onClick={() => onMarkVisualFrame(frame)}
              style={styles.visualFrameButtonStyle(frame.time === selectedVisualFrameTime)}
              title="Usar este frame como marca visual"
            >
              <img
                src={frame.imageUrl}
                width={frame.width}
                height={frame.height}
                alt="Frame de referencia visual"
                style={styles.visualFrameImageStyle}
              />
              <span style={styles.visualFrameTimeStyle}>
                {formatVisualFrameTime(frame.time, audioPeakAt)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

interface AudioInputSectionProps {
  audioInputs: AudioInputSummary[]
  selectedDeviceId: string
  isMonitoring: boolean
  meterSnapshot: MeterSnapshot
  manualDelayMs: number
  recordingAudioState: RecordingAudioState | null
  onSelectedDeviceIdChange: Dispatch<SetStateAction<string>>
  onManualDelayMsChange: Dispatch<SetStateAction<number>>
  onApplyRecordingAudioDelay: (delayMs: number) => void
}

export function AudioInputSection({
  audioInputs,
  selectedDeviceId,
  isMonitoring,
  meterSnapshot,
  manualDelayMs,
  recordingAudioState,
  onSelectedDeviceIdChange,
  onManualDelayMsChange,
  onApplyRecordingAudioDelay
}: AudioInputSectionProps): React.JSX.Element {
  return (
    <div style={styles.cardStyle}>
      <div style={styles.cardHeaderStyle}>
        <h3 style={styles.cardTitleStyle}>Entrada</h3>
        <span style={styles.cardMetaStyle}>{audioInputs.length || 0} dispositivos</span>
      </div>

      <div style={styles.fieldStackStyle}>
        <label style={styles.fieldLabelStyle} htmlFor="audio-device">
          Dispositivo
        </label>
        <select
          className="openmix-select"
          id="audio-device"
          value={selectedDeviceId}
          onChange={(event) => onSelectedDeviceIdChange(event.target.value)}
          disabled={isMonitoring}
          style={styles.selectStyle}
        >
          {audioInputs.length === 0 ? (
            <option value="">Entrada por defecto</option>
          ) : (
            audioInputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          )}
        </select>
      </div>

      <div style={styles.meterBlockStyle}>
        <div style={styles.meterHeaderStyle}>
          <span>RMS {formatDb(meterSnapshot.rmsDb)}</span>
          <span>Peak {formatDb(meterSnapshot.peakDb)}</span>
        </div>
        <div style={styles.meterTrackStyle}>
          <div style={styles.meterFillStyle(meterSnapshot.levelPercent, '#38bdf8')} />
          <div style={styles.meterPeakStyle(meterSnapshot.peakPercent)} />
        </div>
      </div>

      <div style={styles.fieldStackStyle}>
        <label style={styles.fieldLabelStyle} htmlFor="manual-delay">
          Delay manual
        </label>
        <div style={styles.delayControlStyle}>
          <input
            className="openmix-input"
            id="manual-delay"
            type="range"
            min={MIN_DELAY_MS}
            max={MAX_DELAY_MS}
            step={1}
            value={manualDelayMs}
            onChange={(event) => onManualDelayMsChange(Number(event.target.value))}
            style={styles.rangeStyle}
          />
          <input
            className="openmix-input"
            type="number"
            min={MIN_DELAY_MS}
            max={MAX_DELAY_MS}
            step={1}
            value={manualDelayMs}
            onChange={(event) =>
              onManualDelayMsChange(
                clampNumber(Number(event.target.value), MIN_DELAY_MS, MAX_DELAY_MS)
              )
            }
            style={styles.delayInputStyle}
          />
          <span style={styles.delayUnitStyle}>ms</span>
          <button
            className="openmix-control-button"
            type="button"
            onClick={() => onApplyRecordingAudioDelay(manualDelayMs)}
            style={styles.secondaryButtonStyle(false)}
          >
            Aplicar REC
          </button>
        </div>
      </div>
      <span style={styles.cardSubtleTextStyle}>
        {recordingAudioState?.enabled
          ? `REC local · ${recordingAudioState.source} · ${recordingAudioState.delayMs} ms`
          : 'REC local desactivado'}
      </span>
    </div>
  )
}

interface AudioWaveformSectionProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  statusMessage: string
  waveformWindowMs: number
  onWaveformWindowMsChange: Dispatch<SetStateAction<number>>
}

export function AudioWaveformSection({
  canvasRef,
  statusMessage,
  waveformWindowMs,
  onWaveformWindowMsChange
}: AudioWaveformSectionProps): React.JSX.Element {
  return (
    <div style={styles.waveformCardStyle}>
      <div style={styles.cardHeaderStyle}>
        <h3 style={styles.cardTitleStyle}>Onda</h3>
        <div style={styles.waveformHeaderControlsStyle}>
          <span style={styles.cardMetaStyle}>{statusMessage}</span>
          <select
            className="openmix-select"
            aria-label="Ventana de onda"
            value={waveformWindowMs}
            onChange={(event) => onWaveformWindowMsChange(Number(event.target.value))}
            style={styles.compactSelectStyle}
          >
            {WAVEFORM_WINDOW_OPTIONS_MS.map((optionMs) => (
              <option key={optionMs} value={optionMs}>
                {formatSeconds(optionMs)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <canvas ref={canvasRef} style={styles.canvasStyle} />
    </div>
  )
}

interface AudioClapperSectionProps {
  calibration: CalibrationState
  calibrationOrigin: number | null
  peakThresholdDb: number
  isMonitoring: boolean
  capturePeaks: boolean
  onPeakThresholdDbChange: Dispatch<SetStateAction<number>>
  onCapturePeaksChange: Dispatch<SetStateAction<boolean>>
  onMarkVisualEvent: () => void
  onUseSuggestedDelay: () => void
  onResetCalibration: () => void
}

export function AudioClapperSection({
  calibration,
  calibrationOrigin,
  peakThresholdDb,
  isMonitoring,
  capturePeaks,
  onPeakThresholdDbChange,
  onCapturePeaksChange,
  onMarkVisualEvent,
  onUseSuggestedDelay,
  onResetCalibration
}: AudioClapperSectionProps): React.JSX.Element {
  return (
    <div style={styles.cardStyle}>
      <div style={styles.cardHeaderStyle}>
        <h3 style={styles.cardTitleStyle}>Claqueta</h3>
        <span style={styles.cardMetaStyle}>
          {calibration.suggestedDelayMs !== null
            ? `${calibration.suggestedDelayMs} ms`
            : 'sin cálculo'}
        </span>
      </div>

      <div style={styles.fieldStackStyle}>
        <label style={styles.fieldLabelStyle} htmlFor="peak-threshold">
          Umbral de pico
        </label>
        <div style={styles.delayControlStyle}>
          <input
            className="openmix-input"
            id="peak-threshold"
            type="range"
            min={-42}
            max={-6}
            step={1}
            value={peakThresholdDb}
            onChange={(event) => onPeakThresholdDbChange(Number(event.target.value))}
            style={styles.rangeStyle}
          />
          <span style={styles.thresholdValueStyle}>{peakThresholdDb} dB</span>
        </div>
      </div>

      <div style={styles.calibrationActionGridStyle}>
        <button
          className="openmix-control-button"
          type="button"
          onClick={() => onCapturePeaksChange((currentValue) => !currentValue)}
          disabled={!isMonitoring}
          style={styles.captureButtonStyle(!isMonitoring, capturePeaks)}
        >
          {capturePeaks ? 'Escuchando' : 'Detectar pico'}
        </button>
        <button
          className="openmix-control-button"
          type="button"
          onClick={onMarkVisualEvent}
          disabled={!isMonitoring}
          style={styles.secondaryButtonStyle(!isMonitoring)}
        >
          Marcar visual
        </button>
        <button
          className="openmix-control-button"
          type="button"
          onClick={onUseSuggestedDelay}
          disabled={calibration.suggestedDelayMs === null}
          style={styles.primaryButtonStyle(calibration.suggestedDelayMs === null)}
        >
          Usar delay
        </button>
        <button
          className="openmix-control-button"
          type="button"
          onClick={onResetCalibration}
          style={styles.secondaryButtonStyle(false)}
        >
          Reiniciar
        </button>
      </div>

      <div style={styles.calibrationReadoutStyle}>
        <div>
          <span style={styles.readoutLabelStyle}>Pico audio</span>
          <strong style={styles.readoutValueStyle}>
            {formatRelativeTime(calibration.audioPeakAt, calibrationOrigin)}
          </strong>
        </div>
        <div>
          <span style={styles.readoutLabelStyle}>Marca visual</span>
          <strong style={styles.readoutValueStyle}>
            {formatRelativeTime(calibration.visualMarkAt, calibrationOrigin)}
          </strong>
        </div>
        <div>
          <span style={styles.readoutLabelStyle}>Pico</span>
          <strong style={styles.readoutValueStyle}>
            {formatDb(calibration.peakDb ?? SILENCE_DB)}
          </strong>
        </div>
      </div>
    </div>
  )
}
