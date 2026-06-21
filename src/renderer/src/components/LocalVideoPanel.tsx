/**
 * LocalVideoPanel — Carga de ficheros locales como fuentes pinchables.
 *
 * La UI no reproduce el vídeo. Solo envía ruta + slot al Main Process; la
 * decodificación ocurre en GStreamer para respetar el plano de media.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ChooseLocalVideoResult,
  LocalVideoSourceInfo,
  LocalVideoSourceIndex
} from '../../../shared/ipc/source-contracts'
import TransientStatusToast from './TransientStatusToast'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

interface LocalVideoPanelProps {
  isRunning: boolean
  sourceNames: string[]
  onSourcesChanged: () => Promise<void> | void
  onLocalVideoStarted: () => void
}

const LOCAL_VIDEO_SLOTS: LocalVideoSourceIndex[] = [1, 2, 3]

export default function LocalVideoPanel({
  isRunning,
  sourceNames,
  onSourcesChanged,
  onLocalVideoStarted
}: LocalVideoPanelProps): React.JSX.Element {
  const [selectedSlot, setSelectedSlot] = useState<LocalVideoSourceIndex>(1)
  const [pendingFile, setPendingFile] = useState<ChooseLocalVideoResult['file'] | null>(null)
  const [localVideos, setLocalVideos] = useState<LocalVideoSourceInfo[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const occupiedSlots = useMemo(
    () => new Set(localVideos.map((source) => source.sourceIndex)),
    [localVideos]
  )

  const refreshLocalVideos = useCallback(async (): Promise<void> => {
    const result = (await window.openMix.sources.listLocalVideos()) as IpcResult<
      LocalVideoSourceInfo[]
    >
    if (result.ok) {
      setLocalVideos(result.data)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.openMix.sources.onLocalVideosChanged((sources) => {
      if (!cancelled) {
        setLocalVideos(sources)
      }
    })
    const timeoutId = window.setTimeout(() => {
      void window.openMix.sources
        .listLocalVideos()
        .then((result) => {
          const parsedResult = result as IpcResult<LocalVideoSourceInfo[]>
          if (!cancelled && parsedResult.ok) {
            setLocalVideos(parsedResult.data)
          }
        })
        .catch(() => undefined)
    }, 0)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearTimeout(timeoutId)
    }
  }, [])

  const handleChooseFile = useCallback(async (): Promise<void> => {
    setIsBusy(true)
    try {
      const result =
        (await window.openMix.sources.chooseLocalVideo()) as IpcResult<ChooseLocalVideoResult>
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      if (!result.data.canceled) {
        setPendingFile(result.data.file)
        setStatusMessage(null)
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo elegir el vídeo')
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleLoadFile = useCallback(async (): Promise<void> => {
    if (!pendingFile) {
      setStatusMessage('Selecciona primero un fichero de vídeo')
      return
    }

    setIsBusy(true)
    try {
      const result = (await window.openMix.sources.loadLocalVideo({
        sourceIndex: selectedSlot,
        filePath: pendingFile.path
      })) as IpcResult<LocalVideoSourceInfo>
      if (!result.ok) {
        throw new Error(result.error.message)
      }

      setPendingFile(null)
      setStatusMessage(`${result.data.name} cargado en pausa en fuente ${result.data.sourceIndex}`)
      await refreshLocalVideos()
      await onSourcesChanged()
      onLocalVideoStarted()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo cargar el vídeo')
    } finally {
      setIsBusy(false)
    }
  }, [onLocalVideoStarted, onSourcesChanged, pendingFile, refreshLocalVideos, selectedSlot])

  const handleClearSlot = useCallback(
    async (sourceIndex: number): Promise<void> => {
      setIsBusy(true)
      try {
        const result = (await window.openMix.sources.clearLocalVideo(sourceIndex)) as IpcResult<
          LocalVideoSourceInfo[]
        >
        if (!result.ok) {
          throw new Error(result.error.message)
        }

        setLocalVideos(result.data)
        setStatusMessage(`Fuente ${sourceIndex} liberada`)
        await onSourcesChanged()
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'No se pudo liberar la fuente')
      } finally {
        setIsBusy(false)
      }
    },
    [onSourcesChanged]
  )

  const handleRestartSlot = useCallback(
    async (sourceIndex: number): Promise<void> => {
      setIsBusy(true)
      try {
        const result = (await window.openMix.sources.restartLocalVideo(
          sourceIndex
        )) as IpcResult<LocalVideoSourceInfo>
        if (!result.ok) {
          throw new Error(result.error.message)
        }

        setLocalVideos((currentSources) =>
          currentSources.map((currentSource) =>
            currentSource.sourceIndex === result.data.sourceIndex ? result.data : currentSource
          )
        )
        setStatusMessage(`${result.data.name} reiniciado en pausa`)
        onLocalVideoStarted()
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'No se pudo reiniciar el vídeo')
      } finally {
        setIsBusy(false)
      }
    },
    [onLocalVideoStarted]
  )

  const handleTogglePauseSlot = useCallback(
    async (source: LocalVideoSourceInfo): Promise<void> => {
      setIsBusy(true)
      try {
        const paused = source.playbackState !== 'paused'
        const result = (await window.openMix.sources.setLocalVideoPaused({
          sourceIndex: source.sourceIndex,
          paused
        })) as IpcResult<LocalVideoSourceInfo>
        if (!result.ok) {
          throw new Error(result.error.message)
        }

        setLocalVideos((currentSources) =>
          currentSources.map((currentSource) =>
            currentSource.sourceIndex === result.data.sourceIndex ? result.data : currentSource
          )
        )
        setStatusMessage(`${result.data.name} ${paused ? 'pausado' : 'reanudado'}`)
        if (!paused) {
          onLocalVideoStarted()
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : 'No se pudo cambiar la pausa')
      } finally {
        setIsBusy(false)
      }
    },
    [onLocalVideoStarted]
  )

  const handleToggleLoopSlot = useCallback(async (source: LocalVideoSourceInfo): Promise<void> => {
    setIsBusy(true)
    try {
      const loop = !source.loop
      const result = (await window.openMix.sources.setLocalVideoLoop({
        sourceIndex: source.sourceIndex,
        loop
      })) as IpcResult<LocalVideoSourceInfo>
      if (!result.ok) {
        throw new Error(result.error.message)
      }

      setLocalVideos((currentSources) =>
        currentSources.map((currentSource) =>
          currentSource.sourceIndex === result.data.sourceIndex ? result.data : currentSource
        )
      )
      setStatusMessage(`${result.data.name} loop ${loop ? 'activado' : 'desactivado'}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo cambiar el loop')
    } finally {
      setIsBusy(false)
    }
  }, [])

  const handleToggleAutoPlaySlot = useCallback(
    async (source: LocalVideoSourceInfo): Promise<void> => {
      setIsBusy(true)
      try {
        const autoPlayOnProgram = !source.autoPlayOnProgram
        const result = (await window.openMix.sources.setLocalVideoAutoPlay({
          sourceIndex: source.sourceIndex,
          autoPlayOnProgram
        })) as IpcResult<LocalVideoSourceInfo>
        if (!result.ok) {
          throw new Error(result.error.message)
        }

        setLocalVideos((currentSources) =>
          currentSources.map((currentSource) =>
            currentSource.sourceIndex === result.data.sourceIndex ? result.data : currentSource
          )
        )
        setStatusMessage(
          `${result.data.name} auto Program ${autoPlayOnProgram ? 'activado' : 'desactivado'}`
        )
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : 'No se pudo cambiar el auto Program'
        )
      } finally {
        setIsBusy(false)
      }
    },
    []
  )

  return (
    <div style={panelStyle}>
      <div style={controlRowStyle}>
        <select
          className="openmix-select"
          value={selectedSlot}
          disabled={!isRunning || isBusy}
          onChange={(event) => setSelectedSlot(Number(event.target.value) as LocalVideoSourceIndex)}
          style={selectStyle}
          title="Slot del mixer donde se cargará el fichero"
        >
          {LOCAL_VIDEO_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              Fuente {slot + 1}
              {occupiedSlots.has(slot) ? ' · vídeo' : ''}
            </option>
          ))}
        </select>
        <button
          className="openmix-control-button"
          type="button"
          onClick={handleChooseFile}
          disabled={!isRunning || isBusy}
          style={secondaryButtonStyle(!isRunning || isBusy)}
        >
          Elegir
        </button>
      </div>

      {pendingFile && (
        <div style={pendingFileStyle} title={pendingFile.path}>
          <span style={pendingNameStyle}>{pendingFile.name}</span>
          <button
            className="openmix-control-button"
            type="button"
            onClick={handleLoadFile}
            disabled={!isRunning || isBusy}
            style={primaryButtonStyle(!isRunning || isBusy)}
          >
            Cargar
          </button>
        </div>
      )}

      <div style={loadedListStyle}>
        {LOCAL_VIDEO_SLOTS.map((slot) => {
          const loadedVideo = localVideos.find((source) => source.sourceIndex === slot)
          return (
            <div key={slot} className="openmix-interactive-row" style={slotRowStyle}>
              <span style={slotLabelStyle}>
                <strong>F{slot + 1}</strong>
                <span style={slotNameStyle}>
                  {loadedVideo?.name ?? sourceNames[slot] ?? `Cam ${slot}`}
                </span>
              </span>
              {loadedVideo ? (
                <span style={slotActionGroupStyle}>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => void handleTogglePauseSlot(loadedVideo)}
                    disabled={isBusy}
                    style={playbackButtonStyle(isBusy, loadedVideo.playbackState !== 'paused')}
                    title={
                      loadedVideo.playbackState === 'paused'
                        ? 'Reanudar reproducción'
                        : 'Pausar reproducción'
                    }
                  >
                    {loadedVideo.playbackState === 'paused' ? '▶' : '⏸'}
                  </button>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => void handleRestartSlot(slot)}
                    disabled={isBusy}
                    style={restartButtonStyle(isBusy)}
                    title="Reproducir desde el principio"
                  >
                    ↺
                  </button>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => void handleToggleLoopSlot(loadedVideo)}
                    disabled={isBusy}
                    style={loopButtonStyle(isBusy, loadedVideo.loop)}
                    title={loadedVideo.loop ? 'Desactivar loop' : 'Activar loop'}
                  >
                    ∞
                  </button>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => void handleToggleAutoPlaySlot(loadedVideo)}
                    disabled={isBusy}
                    style={autoPlayButtonStyle(isBusy, loadedVideo.autoPlayOnProgram)}
                    title={
                      loadedVideo.autoPlayOnProgram
                        ? 'Desactivar autoplay al entrar en Program'
                        : 'Activar autoplay al entrar en Program y pausa al salir'
                    }
                  >
                    AUTO
                  </button>
                  <button
                    className="openmix-control-button"
                    type="button"
                    onClick={() => void handleClearSlot(slot)}
                    disabled={isBusy}
                    style={clearButtonStyle(isBusy)}
                    title="Liberar slot"
                  >
                    Quitar
                  </button>
                </span>
              ) : (
                <span style={freeSlotStyle}>libre</span>
              )}
            </div>
          )
        })}
      </div>

      {!isRunning && <div style={hintStyle}>Inicia el mixer para cargar ficheros.</div>}
      <TransientStatusToast message={statusMessage} placement="bottom-left" />
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden'
}

const controlRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '8px',
  flexShrink: 0
}

const selectStyle: React.CSSProperties = {
  minWidth: 0,
  backgroundColor: '#101722',
  color: '#e6edf7',
  border: '1px solid rgba(124, 145, 173, 0.26)',
  borderRadius: '7px',
  padding: '8px',
  fontSize: '12px'
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(80, 190, 130, 0.38)',
    backgroundColor: disabled ? '#23342b' : '#146c43',
    color: '#e8fff2',
    borderRadius: '7px',
    padding: '7px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 700,
    fontSize: '12px'
  }
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(124, 145, 173, 0.26)',
    backgroundColor: disabled ? '#202632' : '#202a38',
    color: '#d8e2f0',
    borderRadius: '7px',
    padding: '7px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 700,
    fontSize: '12px'
  }
}

function clearButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(224, 85, 85, 0.28)',
    backgroundColor: disabled ? '#332020' : '#4a2020',
    color: '#ffd4d4',
    borderRadius: '7px',
    padding: '5px 8px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '11px',
    fontWeight: 700
  }
}

function playbackButtonStyle(disabled: boolean, isPlaying: boolean): React.CSSProperties {
  return {
    width: '28px',
    height: '26px',
    border: '1px solid rgba(80, 190, 130, 0.34)',
    backgroundColor: disabled ? '#203026' : isPlaying ? '#164d32' : '#263244',
    color: '#ddffe9',
    borderRadius: '7px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1
  }
}

function restartButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '28px',
    height: '26px',
    border: '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : '#263244',
    color: '#d8e2f0',
    borderRadius: '7px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: 1
  }
}

function loopButtonStyle(disabled: boolean, enabled: boolean): React.CSSProperties {
  return {
    width: '28px',
    height: '26px',
    border: enabled ? '1px solid rgba(80, 190, 130, 0.46)' : '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : enabled ? '#14532d' : '#263244',
    color: enabled ? '#ddffe9' : '#d8e2f0',
    borderRadius: '7px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: 1
  }
}

function autoPlayButtonStyle(disabled: boolean, enabled: boolean): React.CSSProperties {
  return {
    width: '42px',
    height: '26px',
    border: enabled ? '1px solid rgba(80, 190, 130, 0.46)' : '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : enabled ? '#14532d' : '#263244',
    color: enabled ? '#ddffe9' : '#d8e2f0',
    borderRadius: '6px',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '10px',
    fontWeight: 800,
    lineHeight: 1
  }
}

const pendingFileStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '8px',
  alignItems: 'center',
  padding: '8px',
  backgroundColor: 'rgba(20, 108, 67, 0.14)',
  border: '1px solid rgba(80, 190, 130, 0.26)',
  borderRadius: '7px'
}

const pendingNameStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '12px',
  color: '#d8f8e5'
}

const loadedListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  minHeight: 0,
  flex: '1 1 auto',
  overflowX: 'hidden',
  overflowY: 'auto'
}

const slotRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '8px',
  alignItems: 'center',
  minHeight: '30px',
  padding: '6px 8px',
  backgroundColor: 'rgba(7, 11, 18, 0.38)',
  border: '1px solid rgba(124, 145, 173, 0.12)',
  borderRadius: '7px'
}

const slotLabelStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  gap: '7px',
  alignItems: 'center',
  color: '#d8e2f0',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums'
}

const slotNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const slotActionGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '6px',
  flexWrap: 'wrap'
}

const freeSlotStyle: React.CSSProperties = {
  color: '#7e8ba0',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em'
}

const hintStyle: React.CSSProperties = {
  color: '#8794a8',
  fontSize: '11px'
}
