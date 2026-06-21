import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import {
  DEFAULT_GRAPHICS_SIDEBAR_HEIGHT,
  DEFAULT_LOCAL_VIDEO_SIDEBAR_HEIGHT,
  DEFAULT_MULTIVIEW_HEIGHT,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_GRAPHICS_SIDEBAR_HEIGHT,
  MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT,
  MIN_MULTIVIEW_HEIGHT
} from './MixerLayout.constants'
import type {
  MultiviewResizeState,
  PanelSize,
  SidebarResizeState,
  SidebarSectionResizeState,
  ViewTabIndicator,
  WorkspaceView
} from './MixerLayout.types'
import {
  clampNumber,
  clampSidebarWidth,
  getMaxMultiviewHeight,
  getMaxSidebarFixedHeight
} from './MixerLayout.utils'

export function useTransientStatusMessage(): {
  statusMessage: string | null
  showStatusMessage: (message: string | null) => void
} {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const publishTimerRef = useRef<number | null>(null)
  const clearTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback((): void => {
    for (const timerRef of [publishTimerRef, clearTimerRef]) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const showStatusMessage = useCallback(
    (message: string | null): void => {
      clearTimers()

      if (!message) {
        setStatusMessage(null)
        return
      }

      setStatusMessage(null)
      publishTimerRef.current = window.setTimeout(() => {
        setStatusMessage(message)
        clearTimerRef.current = window.setTimeout(() => {
          setStatusMessage(null)
        }, 3400)
      }, 0)
    },
    [clearTimers]
  )

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  return { statusMessage, showStatusMessage }
}

export function useViewTabIndicator(activeView: WorkspaceView): {
  viewTabIndicator: ViewTabIndicator
  viewTabsRef: React.RefObject<HTMLDivElement | null>
  registerViewTab: (view: WorkspaceView, node: HTMLButtonElement | null) => void
} {
  const [viewTabIndicator, setViewTabIndicator] = useState<ViewTabIndicator>({
    left: 0,
    width: 0,
    visible: false
  })
  const viewTabsRef = useRef<HTMLDivElement | null>(null)
  const viewTabRefs = useRef<Record<WorkspaceView, HTMLButtonElement | null>>({
    mixer: null,
    audio: null,
    graphics: null,
    options: null,
    shortcuts: null
  })

  const registerViewTab = useCallback(
    (view: WorkspaceView, node: HTMLButtonElement | null): void => {
      viewTabRefs.current[view] = node
    },
    []
  )

  const updateViewTabIndicator = useCallback(() => {
    const tabsContainer = viewTabsRef.current
    const activeTab = viewTabRefs.current[activeView]

    if (!tabsContainer || !activeTab) {
      setViewTabIndicator((currentIndicator) =>
        currentIndicator.visible ? { ...currentIndicator, visible: false } : currentIndicator
      )
      return
    }

    const containerRect = tabsContainer.getBoundingClientRect()
    const activeRect = activeTab.getBoundingClientRect()
    const nextIndicator: ViewTabIndicator = {
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
      visible: true
    }

    setViewTabIndicator((currentIndicator) => {
      const isSamePosition =
        Math.abs(currentIndicator.left - nextIndicator.left) < 0.5 &&
        Math.abs(currentIndicator.width - nextIndicator.width) < 0.5 &&
        currentIndicator.visible === nextIndicator.visible

      return isSamePosition ? currentIndicator : nextIndicator
    })
  }, [activeView])

  useLayoutEffect(() => {
    updateViewTabIndicator()

    const tabsContainer = viewTabsRef.current
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateViewTabIndicator) : null

    if (tabsContainer) {
      resizeObserver?.observe(tabsContainer)
    }

    Object.values(viewTabRefs.current).forEach((tabElement) => {
      if (tabElement) {
        resizeObserver?.observe(tabElement)
      }
    })

    window.addEventListener('resize', updateViewTabIndicator)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateViewTabIndicator)
    }
  }, [updateViewTabIndicator])

  return { viewTabIndicator, viewTabsRef, registerViewTab }
}

export function useMixerWorkspaceLayout(activeView: WorkspaceView): {
  mixerWorkspaceRef: React.RefObject<HTMLElement | null>
  mixerWorkspaceSize: PanelSize
  multiviewHeight: number
  mixerSidebarWidth: number
  sidebarPanelHeights: { graphics: number; localVideo: number }
  handleMultiviewResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  handleMultiviewResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  handleMultiviewResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  handleSidebarResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void
  handleSidebarResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  handleSidebarResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  handleSidebarSectionResizeStart: (
    target: SidebarSectionResizeState['target'],
    event: React.PointerEvent<HTMLDivElement>
  ) => void
  handleSidebarSectionResizeMove: (event: React.PointerEvent<HTMLDivElement>) => void
  handleSidebarSectionResizeEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  resetMultiviewHeight: () => void
  resetSidebarWidth: () => void
  resetGraphicsSidebarHeight: () => void
  resetLocalVideoSidebarHeight: () => void
} {
  const [mixerWorkspaceSize, setMixerWorkspaceSize] = useState<PanelSize>({ width: 0, height: 0 })
  const [multiviewHeight, setMultiviewHeight] = useState(DEFAULT_MULTIVIEW_HEIGHT)
  const [mixerSidebarWidth, setMixerSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [sidebarPanelHeights, setSidebarPanelHeights] = useState({
    graphics: DEFAULT_GRAPHICS_SIDEBAR_HEIGHT,
    localVideo: DEFAULT_LOCAL_VIDEO_SIDEBAR_HEIGHT
  })
  const mixerWorkspaceRef = useRef<HTMLElement | null>(null)
  const multiviewResizeRef = useRef<MultiviewResizeState | null>(null)
  const sidebarResizeRef = useRef<SidebarResizeState | null>(null)
  const sidebarSectionResizeRef = useRef<SidebarSectionResizeState | null>(null)

  const clearMultiviewResizeState = useCallback(
    (handle: HTMLDivElement | null, pointerId?: number) => {
      if (handle && pointerId !== undefined && handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId)
      }

      multiviewResizeRef.current = null
    },
    []
  )

  const clearSidebarResizeState = useCallback(
    (handle: HTMLDivElement | null, pointerId?: number) => {
      if (handle && pointerId !== undefined && handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId)
      }

      sidebarResizeRef.current = null
    },
    []
  )

  const clearSidebarSectionResizeState = useCallback(
    (handle: HTMLDivElement | null, pointerId?: number) => {
      if (handle && pointerId !== undefined && handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId)
      }

      sidebarSectionResizeRef.current = null
    },
    []
  )

  useEffect(() => {
    if (activeView !== 'mixer') {
      return
    }

    const workspaceElement = mixerWorkspaceRef.current
    if (!workspaceElement) {
      return
    }

    // Medimos el workspace real para que PVW/PGM dependan del espacio sobrante,
    // no de tamaños mágicos fijados en píxeles.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setMixerWorkspaceSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height)
      })
    })

    observer.observe(workspaceElement)

    return () => {
      observer.disconnect()
    }
  }, [activeView])

  useEffect(() => {
    if (mixerWorkspaceSize.height === 0) {
      return
    }

    setMultiviewHeight((currentHeight) =>
      clampNumber(
        currentHeight,
        MIN_MULTIVIEW_HEIGHT,
        getMaxMultiviewHeight(mixerWorkspaceSize.height)
      )
    )
  }, [mixerWorkspaceSize.height])

  useEffect(() => {
    if (mixerWorkspaceSize.width === 0) {
      return
    }

    setMixerSidebarWidth((currentWidth) =>
      clampSidebarWidth(currentWidth, mixerWorkspaceSize.width)
    )
  }, [mixerWorkspaceSize.width])

  useEffect(() => {
    if (mixerWorkspaceSize.height === 0) {
      return
    }

    const maxFixedHeight = getMaxSidebarFixedHeight(mixerWorkspaceSize.height)
    setSidebarPanelHeights((currentHeights) => {
      const graphics = clampNumber(
        currentHeights.graphics,
        MIN_GRAPHICS_SIDEBAR_HEIGHT,
        Math.max(MIN_GRAPHICS_SIDEBAR_HEIGHT, maxFixedHeight - MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT)
      )
      const localVideo = clampNumber(
        currentHeights.localVideo,
        MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT,
        Math.max(MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT, maxFixedHeight - graphics)
      )

      return { graphics, localVideo }
    })
  }, [mixerWorkspaceSize.height])

  const handleMultiviewResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mixerWorkspaceSize.height === 0) {
        return
      }

      multiviewResizeRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        baseHeight: multiviewHeight
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [mixerWorkspaceSize.height, multiviewHeight]
  )

  const handleMultiviewResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = multiviewResizeRef.current
      if (
        !resizeState ||
        resizeState.pointerId !== event.pointerId ||
        mixerWorkspaceSize.height === 0
      ) {
        return
      }

      const deltaY = resizeState.startY - event.clientY
      const nextHeight = clampNumber(
        resizeState.baseHeight + deltaY,
        MIN_MULTIVIEW_HEIGHT,
        getMaxMultiviewHeight(mixerWorkspaceSize.height)
      )

      setMultiviewHeight(nextHeight)
    },
    [mixerWorkspaceSize.height]
  )

  const handleMultiviewResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      clearMultiviewResizeState(event.currentTarget, event.pointerId)
    },
    [clearMultiviewResizeState]
  )

  const handleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mixerWorkspaceSize.width === 0) {
        return
      }

      sidebarResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        baseWidth: mixerSidebarWidth
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [mixerSidebarWidth, mixerWorkspaceSize.width]
  )

  const handleSidebarResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = sidebarResizeRef.current
      if (
        !resizeState ||
        resizeState.pointerId !== event.pointerId ||
        mixerWorkspaceSize.width === 0
      ) {
        return
      }

      const deltaX = resizeState.startX - event.clientX
      const nextWidth = clampSidebarWidth(resizeState.baseWidth + deltaX, mixerWorkspaceSize.width)
      setMixerSidebarWidth(nextWidth)
    },
    [mixerWorkspaceSize.width]
  )

  const handleSidebarResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      clearSidebarResizeState(event.currentTarget, event.pointerId)
    },
    [clearSidebarResizeState]
  )

  const handleSidebarSectionResizeStart = useCallback(
    (target: SidebarSectionResizeState['target'], event: React.PointerEvent<HTMLDivElement>) => {
      if (mixerWorkspaceSize.height === 0) {
        return
      }

      sidebarSectionResizeRef.current = {
        pointerId: event.pointerId,
        target,
        startY: event.clientY,
        baseGraphicsHeight: sidebarPanelHeights.graphics,
        baseLocalVideoHeight: sidebarPanelHeights.localVideo
      }

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [mixerWorkspaceSize.height, sidebarPanelHeights.graphics, sidebarPanelHeights.localVideo]
  )

  const handleSidebarSectionResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = sidebarSectionResizeRef.current
      if (
        !resizeState ||
        resizeState.pointerId !== event.pointerId ||
        mixerWorkspaceSize.height === 0
      ) {
        return
      }

      const maxFixedHeight = getMaxSidebarFixedHeight(mixerWorkspaceSize.height)
      const deltaY = event.clientY - resizeState.startY

      if (resizeState.target === 'graphics') {
        const nextGraphicsHeight = clampNumber(
          resizeState.baseGraphicsHeight + deltaY,
          MIN_GRAPHICS_SIDEBAR_HEIGHT,
          Math.max(MIN_GRAPHICS_SIDEBAR_HEIGHT, maxFixedHeight - resizeState.baseLocalVideoHeight)
        )

        setSidebarPanelHeights({
          graphics: nextGraphicsHeight,
          localVideo: resizeState.baseLocalVideoHeight
        })
        return
      }

      const nextLocalVideoHeight = clampNumber(
        resizeState.baseLocalVideoHeight + deltaY,
        MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT,
        Math.max(MIN_LOCAL_VIDEO_SIDEBAR_HEIGHT, maxFixedHeight - resizeState.baseGraphicsHeight)
      )

      setSidebarPanelHeights({
        graphics: resizeState.baseGraphicsHeight,
        localVideo: nextLocalVideoHeight
      })
    },
    [mixerWorkspaceSize.height]
  )

  const handleSidebarSectionResizeEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      clearSidebarSectionResizeState(event.currentTarget, event.pointerId)
    },
    [clearSidebarSectionResizeState]
  )

  const resetMultiviewHeight = useCallback(() => {
    setMultiviewHeight(DEFAULT_MULTIVIEW_HEIGHT)
  }, [])

  const resetSidebarWidth = useCallback(() => {
    setMixerSidebarWidth(
      mixerWorkspaceSize.width > 0
        ? clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH, mixerWorkspaceSize.width)
        : DEFAULT_SIDEBAR_WIDTH
    )
  }, [mixerWorkspaceSize.width])

  const resetGraphicsSidebarHeight = useCallback(() => {
    setSidebarPanelHeights((currentHeights) => ({
      ...currentHeights,
      graphics: DEFAULT_GRAPHICS_SIDEBAR_HEIGHT
    }))
  }, [])

  const resetLocalVideoSidebarHeight = useCallback(() => {
    setSidebarPanelHeights((currentHeights) => ({
      ...currentHeights,
      localVideo: DEFAULT_LOCAL_VIDEO_SIDEBAR_HEIGHT
    }))
  }, [])

  return {
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
  }
}
