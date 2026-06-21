import { useCallback, useEffect, useRef, useState } from 'react'
import * as audioPanelConstants from './AudioPanel.constants'
import {
  AudioClapperSection,
  AudioInputSection,
  AudioReferenceSection,
  AudioWaveformSection
} from './AudioPanelSections'
import * as audioPanelStyles from './AudioPanel.styles'
import * as audioPanelUtils from './AudioPanel.utils'
import type {
  AudioByteBuffer,
  AudioInputSummary,
  AudioPanelProps,
  AudioReferenceFrameSample,
  AudioReferenceNativeFrame,
  CalibrationState,
  IpcResult,
  MeterSnapshot,
  RecordingAudioState,
  WaveformHistoryPoint
} from './AudioPanel.types'

const {
  DEFAULT_PEAK_THRESHOLD_DB,
  DEFAULT_VISUAL_BUFFER_MS,
  DEFAULT_VISUAL_POST_ROLL_MS,
  DEFAULT_WAVEFORM_WINDOW_MS,
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  emptyCalibrationState,
  idleMeterSnapshot
} = audioPanelConstants

const { amplitudeToDb, clampNumber, dbToPercent, formatDb, formatSeconds } = audioPanelUtils

const {
  badgeRowStyle,
  dangerButtonStyle,
  eyebrowStyle,
  headerActionsStyle,
  headerStyle,
  modeBadgeStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  titleStyle,
  workspaceGridStyle
} = audioPanelStyles
export default function AudioPanel({
  referenceEnabled = false,
  referenceStartSignal = 0,
  isMixerRunning = false,
  referenceSources = [],
  selectedReferenceSource,
  onSelectReferenceSource
}: AudioPanelProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const tickMeterRef = useRef<(() => void) | null>(null)
  const timeDomainDataRef = useRef<AudioByteBuffer | null>(null)
  const waveformHistoryRef = useRef<WaveformHistoryPoint[]>([])
  const visualBufferRef = useRef<AudioReferenceFrameSample[]>([])
  const visualFreezeTimerRef = useRef<number | null>(null)
  const nativeFrameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const nativeFrameContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const nativeFrameImageDataRef = useRef<ImageData | null>(null)
  const nativeFrameRgbaBytesRef = useRef<Uint8ClampedArray | null>(null)
  const isVisualBufferFrozenRef = useRef(false)
  const capturePeaksRef = useRef(false)
  const peakThresholdDbRef = useRef(DEFAULT_PEAK_THRESHOLD_DB)
  const calibrationRef = useRef<CalibrationState>(emptyCalibrationState)
  const lastDetectedPeakAtRef = useRef(0)
  const lastMeterUpdateAtRef = useRef(0)

  const [audioInputs, setAudioInputs] = useState<AudioInputSummary[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [capturePeaks, setCapturePeaks] = useState(false)
  const [peakThresholdDb, setPeakThresholdDb] = useState(DEFAULT_PEAK_THRESHOLD_DB)
  const [waveformWindowMs, setWaveformWindowMs] = useState(DEFAULT_WAVEFORM_WINDOW_MS)
  const [visualBufferMs, setVisualBufferMs] = useState(DEFAULT_VISUAL_BUFFER_MS)
  const [visualPostRollMs, setVisualPostRollMs] = useState(DEFAULT_VISUAL_POST_ROLL_MS)
  const [isReferenceMonitorEnabled, setIsReferenceMonitorEnabled] = useState(false)
  const [liveVisualBuffer, setLiveVisualBuffer] = useState<AudioReferenceFrameSample[]>([])
  const [frozenVisualBuffer, setFrozenVisualBuffer] = useState<AudioReferenceFrameSample[] | null>(
    null
  )
  const [isVisualFreezePending, setIsVisualFreezePending] = useState(false)
  const [selectedVisualFrameTime, setSelectedVisualFrameTime] = useState<number | null>(null)
  const [manualDelayMs, setManualDelayMs] = useState(0)
  const [recordingAudioState, setRecordingAudioState] = useState<RecordingAudioState | null>(null)
  const [meterSnapshot, setMeterSnapshot] = useState<MeterSnapshot>(idleMeterSnapshot)
  const [calibration, setCalibration] = useState<CalibrationState>(emptyCalibrationState)
  const [statusMessage, setStatusMessage] = useState<string>('Panel listo')

  useEffect(() => {
    capturePeaksRef.current = capturePeaks
  }, [capturePeaks])

  useEffect(() => {
    peakThresholdDbRef.current = peakThresholdDb
  }, [peakThresholdDb])

  useEffect(() => {
    calibrationRef.current = calibration
  }, [calibration])

  const refreshAudioInputs = useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatusMessage('Este entorno no expone enumeración de dispositivos de audio')
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const nextAudioInputs = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Entrada de audio ${index + 1}`
        }))

      setAudioInputs(nextAudioInputs)
      setSelectedDeviceId((currentDeviceId) => {
        if (
          currentDeviceId &&
          nextAudioInputs.some((device) => device.deviceId === currentDeviceId)
        ) {
          return currentDeviceId
        }

        return nextAudioInputs[0]?.deviceId ?? ''
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron listar las entradas de audio'
      setStatusMessage(message)
    }
  }, [])

  const stopAudioGraph = useCallback((nextStatusMessage = 'Captura detenida'): void => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (visualFreezeTimerRef.current !== null) {
      window.clearTimeout(visualFreezeTimerRef.current)
      visualFreezeTimerRef.current = null
    }

    try {
      sourceRef.current?.disconnect()
    } catch {
      // El nodo puede estar ya desconectado durante el cierre del contexto.
    }
    sourceRef.current = null
    analyserRef.current = null
    timeDomainDataRef.current = null
    waveformHistoryRef.current = []

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    const audioContext = audioContextRef.current
    audioContextRef.current = null
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined)
    }

    setIsMonitoring(false)
    setIsVisualFreezePending(false)
    setMeterSnapshot(idleMeterSnapshot)
    setStatusMessage(nextStatusMessage)
  }, [])

  const drawWaveform = useCallback(
    (history: WaveformHistoryPoint[], rmsDb: number, peakDb: number, now: number): void => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(rect.width * ratio))
      const height = Math.max(1, Math.round(rect.height * ratio))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)
      context.fillStyle = '#05070a'
      context.fillRect(0, 0, rect.width, rect.height)

      context.strokeStyle = 'rgba(124, 145, 173, 0.14)'
      context.lineWidth = 1
      for (let markerIndex = 0; markerIndex <= 4; markerIndex++) {
        const x = (rect.width / 4) * markerIndex
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, rect.height)
        context.stroke()
      }

      context.strokeStyle = 'rgba(124, 145, 173, 0.24)'
      context.beginPath()
      context.moveTo(0, rect.height / 2)
      context.lineTo(rect.width, rect.height / 2)
      context.stroke()

      const gradient = context.createLinearGradient(0, 0, rect.width, 0)
      gradient.addColorStop(0, '#38bdf8')
      gradient.addColorStop(0.5, peakDb > peakThresholdDbRef.current ? '#facc15' : '#22c55e')
      gradient.addColorStop(1, '#49a5b8')

      context.strokeStyle = gradient
      context.lineWidth = 1.8
      context.lineCap = 'round'

      for (const point of history) {
        const ageMs = now - point.time
        const x = rect.width - (ageMs / waveformWindowMs) * rect.width
        if (x < 0 || x > rect.width) {
          continue
        }

        const yMin = rect.height / 2 + point.min * (rect.height * 0.42)
        const yMax = rect.height / 2 + point.max * (rect.height * 0.42)
        context.beginPath()
        context.moveTo(x, yMin)
        context.lineTo(x, yMax)
        context.stroke()

        if (point.peakDb >= peakThresholdDbRef.current) {
          context.strokeStyle = 'rgba(250, 204, 21, 0.62)'
          context.beginPath()
          context.moveTo(x, 10)
          context.lineTo(x, rect.height - 10)
          context.stroke()
          context.strokeStyle = gradient
        }
      }

      context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'

      const drawEventMarker = (eventTime: number | null, label: string, color: string): void => {
        if (eventTime === null) {
          return
        }

        const ageMs = now - eventTime
        const x = rect.width - (ageMs / waveformWindowMs) * rect.width
        if (x < 0 || x > rect.width) {
          return
        }

        context.strokeStyle = color
        context.lineWidth = 2
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, rect.height)
        context.stroke()
        context.fillStyle = color
        context.fillText(label, Math.min(rect.width - 72, Math.max(10, x + 6)), 42)
      }

      const calibrationSnapshot = calibrationRef.current
      drawEventMarker(calibrationSnapshot.audioPeakAt, 'audio', 'rgba(250, 204, 21, 0.9)')
      drawEventMarker(calibrationSnapshot.visualMarkAt, 'visual', 'rgba(56, 189, 248, 0.9)')

      context.fillStyle = 'rgba(226, 232, 240, 0.82)'
      context.fillText(
        `Últimos ${formatSeconds(waveformWindowMs)} · RMS ${formatDb(rmsDb)} · Peak ${formatDb(peakDb)}`,
        12,
        22
      )

      context.fillStyle = 'rgba(148, 163, 184, 0.72)'
      context.fillText(`-${formatSeconds(waveformWindowMs)}`, 12, rect.height - 14)
      context.fillText('ahora', Math.max(12, rect.width - 52), rect.height - 14)
    },
    [waveformWindowMs]
  )

  const handleReferenceFrameSample = useCallback(
    (sample: AudioReferenceFrameSample): void => {
      const cutoffTime = sample.time - visualBufferMs
      const nextBuffer = [
        ...visualBufferRef.current.filter((frame) => frame.time >= cutoffTime),
        sample
      ]
      visualBufferRef.current = nextBuffer

      if (!isVisualBufferFrozenRef.current) {
        setLiveVisualBuffer(nextBuffer)
      }
    },
    [visualBufferMs]
  )

  const convertNativeFrameToReferenceSample = useCallback(
    (frame: AudioReferenceNativeFrame): AudioReferenceFrameSample | null => {
      if (
        frame.width <= 0 ||
        frame.height <= 0 ||
        frame.data.byteLength < frame.width * frame.height * 4
      ) {
        return null
      }

      const canvas = nativeFrameCanvasRef.current ?? document.createElement('canvas')
      nativeFrameCanvasRef.current = canvas
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
        nativeFrameImageDataRef.current = null
        nativeFrameRgbaBytesRef.current = null
      }

      const context = nativeFrameContextRef.current ?? canvas.getContext('2d')
      nativeFrameContextRef.current = context
      if (!context) {
        return null
      }

      let imageData = nativeFrameImageDataRef.current
      let rgbaBytes = nativeFrameRgbaBytesRef.current
      if (!imageData || !rgbaBytes) {
        imageData = context.createImageData(frame.width, frame.height)
        rgbaBytes = imageData.data
        nativeFrameImageDataRef.current = imageData
        nativeFrameRgbaBytesRef.current = rgbaBytes
      }

      if (frame.format === 'RGBA') {
        rgbaBytes.set(frame.data.subarray(0, rgbaBytes.length))
      } else {
        for (let index = 0; index < rgbaBytes.length; index += 4) {
          rgbaBytes[index] = frame.data[index + 2] ?? 0
          rgbaBytes[index + 1] = frame.data[index + 1] ?? 0
          rgbaBytes[index + 2] = frame.data[index] ?? 0
          rgbaBytes[index + 3] = frame.data[index + 3] ?? 255
        }
      }

      context.putImageData(imageData, 0, 0)

      return {
        time: performance.now(),
        imageUrl: canvas.toDataURL('image/jpeg', 0.62),
        width: frame.width,
        height: frame.height
      }
    },
    []
  )

  const freezeVisualBuffer = useCallback((): number => {
    if (visualFreezeTimerRef.current !== null) {
      window.clearTimeout(visualFreezeTimerRef.current)
      visualFreezeTimerRef.current = null
    }
    const snapshot = visualBufferRef.current.slice()
    isVisualBufferFrozenRef.current = true
    setIsVisualFreezePending(false)
    setFrozenVisualBuffer(snapshot)
    setSelectedVisualFrameTime(null)
    return snapshot.length
  }, [])

  const resumeVisualBuffer = useCallback((): void => {
    if (visualFreezeTimerRef.current !== null) {
      window.clearTimeout(visualFreezeTimerRef.current)
      visualFreezeTimerRef.current = null
    }
    isVisualBufferFrozenRef.current = false
    setIsVisualFreezePending(false)
    setFrozenVisualBuffer(null)
    setSelectedVisualFrameTime(null)
    setLiveVisualBuffer(visualBufferRef.current)
    setStatusMessage('Buffer visual en vivo')
  }, [])

  const scheduleVisualBufferFreeze = useCallback((): void => {
    if (isVisualBufferFrozenRef.current) {
      return
    }
    if (visualFreezeTimerRef.current !== null) {
      window.clearTimeout(visualFreezeTimerRef.current)
    }

    setIsVisualFreezePending(true)
    visualFreezeTimerRef.current = window.setTimeout(() => {
      visualFreezeTimerRef.current = null
      const frozenFrameCount = freezeVisualBuffer()
      setStatusMessage(`Buffer congelado tras post-roll · ${frozenFrameCount} frames`)
    }, visualPostRollMs)
  }, [freezeVisualBuffer, visualPostRollMs])

  const markVisualFrame = useCallback((frame: AudioReferenceFrameSample): void => {
    const currentCalibration = calibrationRef.current
    const suggestedDelayMs =
      currentCalibration.audioPeakAt !== null
        ? Math.round(frame.time - currentCalibration.audioPeakAt)
        : null
    const nextCalibration = {
      ...currentCalibration,
      visualMarkAt: frame.time,
      suggestedDelayMs
    }

    calibrationRef.current = nextCalibration
    setCalibration(nextCalibration)
    setSelectedVisualFrameTime(frame.time)
    setStatusMessage(
      suggestedDelayMs !== null
        ? `Frame visual seleccionado: ${suggestedDelayMs} ms`
        : 'Frame visual seleccionado'
    )
  }, [])

  const tickMeter = useCallback((): void => {
    const analyser = analyserRef.current
    if (!analyser) {
      return
    }

    let data = timeDomainDataRef.current
    if (!data || data.length !== analyser.fftSize) {
      data = new Uint8Array(analyser.fftSize)
      timeDomainDataRef.current = data
    }

    analyser.getByteTimeDomainData(data)

    let min = 1
    let max = -1
    let peak = 0
    let squareSum = 0
    for (const sample of data) {
      const normalizedSample = (sample - 128) / 128
      const absoluteSample = Math.abs(normalizedSample)
      min = Math.min(min, normalizedSample)
      max = Math.max(max, normalizedSample)
      peak = Math.max(peak, absoluteSample)
      squareSum += normalizedSample * normalizedSample
    }

    const rms = Math.sqrt(squareSum / Math.max(1, data.length))
    const rmsDb = amplitudeToDb(rms)
    const peakDb = amplitudeToDb(peak)
    const now = performance.now()
    const history = waveformHistoryRef.current
    history.push({ time: now, min, max, peakDb })

    const oldestVisibleTime = now - waveformWindowMs
    while (history.length > 0 && history[0].time < oldestVisibleTime) {
      history.shift()
    }

    drawWaveform(history, rmsDb, peakDb, now)

    if (now - lastMeterUpdateAtRef.current > 90) {
      setMeterSnapshot({
        rmsDb,
        peakDb,
        levelPercent: dbToPercent(rmsDb),
        peakPercent: dbToPercent(peakDb)
      })
      lastMeterUpdateAtRef.current = now
    }

    if (
      capturePeaksRef.current &&
      peakDb >= peakThresholdDbRef.current &&
      now - lastDetectedPeakAtRef.current > 700
    ) {
      lastDetectedPeakAtRef.current = now
      const currentCalibration = calibrationRef.current
      const suggestedDelayMs =
        currentCalibration.visualMarkAt !== null
          ? Math.round(currentCalibration.visualMarkAt - now)
          : null
      const nextCalibration = {
        ...currentCalibration,
        audioPeakAt: now,
        suggestedDelayMs,
        peakDb
      }

      calibrationRef.current = nextCalibration
      setCalibration(nextCalibration)
      scheduleVisualBufferFreeze()
      setStatusMessage(
        `Pico detectado a ${formatDb(peakDb)} · esperando ${visualPostRollMs} ms de vídeo`
      )
    }

    animationFrameRef.current = window.requestAnimationFrame(() => tickMeterRef.current?.())
  }, [drawWaveform, scheduleVisualBufferFreeze, visualPostRollMs, waveformWindowMs])

  useEffect(() => {
    tickMeterRef.current = tickMeter
  }, [tickMeter])

  const startMonitoring = useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMessage('Este entorno no permite capturar audio local')
      return
    }

    stopAudioGraph('Preparando captura...')

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000
      }

      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: audioConstraints
      })
      const audioContext = new AudioContext({ sampleRate: 48000 })
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)

      streamRef.current = stream
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      sourceRef.current = source
      timeDomainDataRef.current = new Uint8Array(analyser.fftSize)
      lastMeterUpdateAtRef.current = 0

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      setIsMonitoring(true)
      setStatusMessage('Captura de audio activa')
      await refreshAudioInputs()
      animationFrameRef.current = window.requestAnimationFrame(() => tickMeterRef.current?.())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar la captura'
      stopAudioGraph(message)
    }
  }, [refreshAudioInputs, selectedDeviceId, stopAudioGraph])

  const resetCalibration = useCallback((): void => {
    lastDetectedPeakAtRef.current = 0
    calibrationRef.current = emptyCalibrationState
    setCalibration(emptyCalibrationState)
    setSelectedVisualFrameTime(null)
    resumeVisualBuffer()
    setStatusMessage('Calibración reiniciada')
  }, [resumeVisualBuffer])

  const markVisualEvent = useCallback((): void => {
    const currentCalibration = calibrationRef.current
    const visualMarkAt = performance.now()
    const suggestedDelayMs =
      currentCalibration.audioPeakAt !== null
        ? Math.round(visualMarkAt - currentCalibration.audioPeakAt)
        : null
    const nextCalibration = {
      ...currentCalibration,
      visualMarkAt,
      suggestedDelayMs
    }

    calibrationRef.current = nextCalibration
    setCalibration(nextCalibration)
    setStatusMessage(
      suggestedDelayMs !== null ? `Delay sugerido: ${suggestedDelayMs} ms` : 'Marca visual guardada'
    )
  }, [])

  const refreshRecordingAudioState = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.mixer.getRecordingAudioState()) as IpcResult<RecordingAudioState>
      if (result.ok && result.data) {
        setRecordingAudioState(result.data)
        setManualDelayMs(result.data.delayMs)
      }
    } catch {
      setRecordingAudioState(null)
    }
  }, [])

  const applyRecordingAudioDelay = useCallback(async (delayMs: number): Promise<void> => {
    try {
      const result = (await window.openMix.mixer.setRecordingAudioDelay({
        delayMs
      })) as IpcResult<RecordingAudioState>

      if (!result.ok || !result.data) {
        setStatusMessage(result.error?.message ?? 'No se pudo aplicar el delay al audio REC')
        return
      }

      setRecordingAudioState(result.data)
      setManualDelayMs(result.data.delayMs)
      setStatusMessage(
        result.data.enabled
          ? `Delay REC aplicado: ${result.data.delayMs} ms`
          : `Delay REC preparado: ${result.data.delayMs} ms`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo aplicar el delay REC'
      setStatusMessage(message)
    }
  }, [])

  const applySuggestedDelay = useCallback(async (): Promise<void> => {
    if (calibration.suggestedDelayMs === null) {
      return
    }

    const nextDelayMs = clampNumber(calibration.suggestedDelayMs, MIN_DELAY_MS, MAX_DELAY_MS)
    setManualDelayMs(nextDelayMs)
    await applyRecordingAudioDelay(nextDelayMs)
  }, [applyRecordingAudioDelay, calibration.suggestedDelayMs])

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refreshAudioInputs()
      void refreshRecordingAudioState()
    }, 0)

    return () => {
      window.clearTimeout(refreshTimer)
    }
  }, [refreshAudioInputs, refreshRecordingAudioState])

  useEffect(() => {
    return () => {
      stopAudioGraph('')
    }
  }, [stopAudioGraph])

  const calibrationOrigin = calibration.audioPeakAt ?? calibration.visualMarkAt
  const visualBufferFrames = frozenVisualBuffer ?? liveVisualBuffer
  const canRunReferenceMonitor = referenceEnabled && isMixerRunning
  const shouldRunReferenceMonitor = isReferenceMonitorEnabled && canRunReferenceMonitor
  const effectiveReferenceStartSignal = shouldRunReferenceMonitor
    ? Math.max(1, referenceStartSignal)
    : 0

  useEffect(() => {
    if (!shouldRunReferenceMonitor) {
      return
    }

    return window.openMix.mixer.onAudioReferenceFrame((frame) => {
      const sample = convertNativeFrameToReferenceSample(frame)
      if (sample) {
        handleReferenceFrameSample(sample)
      }
    })
  }, [convertNativeFrameToReferenceSample, handleReferenceFrameSample, shouldRunReferenceMonitor])

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>Audio local</span>
          <h2 style={titleStyle}>Panel de audio</h2>
          <div style={badgeRowStyle}>
            <span style={modeBadgeStyle(isMonitoring)}>Diagnóstico</span>
            <span style={modeBadgeStyle(Boolean(recordingAudioState?.enabled))}>
              {recordingAudioState?.enabled
                ? recordingAudioState.active
                  ? 'REC audio activo'
                  : 'REC audio armado'
                : 'REC audio off'}
            </span>
          </div>
        </div>
        <div style={headerActionsStyle}>
          <button
            className="openmix-control-button"
            type="button"
            onClick={() => void refreshAudioInputs()}
            style={secondaryButtonStyle(false)}
          >
            Actualizar
          </button>
          {isMonitoring ? (
            <button
              className="openmix-control-button"
              type="button"
              onClick={() => stopAudioGraph()}
              style={dangerButtonStyle(false)}
            >
              Detener
            </button>
          ) : (
            <button
              className="openmix-control-button"
              type="button"
              onClick={() => void startMonitoring()}
              style={primaryButtonStyle(false)}
            >
              Capturar
            </button>
          )}
        </div>
      </header>

      <section className="openmix-audio-workspace" style={workspaceGridStyle}>
        <AudioReferenceSection
          canRunReferenceMonitor={canRunReferenceMonitor}
          shouldRunReferenceMonitor={shouldRunReferenceMonitor}
          isReferenceMonitorEnabled={isReferenceMonitorEnabled}
          referenceEnabled={referenceEnabled}
          effectiveReferenceStartSignal={effectiveReferenceStartSignal}
          referenceSources={referenceSources}
          selectedReferenceSource={selectedReferenceSource}
          onToggleReferenceMonitor={() =>
            setIsReferenceMonitorEnabled((currentValue) => !currentValue)
          }
          onSelectReferenceSource={onSelectReferenceSource}
          visualBufferFrames={visualBufferFrames}
          isVisualFreezePending={isVisualFreezePending}
          frozenVisualBuffer={frozenVisualBuffer}
          visualBufferMs={visualBufferMs}
          visualPostRollMs={visualPostRollMs}
          selectedVisualFrameTime={selectedVisualFrameTime}
          audioPeakAt={calibration.audioPeakAt}
          onVisualBufferMsChange={setVisualBufferMs}
          onVisualPostRollMsChange={setVisualPostRollMs}
          onFreezeOrResume={
            frozenVisualBuffer ? resumeVisualBuffer : () => void freezeVisualBuffer()
          }
          onMarkVisualFrame={markVisualFrame}
        />

        <AudioInputSection
          audioInputs={audioInputs}
          selectedDeviceId={selectedDeviceId}
          isMonitoring={isMonitoring}
          meterSnapshot={meterSnapshot}
          manualDelayMs={manualDelayMs}
          recordingAudioState={recordingAudioState}
          onSelectedDeviceIdChange={setSelectedDeviceId}
          onManualDelayMsChange={setManualDelayMs}
          onApplyRecordingAudioDelay={(delayMs) => void applyRecordingAudioDelay(delayMs)}
        />

        <AudioWaveformSection
          canvasRef={canvasRef}
          statusMessage={statusMessage}
          waveformWindowMs={waveformWindowMs}
          onWaveformWindowMsChange={setWaveformWindowMs}
        />

        <AudioClapperSection
          calibration={calibration}
          calibrationOrigin={calibrationOrigin}
          peakThresholdDb={peakThresholdDb}
          isMonitoring={isMonitoring}
          capturePeaks={capturePeaks}
          onPeakThresholdDbChange={setPeakThresholdDb}
          onCapturePeaksChange={setCapturePeaks}
          onMarkVisualEvent={markVisualEvent}
          onUseSuggestedDelay={() => void applySuggestedDelay()}
          onResetCalibration={resetCalibration}
        />
      </section>
    </div>
  )
}
