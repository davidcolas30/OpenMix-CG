/**
 * SourceGrid — Grid de miniaturas de fuentes con thumbnails en vivo.
 *
 * Muestra las fuentes del mixer como miniaturas clicables.
 * Cada miniatura tiene un canvas que renderiza frames en vivo
 * del thumbnail de esa fuente (320×180 BGRA, ~8fps).
 *
 * Al hacer clic en una miniatura, esa fuente se selecciona como Preview.
 * La fuente actualmente en PGM tiene borde rojo, la de PVW tiene borde verde.
 */

import { useRef, useEffect, useCallback } from 'react'

interface SourceGridProps {
  /** Índice de la fuente actualmente en Program */
  programSource: number
  /** Índice de la fuente actualmente en Preview */
  previewSource: number
  /** Callback cuando el usuario selecciona una fuente para Preview */
  onSelectPreview: (index: number) => void
  /** Número total de fuentes */
  numSources: number
  /** Nombres descriptivos reales de las fuentes del mixer */
  sourceNames: string[]
  /** Tamaño CSS de las miniaturas dentro de la tira de multiview */
  thumbnailWidth?: number
  thumbnailHeight?: number
  /** Slot adicional opcional para vistas auxiliares como graphics */
  extraSlot?: React.ReactNode
}

/**
 * Convierte BGRA a RGBA in-place.
 */
function bgraToRgba(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const b = data[i]
    data[i] = data[i + 2]
    data[i + 2] = b
  }
}

/**
 * Componente individual de miniatura de una fuente.
 * Renderiza frames del thumbnail en un canvas propio.
 */
function SourceThumbnail({
  sourceIndex,
  name,
  isPgm,
  isPvw,
  thumbnailWidth,
  thumbnailHeight,
  onClick
}: {
  sourceIndex: number
  name: string
  isPgm: boolean
  isPvw: boolean
  thumbnailWidth: number
  thumbnailHeight: number
  onClick: () => void
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const reusableImageDataRef = useRef<ImageData | null>(null)
  const reusableRgbaBytesRef = useRef<Uint8ClampedArray | null>(null)
  const pendingFrameRef = useRef<{
    sourceIndex: number
    width: number
    height: number
    data: Uint8Array
  } | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const schedulePaintRef = useRef<() => void>(() => undefined)

  /**
   * Función que recibe un frame de thumbnail y lo pinta en el canvas.
   * Solo pinta si el sourceIndex del frame coincide con esta miniatura.
   */
  const paintFrame = useCallback(
    (frame: { sourceIndex: number; width: number; height: number; data: Uint8Array }) => {
      if (frame.sourceIndex !== sourceIndex) return

      const canvas = canvasRef.current
      if (!canvas) return

      if (!contextRef.current) {
        contextRef.current = canvas.getContext('2d')
      }

      const ctx = contextRef.current
      if (!ctx) return

      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width
        canvas.height = frame.height
        reusableImageDataRef.current = null
        reusableRgbaBytesRef.current = null
      }

      if (!reusableImageDataRef.current || !reusableRgbaBytesRef.current) {
        const rgbaBytes = new Uint8ClampedArray(frame.width * frame.height * 4)
        reusableRgbaBytesRef.current = rgbaBytes
        reusableImageDataRef.current = new ImageData(rgbaBytes, frame.width, frame.height)
      }

      reusableRgbaBytesRef.current.set(frame.data)
      bgraToRgba(reusableRgbaBytesRef.current)
      ctx.putImageData(reusableImageDataRef.current, 0, 0)
    },
    [sourceIndex]
  )

  const schedulePaint = useCallback(() => {
    if (rafIdRef.current !== null) {
      return
    }

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null
      const frame = pendingFrameRef.current
      if (!frame) {
        return
      }

      pendingFrameRef.current = null
      paintFrame(frame)

      if (pendingFrameRef.current) {
        schedulePaintRef.current()
      }
    })
  }, [paintFrame])

  useEffect(() => {
    schedulePaintRef.current = schedulePaint
  }, [schedulePaint])

  const handleFrame = useCallback(
    (frame: { sourceIndex: number; width: number; height: number; data: Uint8Array }) => {
      if (frame.sourceIndex !== sourceIndex) return
      pendingFrameRef.current = frame
      schedulePaint()
    },
    [schedulePaint, sourceIndex]
  )

  /**
   * Suscribirse al canal de thumbnails de fuentes.
   * Todos los thumbnails llegan por el mismo canal, cada uno con sourceIndex.
   * Este componente solo pinta los frames de su sourceIndex.
   */
  useEffect(() => {
    const unsubscribe = window.openMix.mixer.onSourceFrame(handleFrame)

    return (): void => {
      unsubscribe()
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      contextRef.current = null
      reusableImageDataRef.current = null
      reusableRgbaBytesRef.current = null
      pendingFrameRef.current = null
    }
  }, [handleFrame])

  // Determinar el color del borde según el estado
  let borderColor = '#444'
  if (isPgm)
    borderColor = '#e53935' // rojo para PGM
  else if (isPvw) borderColor = '#43a047' // verde para PVW

  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: `2px solid ${borderColor}`,
        borderRadius: '4px',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease'
      }}
      title={`${name} — Clic para seleccionar como Preview`}
    >
      <canvas
        ref={canvasRef}
        width={320}
        height={180}
        style={{
          display: 'block',
          width: `${thumbnailWidth}px`,
          height: `${thumbnailHeight}px`,
          backgroundColor: '#111'
        }}
      />
      {/* Etiqueta con número y nombre de la fuente */}
      <div
        style={{
          padding: '2px 6px',
          backgroundColor: isPgm ? '#c62828' : isPvw ? '#2e7d32' : '#222',
          color: '#fff',
          fontSize: '11px',
          fontFamily: 'monospace',
          textAlign: 'center',
          transition: 'background-color 0.15s ease'
        }}
      >
        {sourceIndex + 1}: {name}
        {isPgm && ' [PGM]'}
        {isPvw && ' [PVW]'}
      </div>
    </div>
  )
}

export default function SourceGrid({
  programSource,
  previewSource,
  onSelectPreview,
  numSources,
  sourceNames,
  thumbnailWidth = 160,
  thumbnailHeight = 90,
  extraSlot
}: SourceGridProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexWrap: 'wrap'
      }}
    >
      {Array.from({ length: numSources }, (_, i) => (
        <SourceThumbnail
          key={i}
          sourceIndex={i}
          name={sourceNames[i] || `Fuente ${i + 1}`}
          isPgm={i === programSource}
          isPvw={i === previewSource}
          thumbnailWidth={thumbnailWidth}
          thumbnailHeight={thumbnailHeight}
          onClick={() => onSelectPreview(i)}
        />
      ))}
      {extraSlot}
    </div>
  )
}
