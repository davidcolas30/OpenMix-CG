import { useCallback, useEffect, useRef } from 'react'
import type {
  MixerNativeMonitorLayout,
  MixerNativeMonitorTarget
} from '../../../shared/ipc/mixer-contracts'

interface NativeMonitorSurfaceProps {
  target: MixerNativeMonitorTarget
  label: string
  borderColor: string
  width: number
  height: number
  isVisible: boolean
  startSignal: number
}

export default function NativeMonitorSurface({
  target,
  label,
  borderColor,
  width,
  height,
  isVisible,
  startSignal
}: NativeMonitorSurfaceProps): React.JSX.Element {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const lastPublishedLayoutRef = useRef<MixerNativeMonitorLayout | null>(null)

  const publishLayout = useCallback(
    (forceHidden = false) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      const visible =
        !forceHidden && isVisible && rect !== undefined && rect.width >= 8 && rect.height >= 8

      const layout: MixerNativeMonitorLayout = {
        target,
        visible,
        rect: rect
          ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          : { x: 0, y: 0, width: 0, height: 0 }
      }

      const lastLayout = lastPublishedLayoutRef.current
      const changed =
        !lastLayout ||
        lastLayout.target !== layout.target ||
        lastLayout.visible !== layout.visible ||
        Math.abs(lastLayout.rect.x - layout.rect.x) >= 1 ||
        Math.abs(lastLayout.rect.y - layout.rect.y) >= 1 ||
        Math.abs(lastLayout.rect.width - layout.rect.width) >= 1 ||
        Math.abs(lastLayout.rect.height - layout.rect.height) >= 1

      if (changed) {
        lastPublishedLayoutRef.current = layout
        void window.openMix.mixer.setNativeMonitorLayout(layout)
      }
    },
    [isVisible, target]
  )

  useEffect(() => {
    publishLayout()

    const observedNode = surfaceRef.current
    const resizeObserver =
      observedNode && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => publishLayout())
        : null
    if (observedNode && resizeObserver) {
      resizeObserver.observe(observedNode)
    }

    const handleLayoutChange = (): void => publishLayout()
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)

    let disposed = false
    const trackPositionDuringLayout = (): void => {
      if (disposed) return
      if (isVisible) {
        publishLayout()
      }
      window.requestAnimationFrame(trackPositionDuringLayout)
    }
    const trackingFrameId = window.requestAnimationFrame(trackPositionDuringLayout)

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
      window.cancelAnimationFrame(trackingFrameId)
      lastPublishedLayoutRef.current = null
      publishLayout(true)
    }
  }, [isVisible, publishLayout, startSignal])

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#020407',
        border: `2px solid ${borderColor}`,
        borderRadius: 0,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        ref={surfaceRef}
        style={{
          position: 'absolute',
          inset: '2px',
          backgroundColor: '#000',
          borderRadius: 0
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: '8px',
          bottom: '6px',
          color: borderColor,
          fontSize: '10px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(0,0,0,0.55)',
          pointerEvents: 'none'
        }}
      >
        {label} nativo
      </span>
    </div>
  )
}
