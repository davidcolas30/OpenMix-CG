import { useEffect, useRef, useState } from 'react'

interface TransientStatusToastProps {
  message: string | null
  placement?: 'top-right' | 'bottom-left'
}

const VISIBLE_MS = 2800
const FADE_MS = 180

export default function TransientStatusToast({
  message,
  placement = 'top-right'
}: TransientStatusToastProps): React.JSX.Element | null {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const removeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    clearToastTimers(showTimerRef, hideTimerRef, removeTimerRef)

    if (!message) {
      setIsVisible(false)
      removeTimerRef.current = window.setTimeout(() => setDisplayMessage(null), FADE_MS)
      return () => clearToastTimers(showTimerRef, hideTimerRef, removeTimerRef)
    }

    setDisplayMessage(message)
    showTimerRef.current = window.setTimeout(() => setIsVisible(true), 0)
    hideTimerRef.current = window.setTimeout(() => {
      setIsVisible(false)
      removeTimerRef.current = window.setTimeout(() => setDisplayMessage(null), FADE_MS)
    }, VISIBLE_MS)

    return () => clearToastTimers(showTimerRef, hideTimerRef, removeTimerRef)
  }, [message])

  if (!displayMessage) {
    return null
  }

  const isError = /(^error|no se pudo|fall|failed|desconect|deneg)/i.test(displayMessage)

  return (
    <div role="status" aria-live="polite" style={toastStyle(isVisible, isError, placement)}>
      {displayMessage}
    </div>
  )
}

function clearToastTimers(
  showTimerRef: React.MutableRefObject<number | null>,
  hideTimerRef: React.MutableRefObject<number | null>,
  removeTimerRef: React.MutableRefObject<number | null>
): void {
  for (const timerRef of [showTimerRef, hideTimerRef, removeTimerRef]) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
}

function toastStyle(
  isVisible: boolean,
  isError: boolean,
  placement: TransientStatusToastProps['placement']
): React.CSSProperties {
  const verticalPlacement =
    placement === 'bottom-left' ? { left: 0, bottom: 0 } : { right: 0, top: '56px' }

  return {
    position: 'absolute',
    ...verticalPlacement,
    zIndex: 30,
    maxWidth: 'min(430px, calc(100% - 24px))',
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: isError ? 'rgba(127, 29, 29, 0.92)' : 'rgba(8, 47, 73, 0.92)',
    border: `1px solid ${isError ? 'rgba(248, 113, 113, 0.42)' : 'rgba(125, 211, 252, 0.38)'}`,
    color: isError ? '#fee2e2' : '#e0f7ff',
    boxShadow: '0 14px 34px rgba(2, 8, 23, 0.34)',
    fontSize: '12px',
    lineHeight: 1.35,
    pointerEvents: 'none',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(-4px)',
    transition: 'opacity 160ms ease, transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)'
  }
}
