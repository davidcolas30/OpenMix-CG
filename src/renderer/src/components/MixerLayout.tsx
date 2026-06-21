/**
 * MixerLayout — Sala de control principal de OpenMix-CG.
 *
 * En Fase 4 la sala de control se divide en dos vistas operativas:
 * - Mixer principal, dedicado a Preview/Program, multiview y WebRTC
 * - Grafismo, en una pestaña separada para no saturar la pantalla principal
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  GraphicsAddTemplateResult,
  GraphicsOverlayTargets,
  GraphicsPlacement,
  GraphicsState,
  GraphicsTemplateSummary
} from '../../../shared/ipc/graphics-contracts'
import {
  DEFAULT_MIXER_MONITOR_SETTINGS,
  DEFAULT_MIXER_TRANSITION_DURATION_MS,
  DEFAULT_MIXER_TRANSITION_ID,
  type MixerMonitorResolution,
  type MixerMonitorSettings,
  type MixerMonitorSurfaceConfig,
  type MixerMonitorTargets,
  type MixerTransitionId
} from '../../../shared/ipc/mixer-contracts'
import { DEFAULT_RECORDING_SETTINGS } from '../../../shared/ipc/output-contracts'
import type {
  OutputRecordingState,
  RecordingContainer,
  RecordingDirectoryResult,
  RecordingSettings,
  RecordingVideoPreset
} from '../../../shared/ipc/output-contracts'
import AudioPanel from './AudioPanel'
import {
  GRAPHICS_WORKSPACE_PREVIEW_OUTPUT,
  SIDEBAR_RESIZER_WIDTH,
  defaultGraphicsState,
  defaultMonitorSurfaceConfig,
  defaultMonitorTargets,
  defaultRecordingState
} from './MixerLayout.constants'
import { useMixerWorkspaceLayout, useViewTabIndicator } from './MixerLayout.hooks'
import { useMixerKeyboardShortcuts } from './MixerLayout.keyboardShortcuts'
import {
  graphicsTileLabelStyle,
  graphicsTileStyle,
  graphicsWorkspaceStyle,
  mixerDeskStyle,
  multiviewResizerGripStyle,
  multiviewResizerStyle,
  primaryMixerColumnStyle,
  workspaceStyle
} from './MixerLayout.styles'
import type { GraphicsPreviewBackground, IpcResult, WorkspaceView } from './MixerLayout.types'
import {
  getSelectedGraphicsItem,
  readIpcResult,
  resolveMonitorCanvasSize,
  resolveNativeMultiviewLayout
} from './MixerLayout.utils'
import GraphicsPanel from './GraphicsPanel'
import KeyboardShortcutsPanel from './KeyboardShortcutsPanel'
import MixerAppHeader from './MixerAppHeader'
import MixerCutControls from './MixerCutControls'
import MixerMonitorPanel from './MixerMonitorPanel'
import MixerMultiviewPanel from './MixerMultiviewPanel'
import MixerSidebar from './MixerSidebar'
import MonitorSettingsPanel from './MonitorSettingsPanel'
import RecordingOptionsPanel from './RecordingOptionsPanel'
import VideoCanvas from './VideoCanvas'

export default function MixerLayout(): React.JSX.Element {
  const [activeView, setActiveView] = useState<WorkspaceView>('mixer')
  const {
    viewTabIndicator,
    viewTabsRef,
    registerViewTab: handleRegisterViewTab
  } = useViewTabIndicator(activeView)
  const [isRunning, setIsRunning] = useState(false)
  const [isMediaPlaneActive, setIsMediaPlaneActive] = useState(false)
  const [showGraphicsSlotInMultiview, setShowGraphicsSlotInMultiview] = useState(true)
  const [programSource, setProgramSource] = useState(0)
  const [previewSource, setPreviewSource] = useState(1)
  const [isTransitionInProgress, setIsTransitionInProgress] = useState(false)
  const [numSources, setNumSources] = useState(4)
  const [sourceNames, setSourceNames] = useState<string[]>([
    'SMPTE Bars',
    'Cam 1',
    'Cam 2',
    'Cam 3'
  ])
  const [selectedTransitionId, setSelectedTransitionId] = useState<MixerTransitionId>(
    DEFAULT_MIXER_TRANSITION_ID
  )
  const [selectedTransitionDurationMs, setSelectedTransitionDurationMs] = useState(
    DEFAULT_MIXER_TRANSITION_DURATION_MS
  )
  const [graphicsTemplates, setGraphicsTemplates] = useState<GraphicsTemplateSummary[]>([])
  const [graphicsState, setGraphicsState] = useState<GraphicsState>(defaultGraphicsState)
  const [graphicsStatusMessage, setGraphicsStatusMessage] = useState<string | null>(null)
  const [recordingState, setRecordingState] = useState<OutputRecordingState>(defaultRecordingState)
  const [recordingSettings, setRecordingSettings] = useState<RecordingSettings>({
    ...DEFAULT_RECORDING_SETTINGS
  })
  const [hasHydratedRecordingSettings, setHasHydratedRecordingSettings] = useState(false)
  const [monitorSettings, setMonitorSettings] = useState<MixerMonitorSettings>({
    ...DEFAULT_MIXER_MONITOR_SETTINGS
  })
  const [hasHydratedMonitorSettings, setHasHydratedMonitorSettings] = useState(false)
  const [previewMonitorTransport, setPreviewMonitorTransport] = useState<'ipc' | 'webrtc'>('ipc')
  const [monitorSurfaceConfig, setMonitorSurfaceConfig] = useState<MixerMonitorSurfaceConfig>(
    defaultMonitorSurfaceConfig
  )
  const [monitorTargets, setMonitorTargets] = useState<MixerMonitorTargets>(defaultMonitorTargets)
  const [previewMonitorStartSignal, setPreviewMonitorStartSignal] = useState(0)
  const [multiviewMonitorStartSignal, setMultiviewMonitorStartSignal] = useState(0)
  const [graphicsPreviewBackground, setGraphicsPreviewBackground] =
    useState<GraphicsPreviewBackground>('black')
  const {
    mixerWorkspaceRef,
    mixerWorkspaceSize,
    multiviewHeight,
    mixerSidebarWidth,
    sidebarPanelHeights,
    handleMultiviewResizeStart,
    handleMultiviewResizeMove,
    handleMultiviewResizeEnd,
    handleSidebarResizeStart,
    handleSidebarResizeMove,
    handleSidebarResizeEnd,
    handleSidebarSectionResizeStart,
    handleSidebarSectionResizeMove,
    handleSidebarSectionResizeEnd,
    resetMultiviewHeight,
    resetSidebarWidth,
    resetGraphicsSidebarHeight,
    resetLocalVideoSidebarHeight
  } = useMixerWorkspaceLayout(activeView)

  const applyMixerState = useCallback(
    (data: {
      programSource: number
      previewSource: number
      sources: { index: number; name: string }[]
      isRunning?: boolean
      isPipelinePlaying?: boolean
      isTransitionInProgress?: boolean
    }): void => {
      setProgramSource(data.programSource)
      setPreviewSource(data.previewSource)
      setNumSources(data.sources.length)
      setSourceNames(data.sources.map((source) => source.name))
      if (typeof data.isRunning === 'boolean') {
        setIsRunning(data.isRunning)
        if (!data.isRunning) {
          setIsMediaPlaneActive(false)
        }
      }
      if (typeof data.isPipelinePlaying === 'boolean') {
        setIsMediaPlaneActive(data.isPipelinePlaying)
      }
      if (typeof data.isTransitionInProgress === 'boolean') {
        setIsTransitionInProgress(data.isTransitionInProgress)
      }
    },
    []
  )

  const refreshMixerState = useCallback(async (): Promise<void> => {
    const result = (await window.openMix.mixer.getState()) as {
      ok: boolean
      data?: {
        programSource: number
        previewSource: number
        sources: { index: number; name: string }[]
        isRunning: boolean
        isPipelinePlaying: boolean
        isTransitionInProgress: boolean
      }
    }

    if (result.ok && result.data) {
      applyMixerState(result.data)
    }
  }, [applyMixerState])

  const refreshGraphicsState = useCallback(async (): Promise<void> => {
    try {
      const [templatesResult, stateResult] = await Promise.all([
        window.openMix.graphics.listTemplates(),
        window.openMix.graphics.getState()
      ])

      const templates = readIpcResult(
        templatesResult as IpcResult<GraphicsTemplateSummary[]>,
        'No se pudo listar las plantillas de grafismo'
      )
      const nextState = readIpcResult(
        stateResult as IpcResult<GraphicsState>,
        'No se pudo obtener el estado del motor de grafismo'
      )

      setGraphicsTemplates(templates)
      setGraphicsState(nextState)
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido inicializando grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const refreshGraphicsSnapshot = useCallback(async (): Promise<void> => {
    try {
      const stateResult = (await window.openMix.graphics.getState()) as IpcResult<GraphicsState>
      const nextState = readIpcResult(
        stateResult,
        'No se pudo obtener el estado del motor de grafismo'
      )

      setGraphicsState(nextState)
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido actualizando el diagnóstico'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const refreshRecordingState = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.output.getRecordingState()) as IpcResult<OutputRecordingState>
      const nextState = readIpcResult(result, 'No se pudo obtener el estado de grabación')
      setRecordingState(nextState)
    } catch (err) {
      console.error('Error obteniendo el estado de grabación:', err)
    }
  }, [])

  const refreshRecordingSettings = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.output.getRecordingSettings()) as IpcResult<RecordingSettings>
      const nextSettings = readIpcResult(
        result,
        'No se pudo obtener la configuración persistida de grabación'
      )
      setRecordingSettings(nextSettings)
    } catch (err) {
      console.error('Error obteniendo la configuración de grabación:', err)
    }
  }, [])

  const refreshMonitorSettings = useCallback(async (): Promise<void> => {
    try {
      const result =
        (await window.openMix.mixer.getMonitorSettings()) as unknown as IpcResult<MixerMonitorSettings>
      const nextSettings = readIpcResult(
        result,
        'No se pudo obtener la configuración de monitorización'
      )
      setMonitorSettings(nextSettings)
    } catch (err) {
      console.error('Error obteniendo la configuración de monitorización:', err)
    }
  }, [])

  const handleStart = useCallback(async () => {
    try {
      await window.openMix.mixer.start()
      setIsRunning(true)
      setIsMediaPlaneActive(false)
      setPreviewMonitorStartSignal(0)
      setMultiviewMonitorStartSignal(0)
      await refreshMixerState()
    } catch (err) {
      console.error('Error iniciando mixer:', err)
    }
  }, [refreshMixerState])

  const handleStop = useCallback(async () => {
    try {
      await window.openMix.mixer.stop()
      setIsRunning(false)
      setIsMediaPlaneActive(false)
      setIsTransitionInProgress(false)
      setPreviewMonitorStartSignal(0)
      setMultiviewMonitorStartSignal(0)
    } catch (err) {
      console.error('Error deteniendo mixer:', err)
    }
  }, [])

  const handleCut = useCallback(async () => {
    try {
      const result = (await window.openMix.mixer.cut()) as {
        ok: boolean
        data?: {
          programSource: number
          previewSource: number
          isPipelinePlaying: boolean
          isTransitionInProgress: boolean
        }
      }

      if (result.ok && result.data) {
        setProgramSource(result.data.programSource)
        setPreviewSource(result.data.previewSource)
        setIsMediaPlaneActive(result.data.isPipelinePlaying)
        setIsTransitionInProgress(result.data.isTransitionInProgress)
      }
    } catch (err) {
      console.error('Error en CUT:', err)
    }
  }, [])

  const handleAutoTransition = useCallback(async () => {
    try {
      const result = (await window.openMix.mixer.autoTransition({
        transitionId: selectedTransitionId,
        durationMs: selectedTransitionDurationMs
      })) as {
        ok: boolean
        data?: {
          programSource: number
          previewSource: number
          sources: { index: number; name: string }[]
          isRunning: boolean
          isPipelinePlaying: boolean
          isTransitionInProgress: boolean
        }
      }

      if (result.ok && result.data) {
        applyMixerState(result.data)
      }
    } catch (err) {
      console.error('Error en AUTO:', err)
    }
  }, [applyMixerState, selectedTransitionDurationMs, selectedTransitionId])

  const handleSelectPreview = useCallback(async (index: number) => {
    try {
      await window.openMix.mixer.setPreviewSource(index)
      setPreviewSource(index)
    } catch (err) {
      console.error('Error cambiando preview:', err)
    }
  }, [])

  const handleAddGraphicsTemplate = useCallback(async (templateId: string) => {
    try {
      const result = (await window.openMix.graphics.addTemplate(
        templateId
      )) as IpcResult<GraphicsAddTemplateResult>
      const data = readIpcResult(result, `No se pudo añadir la plantilla ${templateId}`)
      setGraphicsState(data.state)
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido añadiendo grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const handleSelectGraphicsItem = useCallback(async (itemId: string) => {
    try {
      const result = (await window.openMix.graphics.selectItem(itemId)) as IpcResult<GraphicsState>
      setGraphicsState(readIpcResult(result, 'No se pudo seleccionar el grafismo'))
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido seleccionando grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const handleRemoveGraphicsItem = useCallback(async (itemId: string) => {
    try {
      const result = (await window.openMix.graphics.removeItem(itemId)) as IpcResult<GraphicsState>
      setGraphicsState(readIpcResult(result, 'No se pudo quitar el grafismo seleccionado'))
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido quitando grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const handleUpdateGraphicsField = useCallback(
    async (itemId: string, fieldId: string, value: string) => {
      try {
        const result = (await window.openMix.graphics.updateField(
          itemId,
          fieldId,
          value
        )) as IpcResult<GraphicsState>
        setGraphicsState(readIpcResult(result, `No se pudo actualizar el campo ${fieldId}`))
        setGraphicsStatusMessage(null)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido actualizando grafismo'
        setGraphicsStatusMessage(message)
      }
    },
    []
  )

  const handleSetGraphicsPlacement = useCallback((itemId: string, placement: GraphicsPlacement) => {
    void (async () => {
      try {
        const result = (await window.openMix.graphics.setPlacement(
          itemId,
          placement
        )) as IpcResult<GraphicsState>
        setGraphicsState(readIpcResult(result, 'No se pudo actualizar la posición del grafismo'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido moviendo grafismo'
        setGraphicsStatusMessage(message)
      }
    })()
  }, [])

  const handleSetOverlayTargets = useCallback((itemId: string, targets: GraphicsOverlayTargets) => {
    void (async () => {
      try {
        const result = (await window.openMix.graphics.setOverlayTargets(
          itemId,
          targets
        )) as IpcResult<GraphicsState>
        setGraphicsState(readIpcResult(result, 'No se pudo actualizar el ruteo del overlay'))
        setGraphicsStatusMessage(null)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido cambiando el overlay'
        setGraphicsStatusMessage(message)
      }
    })()
  }, [])

  const handleShowGraphicsItem = useCallback(async (itemId: string) => {
    try {
      const result = (await window.openMix.graphics.showItem(itemId)) as IpcResult<GraphicsState>
      setGraphicsState(readIpcResult(result, 'No se pudo activar el overlay'))
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido activando grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const handleHideGraphicsItem = useCallback(async (itemId: string) => {
    try {
      const result = (await window.openMix.graphics.hideItem(itemId)) as IpcResult<GraphicsState>
      setGraphicsState(readIpcResult(result, 'No se pudo ocultar el overlay'))
      setGraphicsStatusMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido ocultando grafismo'
      setGraphicsStatusMessage(message)
    }
  }, [])

  const handleChooseRecordingDirectory = useCallback(async () => {
    try {
      const result =
        (await window.openMix.output.chooseRecordingDirectory()) as IpcResult<RecordingDirectoryResult>
      const data = readIpcResult(result, 'No se pudo abrir el selector de carpeta')

      if (data.directory) {
        setRecordingSettings((currentSettings) => ({
          ...currentSettings,
          directory: data.directory
        }))
      }
    } catch (err) {
      console.error('Error seleccionando carpeta de grabación:', err)
    }
  }, [])

  const handleUseAutomaticRecordingDirectory = useCallback(() => {
    setRecordingSettings((currentSettings) => ({
      ...currentSettings,
      directory: null
    }))
  }, [])

  const handleResetRecordingSettings = useCallback(() => {
    setRecordingSettings({
      ...DEFAULT_RECORDING_SETTINGS
    })
  }, [])

  const handleSetRecordingContainer = useCallback((container: RecordingContainer) => {
    setRecordingSettings((currentSettings) => ({
      ...currentSettings,
      container
    }))
  }, [])

  const handleSetRecordingVideoPreset = useCallback((videoPreset: RecordingVideoPreset) => {
    setRecordingSettings((currentSettings) => ({
      ...currentSettings,
      videoPreset
    }))
  }, [])

  const handleSetRecordingQualityCrf = useCallback((qualityCrf: number) => {
    setRecordingSettings((currentSettings) => ({
      ...currentSettings,
      qualityCrf
    }))
  }, [])

  const handleToggleRecording = useCallback(async () => {
    try {
      const result =
        recordingState.status === 'recording' || recordingState.status === 'stopping'
          ? ((await window.openMix.output.stopRecording()) as IpcResult<OutputRecordingState>)
          : ((await window.openMix.output.startRecording({
              directory: recordingSettings.directory ?? undefined,
              container: recordingSettings.container,
              videoPreset: recordingSettings.videoPreset,
              qualityCrf: recordingSettings.qualityCrf
            })) as IpcResult<OutputRecordingState>)

      setRecordingState(readIpcResult(result, 'No se pudo cambiar el estado de grabación'))
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'No se pudo cambiar el estado de grabación'
      console.error('Error cambiando la grabación:', err)
      setRecordingState((currentState) => ({
        ...currentState,
        status: 'error',
        directory: currentState.directory ?? recordingSettings.directory ?? null,
        container: currentState.container ?? recordingSettings.container,
        lastError: errorMessage
      }))
    }
  }, [recordingSettings, recordingState.status])

  const handleSetMonitorResolution = useCallback((monitorResolution: MixerMonitorResolution) => {
    setMonitorSettings((currentSettings) => ({
      ...currentSettings,
      monitorResolution
    }))
  }, [])

  const handleResetMonitorSettings = useCallback(() => {
    setMonitorSettings({
      ...DEFAULT_MIXER_MONITOR_SETTINGS
    })
  }, [])

  const handleLocalVideoStarted = useCallback(() => {
    setIsMediaPlaneActive(true)
    setPreviewMonitorStartSignal((currentSignal) => (currentSignal === 0 ? 1 : currentSignal))
    setMultiviewMonitorStartSignal((currentSignal) => (currentSignal === 0 ? 1 : currentSignal))
  }, [])

  const {
    keyboardShortcutSettings,
    keyboardShortcutStatusMessage,
    activeShortcutCount,
    setShortcutCaptureActive,
    refreshKeyboardShortcutSettings,
    handleUpdateShortcutBinding,
    handleResetKeyboardShortcutDefaults
  } = useMixerKeyboardShortcuts({
    activeView,
    graphicsState,
    isRunning,
    isTransitionInProgress,
    numSources,
    previewSource,
    onAutoTransition: handleAutoTransition,
    onCut: handleCut,
    onHideGraphicsItem: handleHideGraphicsItem,
    onLocalVideoStarted: handleLocalVideoStarted,
    onSelectPreview: handleSelectPreview,
    onShowGraphicsItem: handleShowGraphicsItem
  })

  useEffect(() => {
    const unsubscribe = window.openMix.mixer.onBusMessage((msg) => {
      if (msg.type === 'error') {
        console.error('[GStreamer]', msg.message)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncInitialState = async (): Promise<void> => {
      try {
        if (cancelled) return
        await refreshMixerState()
        await refreshGraphicsState()
        await refreshKeyboardShortcutSettings()
        await refreshRecordingState()
        await refreshRecordingSettings()
        await refreshMonitorSettings()
        if (!cancelled) {
          setHasHydratedRecordingSettings(true)
          setHasHydratedMonitorSettings(true)
        }
      } catch (err) {
        console.error('Error obteniendo estado inicial de la aplicación:', err)
        if (!cancelled) {
          setHasHydratedRecordingSettings(true)
          setHasHydratedMonitorSettings(true)
        }
      }
    }

    void syncInitialState()

    return () => {
      cancelled = true
    }
  }, [
    refreshGraphicsState,
    refreshKeyboardShortcutSettings,
    refreshMixerState,
    refreshRecordingSettings,
    refreshRecordingState,
    refreshMonitorSettings
  ])

  useEffect(() => {
    let cancelled = false

    const syncPreviewMonitorTransport = async (): Promise<void> => {
      try {
        const result = (await window.openMix.mixer.getPreviewMonitorTransport()) as IpcResult<{
          transport: 'ipc' | 'webrtc'
          enabled: boolean
        }>
        const data = readIpcResult(result, 'No se pudo obtener el transporte de Preview')
        const surfaceResult =
          (await window.openMix.mixer.getMonitorSurfaceConfig()) as unknown as IpcResult<MixerMonitorSurfaceConfig>
        const surfaceConfig = readIpcResult(
          surfaceResult,
          'No se pudo obtener la superficie de monitores'
        )
        const targetsResult =
          (await window.openMix.mixer.getMonitorTargets()) as unknown as IpcResult<MixerMonitorTargets>
        const targets = readIpcResult(targetsResult, 'No se pudo obtener los monitores activos')
        if (!cancelled) {
          setPreviewMonitorTransport(data.enabled ? data.transport : 'ipc')
          setMonitorSurfaceConfig(surfaceConfig)
          setMonitorTargets(targets)
        }
      } catch (error) {
        console.error('Error obteniendo el transporte del monitor Preview:', error)
        if (!cancelled) {
          setPreviewMonitorTransport('ipc')
          setMonitorSurfaceConfig(defaultMonitorSurfaceConfig)
          setMonitorTargets(defaultMonitorTargets)
        }
      }
    }

    void syncPreviewMonitorTransport()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedRecordingSettings) {
      return
    }

    void window.openMix.output.updateRecordingSettings(recordingSettings).catch((error) => {
      console.error('Error guardando la configuración de grabación:', error)
    })
  }, [hasHydratedRecordingSettings, recordingSettings])

  useEffect(() => {
    if (!hasHydratedMonitorSettings) {
      return
    }

    void window.openMix.mixer.updateMonitorSettings(monitorSettings).catch((error) => {
      console.error('Error guardando la configuración de monitorización:', error)
    })
  }, [hasHydratedMonitorSettings, monitorSettings])

  useEffect(() => {
    const unsubscribe = window.openMix.sources.onPeerState((event) => {
      if (event.state === 'streaming') {
        setPreviewMonitorStartSignal((currentSignal) => currentSignal + 1)
        setIsMediaPlaneActive(true)
        /*
         * La multiview es un monitor WebRTC independiente del ruteo PVW/PGM.
         * Si la renegociamos cada vez que entra una cámara, el webrtcbin del
         * monitor puede quedarse negro justo durante el cambio de topología.
         * La arrancamos con la primera cámara y dejamos que el pipeline nativo
         * actualice sus mosaicos sin desmontar la conexión del navegador.
         */
        setMultiviewMonitorStartSignal((currentSignal) => (currentSignal === 0 ? 1 : currentSignal))
      }
      if (event.state === 'disconnected') {
        setPreviewMonitorStartSignal(0)
      }
      void refreshMixerState()
    })

    return unsubscribe
  }, [refreshMixerState])

  useEffect(() => {
    if (activeView !== 'graphics') {
      return
    }

    void refreshGraphicsSnapshot()

    const intervalId = window.setInterval(() => {
      void refreshGraphicsSnapshot()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [activeView, refreshGraphicsSnapshot])

  useEffect(() => {
    if (recordingState.status !== 'recording' && recordingState.status !== 'stopping') {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshRecordingState()
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [recordingState.status, refreshRecordingState])

  useEffect(() => {
    if (!isTransitionInProgress) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshMixerState()
    }, 120)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isTransitionInProgress, refreshMixerState])

  const monitorWorkspaceSize = {
    width: Math.max(0, mixerWorkspaceSize.width - mixerSidebarWidth - SIDEBAR_RESIZER_WIDTH),
    height: mixerWorkspaceSize.height
  }
  const multiviewLayout = resolveNativeMultiviewLayout(
    monitorWorkspaceSize.width,
    multiviewHeight,
    showGraphicsSlotInMultiview
  )
  const nativeMultiviewSize = multiviewLayout.native
  const graphicsMultiviewSize = multiviewLayout.graphics ?? nativeMultiviewSize

  useEffect(() => {
    const nextPreviewOutput =
      activeView === 'graphics'
        ? GRAPHICS_WORKSPACE_PREVIEW_OUTPUT
        : {
            enabled: false,
            width: 320,
            height: 180,
            maxFps: 30
          }

    void window.openMix.graphics.setPreviewOutput(nextPreviewOutput).catch((error) => {
      console.error('Error configurando la salida de preview de grafismo:', error)
    })
  }, [activeView])

  const subscribePgm = useCallback(
    (cb: (frame: { width: number; height: number; data: Uint8Array }) => void) =>
      window.openMix.mixer.onPgmFrame(cb),
    []
  )

  const subscribePvw = useCallback(
    (cb: (frame: { width: number; height: number; data: Uint8Array }) => void) =>
      window.openMix.mixer.onPvwFrame(cb),
    []
  )

  const subscribeGraphicsMixerFrame = useCallback(
    (cb: (frame: { width: number; height: number; data: Uint8Array }) => void) =>
      window.openMix.graphics.onMixerFrame(cb),
    []
  )

  const monitorCanvasSize = resolveMonitorCanvasSize(
    monitorWorkspaceSize,
    multiviewHeight,
    isRunning
  )
  const selectedGraphicsItem = getSelectedGraphicsItem(graphicsState)
  const audioReferenceSources = Array.from({ length: numSources }, (_, index) => ({
    index,
    name: sourceNames[index] ?? `Fuente ${index + 1}`
  }))
  const isCompactMixerControls = monitorCanvasSize.height < 280
  const graphicsSlot = showGraphicsSlotInMultiview ? (
    <div style={graphicsTileStyle}>
      <VideoCanvas
        width={graphicsMultiviewSize.width}
        height={graphicsMultiviewSize.height}
        onSubscribe={subscribeGraphicsMixerFrame}
        label={
          graphicsState.items.length === 0
            ? 'SIN GFX'
            : graphicsState.visibleItemCount > 0
              ? 'GFX ON'
              : 'GFX'
        }
        borderColor={graphicsState.visibleItemCount > 0 ? '#49a5b8' : '#5d6778'}
        showFps={false}
        backgroundColor={graphicsPreviewBackground === 'white' ? '#edf2f7' : '#05070a'}
        labelColor={graphicsPreviewBackground === 'white' ? '#18202c' : '#f8fafc'}
      />
      <div style={graphicsTileLabelStyle(graphicsState.visibleItemCount > 0)}>
        {selectedGraphicsItem
          ? selectedGraphicsItem.templateName
          : graphicsState.items.length > 0
            ? `${graphicsState.items.length} overlays`
            : 'Graphics'}
      </div>
    </div>
  ) : undefined
  const cutControls = (
    <MixerCutControls
      isCompact={isCompactMixerControls}
      isRunning={isRunning}
      isTransitionInProgress={isTransitionInProgress}
      numSources={numSources}
      previewSource={previewSource}
      programSource={programSource}
      selectedTransitionDurationMs={selectedTransitionDurationMs}
      selectedTransitionId={selectedTransitionId}
      sourceNames={sourceNames}
      onAutoTransition={handleAutoTransition}
      onCut={handleCut}
      onSelectPreview={handleSelectPreview}
      onSetTransitionDurationMs={setSelectedTransitionDurationMs}
      onSetTransitionId={setSelectedTransitionId}
    />
  )
  const combinedMonitorSize = {
    width: monitorCanvasSize.width * 2,
    height: monitorCanvasSize.height
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minWidth: 0,
        overflow: 'hidden',
        background: 'radial-gradient(circle at top left, #1f2937 0%, #0b1017 42%, #06090d 100%)'
      }}
    >
      <MixerAppHeader
        activeShortcutCount={activeShortcutCount}
        activeView={activeView}
        graphicsState={graphicsState}
        isRunning={isRunning}
        recordingSettings={recordingSettings}
        recordingState={recordingState}
        viewTabIndicator={viewTabIndicator}
        viewTabsRef={viewTabsRef}
        onRegisterViewTab={handleRegisterViewTab}
        onSelectView={setActiveView}
        onStart={handleStart}
        onStop={handleStop}
        onToggleRecording={handleToggleRecording}
      />

      <main
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          padding: '12px',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden'
        }}
      >
        <section
          ref={mixerWorkspaceRef}
          style={{
            ...workspaceStyle,
            display: activeView === 'mixer' ? 'flex' : 'none'
          }}
        >
          <div style={mixerDeskStyle}>
            <div style={primaryMixerColumnStyle}>
              <MixerMonitorPanel
                combinedMonitorSize={combinedMonitorSize}
                cutControls={cutControls}
                isRunning={isRunning}
                isVisible={isRunning && activeView === 'mixer'}
                monitorCanvasSize={monitorCanvasSize}
                monitorSurfaceConfig={monitorSurfaceConfig}
                monitorTargets={monitorTargets}
                previewMonitorTransport={previewMonitorTransport}
                startSignal={previewMonitorStartSignal}
                onSubscribePgm={subscribePgm}
                onSubscribePvw={subscribePvw}
              />

              <div
                style={multiviewResizerStyle}
                onPointerDown={handleMultiviewResizeStart}
                onPointerMove={handleMultiviewResizeMove}
                onPointerUp={handleMultiviewResizeEnd}
                onPointerCancel={handleMultiviewResizeEnd}
                onDoubleClick={resetMultiviewHeight}
                title="Arrastra para redimensionar la tira de multiview"
              >
                <div style={multiviewResizerGripStyle} />
              </div>

              <MixerMultiviewPanel
                graphicsSlot={graphicsSlot}
                height={multiviewHeight}
                isMediaPlaneActive={isMediaPlaneActive}
                isRunning={isRunning}
                isTransitionInProgress={isTransitionInProgress}
                isVisible={isRunning && activeView === 'mixer'}
                monitorSurfaceConfig={monitorSurfaceConfig}
                monitorTargets={monitorTargets}
                nativeSize={nativeMultiviewSize}
                numSources={numSources}
                previewSource={previewSource}
                programSource={programSource}
                showGraphicsSlot={showGraphicsSlotInMultiview}
                sourceNames={sourceNames}
                startSignal={multiviewMonitorStartSignal}
                onSelectPreview={handleSelectPreview}
                onToggleGraphicsSlot={() =>
                  setShowGraphicsSlotInMultiview((currentValue) => !currentValue)
                }
              />
            </div>

            <MixerSidebar
              graphicsState={graphicsState}
              isRunning={isRunning}
              panelHeights={sidebarPanelHeights}
              sidebarWidth={mixerSidebarWidth}
              sourceNames={sourceNames}
              onHideGraphicsItem={handleHideGraphicsItem}
              onLocalVideoStarted={handleLocalVideoStarted}
              onResetGraphicsHeight={resetGraphicsSidebarHeight}
              onResetLocalVideoHeight={resetLocalVideoSidebarHeight}
              onResetSidebarWidth={resetSidebarWidth}
              onSelectGraphicsItem={handleSelectGraphicsItem}
              onShowGraphicsItem={handleShowGraphicsItem}
              onSidebarResizeEnd={handleSidebarResizeEnd}
              onSidebarResizeMove={handleSidebarResizeMove}
              onSidebarResizeStart={handleSidebarResizeStart}
              onSidebarSectionResizeEnd={handleSidebarSectionResizeEnd}
              onSidebarSectionResizeMove={handleSidebarSectionResizeMove}
              onSidebarSectionResizeStart={handleSidebarSectionResizeStart}
              onSourcesChanged={refreshMixerState}
            />
          </div>
        </section>

        <section
          style={{
            ...graphicsWorkspaceStyle,
            display: activeView === 'graphics' ? 'flex' : 'none'
          }}
        >
          <GraphicsPanel
            mode="workspace"
            templates={graphicsTemplates}
            graphicsState={graphicsState}
            previewBackground={graphicsPreviewBackground}
            statusMessage={graphicsStatusMessage}
            onSelectPreviewBackground={setGraphicsPreviewBackground}
            onAddTemplate={handleAddGraphicsTemplate}
            onSelectItem={handleSelectGraphicsItem}
            onRemoveItem={handleRemoveGraphicsItem}
            onUpdateField={handleUpdateGraphicsField}
            onSetPlacement={handleSetGraphicsPlacement}
            onSetOverlayTargets={handleSetOverlayTargets}
            onShowItem={handleShowGraphicsItem}
            onHideItem={handleHideGraphicsItem}
          />
        </section>

        <section
          style={{
            ...workspaceStyle,
            display: activeView === 'audio' ? 'flex' : 'none',
            overflowY: 'auto',
            gap: '24px',
            padding: '24px'
          }}
        >
          <AudioPanel
            referenceEnabled={monitorSurfaceConfig.mode === 'native'}
            isMixerRunning={isRunning && activeView === 'audio'}
            referenceStartSignal={activeView === 'audio' ? previewMonitorStartSignal : 0}
            referenceSources={audioReferenceSources}
            selectedReferenceSource={previewSource}
            onSelectReferenceSource={(sourceIndex) => void handleSelectPreview(sourceIndex)}
          />
        </section>

        <section
          style={{
            ...workspaceStyle,
            display: activeView === 'shortcuts' ? 'flex' : 'none',
            overflowY: 'auto',
            gap: '24px',
            padding: '24px'
          }}
        >
          <KeyboardShortcutsPanel
            settings={keyboardShortcutSettings}
            statusMessage={keyboardShortcutStatusMessage}
            onCaptureStateChange={setShortcutCaptureActive}
            onUpdateBinding={handleUpdateShortcutBinding}
            onResetDefaults={handleResetKeyboardShortcutDefaults}
          />
        </section>

        <section
          style={{
            ...workspaceStyle,
            display: activeView === 'options' ? 'flex' : 'none',
            overflowY: 'auto',
            overflowX: 'hidden',
            gap: '24px',
            padding: '24px',
            boxSizing: 'border-box'
          }}
        >
          <MonitorSettingsPanel
            isRunning={isRunning}
            monitorResolution={monitorSettings.monitorResolution}
            onSetMonitorResolution={handleSetMonitorResolution}
            onResetMonitorSettings={handleResetMonitorSettings}
          />

          <RecordingOptionsPanel
            settings={recordingSettings}
            recordingState={recordingState}
            onSelectDirectory={handleChooseRecordingDirectory}
            onUseAutomaticDirectory={handleUseAutomaticRecordingDirectory}
            onResetDefaults={handleResetRecordingSettings}
            onSetContainer={handleSetRecordingContainer}
            onSetVideoPreset={handleSetRecordingVideoPreset}
            onSetQualityCrf={handleSetRecordingQualityCrf}
          />
        </section>
      </main>
    </div>
  )
}
