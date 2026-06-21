/**
 * VideoCanvas — Componente React reutilizable que muestra frames de vídeo en un <canvas>.
 *
 * Fase 2: Se usa para PGM, PVW y thumbnails del mixer.
 *
 * ¿Cómo funciona?
 * 1. Recibe un callback onSubscribe que conecta al canal de frames apropiado
 * 2. Cada frame llega como { width, height, data: Uint8Array, format? }
 * 3. Para monitores PGM/PVW intenta pintar I420 con VideoFrame/WebCodecs
 * 4. Si llega BGRA/RGBA o WebCodecs no está disponible, pinta vía ImageData
 *
 * ¿Por qué es reutilizable?
 * En vez de suscribirse directamente a un canal IPC específico,
 * recibe una función onSubscribe que devuelve la función de cleanup.
 * Así el mismo componente sirve para PGM, PVW y thumbnails:
 * cada uno le pasa un onSubscribe que conecta al canal correcto.
 */

import { useRef, useEffect, useState, useCallback } from 'react'

const IS_LITTLE_ENDIAN = (() => {
  const buffer = new ArrayBuffer(4)
  new Uint32Array(buffer)[0] = 0x01020304
  return new Uint8Array(buffer)[0] === 0x04
})()

interface VideoFrameData {
  width: number
  height: number
  format?: 'BGRA' | 'RGBA' | 'I420' | string
  data: Uint8Array
}

interface VideoCanvasProps {
  /** Ancho del canvas en píxeles CSS */
  width?: number
  /** Alto del canvas en píxeles CSS */
  height?: number
  /**
   * Función que suscribe al componente a frames de vídeo.
   * Recibe un callback de frame y devuelve una función de cleanup.
   */
  onSubscribe: (callback: (frame: VideoFrameData) => void) => () => void
  /** Mostrar indicador de FPS (por defecto true) */
  showFps?: boolean
  /** Etiqueta superpuesta (ej: "PGM", "PVW", "CAM 1") */
  label?: string
  /** Color del borde (ej: "red" para PGM, "green" para PVW) */
  borderColor?: string
  /** Fondo del canvas cuando no hay señal o debajo del alpha */
  backgroundColor?: string
  /** Color del rótulo superpuesto */
  labelColor?: string
  /** Color del contador de FPS */
  fpsColor?: string
}

/**
 * Copia un frame a un raster RGBA reutilizable.
 *
 * El cuello medido en el panel no está en recibir el frame sino en
 * pintarlo. Para aliviar ese camino evitamos crear un Uint8ClampedArray
 * y un ImageData nuevos en cada frame. Si GStreamer ya entrega RGBA,
 * copiamos directo; si entrega BGRA, intercambiamos B↔R.
 */
function copyBgraToReusableRgba(
  sourceBytes: Uint8Array,
  targetBytes: Uint8ClampedArray,
  targetWords: Uint32Array
): void {
  if (IS_LITTLE_ENDIAN && sourceBytes.byteOffset % 4 === 0 && sourceBytes.byteLength % 4 === 0) {
    const sourceWords = new Uint32Array(
      sourceBytes.buffer,
      sourceBytes.byteOffset,
      sourceBytes.byteLength / 4
    )

    for (let i = 0; i < sourceWords.length; i++) {
      const pixel = sourceWords[i]
      targetWords[i] =
        (pixel & 0xff00ff00) | ((pixel & 0x00ff0000) >>> 16) | ((pixel & 0x000000ff) << 16)
    }

    return
  }

  for (let i = 0; i < sourceBytes.length; i += 4) {
    targetBytes[i] = sourceBytes[i + 2]
    targetBytes[i + 1] = sourceBytes[i + 1]
    targetBytes[i + 2] = sourceBytes[i]
    targetBytes[i + 3] = sourceBytes[i + 3]
  }
}

function copyI420ToReusableRgba(
  sourceBytes: Uint8Array,
  targetBytes: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const yPlaneSize = width * height
  const chromaWidth = Math.ceil(width / 2)
  const chromaHeight = Math.ceil(height / 2)
  const uPlaneOffset = yPlaneSize
  const vPlaneOffset = uPlaneOffset + chromaWidth * chromaHeight

  let outputIndex = 0
  for (let y = 0; y < height; y++) {
    const yRowOffset = y * width
    const chromaRowOffset = Math.floor(y / 2) * chromaWidth

    for (let x = 0; x < width; x++) {
      const luma = sourceBytes[yRowOffset + x]
      const chromaIndex = chromaRowOffset + Math.floor(x / 2)
      const u = sourceBytes[uPlaneOffset + chromaIndex] - 128
      const v = sourceBytes[vPlaneOffset + chromaIndex] - 128

      const r = luma + 1.402 * v
      const g = luma - 0.344136 * u - 0.714136 * v
      const b = luma + 1.772 * u

      targetBytes[outputIndex] = Math.max(0, Math.min(255, r))
      targetBytes[outputIndex + 1] = Math.max(0, Math.min(255, g))
      targetBytes[outputIndex + 2] = Math.max(0, Math.min(255, b))
      targetBytes[outputIndex + 3] = 255
      outputIndex += 4
    }
  }
}

export default function VideoCanvas({
  width = 640,
  height = 360,
  onSubscribe,
  showFps = true,
  label,
  borderColor,
  backgroundColor = '#000',
  labelColor,
  fpsColor = '#0f0'
}: VideoCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const reusableImageDataRef = useRef<ImageData | null>(null)
  const reusableRgbaBytesRef = useRef<Uint8ClampedArray | null>(null)
  const reusableRgbaWordsRef = useRef<Uint32Array | null>(null)
  const [receivedFps, setReceivedFps] = useState(0)
  const [renderedFps, setRenderedFps] = useState(0)
  const [skippedFrames, setSkippedFrames] = useState(0)
  const receivedFrameCountRef = useRef(0)
  const renderedFrameCountRef = useRef(0)
  const overwrittenPendingFrameCountRef = useRef(0)
  const pendingFrameRef = useRef<VideoFrameData | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const schedulePaintRef = useRef<() => void>(() => undefined)

  const getCanvasResources = useCallback((frameWidth: number, frameHeight: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    if (!contextRef.current) {
      contextRef.current = canvas.getContext('2d')
    }

    const ctx = contextRef.current
    if (!ctx) return null

    const needsResize = canvas.width !== frameWidth || canvas.height !== frameHeight
    if (needsResize) {
      canvas.width = frameWidth
      canvas.height = frameHeight
      reusableImageDataRef.current = null
      reusableRgbaBytesRef.current = null
      reusableRgbaWordsRef.current = null
    }

    if (
      !reusableImageDataRef.current ||
      !reusableRgbaBytesRef.current ||
      !reusableRgbaWordsRef.current
    ) {
      const rgbaBytes = new Uint8ClampedArray(frameWidth * frameHeight * 4)
      reusableRgbaBytesRef.current = rgbaBytes
      reusableRgbaWordsRef.current = new Uint32Array(rgbaBytes.buffer)
      reusableImageDataRef.current = new ImageData(rgbaBytes, frameWidth, frameHeight)
    }

    return {
      ctx,
      imageData: reusableImageDataRef.current,
      rgbaBytes: reusableRgbaBytesRef.current,
      rgbaWords: reusableRgbaWordsRef.current
    }
  }, [])

  const paintFrame = useCallback(
    (frame: VideoFrameData) => {
      const resources = getCanvasResources(frame.width, frame.height)
      if (!resources) return

      if (frame.format === 'I420' && 'VideoFrame' in window) {
        try {
          // PGM/PVW llegan como I420 para reducir mucho el tráfico IPC. Si
          // Chromium puede construir un VideoFrame, drawImage delega la
          // conversión YUV→RGB al motor gráfico en vez de hacerla en JS.
          const videoFrame = new VideoFrame(frame.data, {
            format: 'I420',
            codedWidth: frame.width,
            codedHeight: frame.height,
            timestamp: Math.round(performance.now() * 1000)
          })
          resources.ctx.drawImage(videoFrame, 0, 0)
          videoFrame.close()
          renderedFrameCountRef.current++
          return
        } catch {
          // Fallback para builds donde WebCodecs esté deshabilitado o no acepte
          // este formato desde BufferSource. Sigue funcionando, solo cuesta más CPU.
        }
      }

      if (frame.format === 'RGBA' && frame.data.buffer instanceof ArrayBuffer) {
        // La rama PGM/PVW ya llega en el formato que Canvas necesita. Crear
        // ImageData sobre el buffer recibido evita copiar ~2 MB por monitor y
        // frame antes de llamar a putImageData().
        const rgbaBytes = new Uint8ClampedArray(
          frame.data.buffer,
          frame.data.byteOffset,
          frame.data.byteLength
        )
        resources.ctx.putImageData(new ImageData(rgbaBytes, frame.width, frame.height), 0, 0)
        renderedFrameCountRef.current++
        return
      }

      if (frame.format === 'RGBA') {
        resources.rgbaBytes.set(frame.data)
        resources.ctx.putImageData(resources.imageData, 0, 0)
        renderedFrameCountRef.current++
        return
      }

      if (frame.format === 'I420') {
        copyI420ToReusableRgba(frame.data, resources.rgbaBytes, frame.width, frame.height)
        resources.ctx.putImageData(resources.imageData, 0, 0)
        renderedFrameCountRef.current++
        return
      }

      copyBgraToReusableRgba(frame.data, resources.rgbaBytes, resources.rgbaWords)
      resources.ctx.putImageData(resources.imageData, 0, 0)

      renderedFrameCountRef.current++
    },
    [getCanvasResources]
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
    (frame: VideoFrameData) => {
      receivedFrameCountRef.current++

      // latest-frame wins: si llegan varios frames entre dos repaints,
      // solo pintamos el más reciente. Esto evita jitter por cola visual.
      if (pendingFrameRef.current) {
        overwrittenPendingFrameCountRef.current++
      }
      pendingFrameRef.current = frame
      schedulePaint()
    },
    [schedulePaint]
  )

  useEffect(() => {
    const unsubscribe = onSubscribe(handleFrame)

    return (): void => {
      unsubscribe()
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      contextRef.current = null
      reusableImageDataRef.current = null
      reusableRgbaBytesRef.current = null
      reusableRgbaWordsRef.current = null
      pendingFrameRef.current = null
    }
  }, [handleFrame, onSubscribe])

  useEffect(() => {
    const statsTimer = window.setInterval(() => {
      const sampleMs = 1000
      const nextReceivedFps = receivedFrameCountRef.current
      const nextRenderedFps = renderedFrameCountRef.current
      const nextSkippedFrames = overwrittenPendingFrameCountRef.current

      setReceivedFps(nextReceivedFps)
      setRenderedFps(nextRenderedFps)
      setSkippedFrames(nextSkippedFrames)

      if (
        showFps &&
        label &&
        (nextReceivedFps > 0 || nextRenderedFps > 0 || nextSkippedFrames > 0)
      ) {
        const canvas = canvasRef.current
        const currentWidth = canvas?.width ?? width
        const currentHeight = canvas?.height ?? height

        window.openMix.mixer.reportMonitorStats({
          label,
          receivedFps: nextReceivedFps,
          renderedFps: nextRenderedFps,
          skippedFrames: nextSkippedFrames,
          sampleMs,
          rasterWidth: currentWidth,
          rasterHeight: currentHeight
        })
      }

      receivedFrameCountRef.current = 0
      renderedFrameCountRef.current = 0
      overwrittenPendingFrameCountRef.current = 0
    }, 1000)

    return (): void => {
      window.clearInterval(statsTimer)
    }
  }, [height, label, showFps, width])

  return (
    <div
      style={{
        display: 'block',
        position: 'relative',
        boxSizing: 'border-box',
        border: borderColor ? `2px solid ${borderColor}` : '1px solid #333',
        borderRadius: '4px',
        lineHeight: 0,
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          display: 'block',
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor
        }}
      />
      {/* Etiqueta superpuesta (PGM, PVW, etc.) */}
      {label && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            left: 8,
            color: labelColor || borderColor || '#fff',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            textShadow: '0 0 4px rgba(0,0,0,0.8)',
            userSelect: 'none'
          }}
        >
          {label}
        </span>
      )}
      {/* Indicador de FPS */}
      {showFps && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            color: fpsColor,
            fontSize: '11px',
            fontFamily: 'monospace',
            lineHeight: 1.3,
            textAlign: 'right',
            textShadow: '0 0 4px rgba(0,0,0,0.8)',
            userSelect: 'none'
          }}
        >
          <div>RX {receivedFps} fps</div>
          <div>UI {renderedFps} fps</div>
          <div>SKIP {skippedFrames}</div>
        </span>
      )}
    </div>
  )
}
