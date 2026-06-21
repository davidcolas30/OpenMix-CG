import { useEffect, useRef, useState } from 'react'

type MonitorWebRtcTarget = 'preview' | 'program' | 'combined' | 'multiview'

interface VideoFrameCallbackMetadata {
  presentedFrames: number
  expectedDisplayTime?: number
  presentationTime?: number
}

type VideoFrameCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function normalizeFps(frameCount: number, sampleSeconds: number): number {
  if (!Number.isFinite(frameCount) || !Number.isFinite(sampleSeconds) || sampleSeconds <= 0) {
    return 0
  }

  return Math.round(frameCount / sampleSeconds)
}

export function MonitorWebRtcVideo({
  target,
  label,
  borderColor,
  width,
  height,
  isRunning,
  startSignal,
  showHud = true
}: {
  target: MonitorWebRtcTarget
  label: string
  borderColor: string
  width: number
  height: number
  isRunning: boolean
  startSignal: number
  showHud?: boolean
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new')
  const [decodedFps, setDecodedFps] = useState(0)
  const [presentedFps, setPresentedFps] = useState(0)
  const [droppedFrames, setDroppedFrames] = useState(0)
  const frameCallbackCountRef = useRef(0)
  const latestCallbackPresentedFramesRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isRunning || startSignal === 0) {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setConnectionState('new')
      setDecodedFps(0)
      setPresentedFps(0)
      setDroppedFrames(0)
      frameCallbackCountRef.current = 0
      latestCallbackPresentedFramesRef.current = null
      return
    }

    let disposed = false
    let remoteDescriptionReady = false
    let startTimeoutId: number | null = null
    const pendingRemoteCandidates: RTCIceCandidateInit[] = []
    const peerConnection = new RTCPeerConnection({ iceServers: [] })

    const subscribeAnswer =
      target === 'preview'
        ? window.openMix.mixer.onPreviewMonitorWebRtcAnswer
        : target === 'program'
          ? window.openMix.mixer.onProgramMonitorWebRtcAnswer
          : target === 'combined'
            ? window.openMix.mixer.onCombinedMonitorWebRtcAnswer
            : window.openMix.mixer.onMultiviewMonitorWebRtcAnswer

    const subscribeIce =
      target === 'preview'
        ? window.openMix.mixer.onPreviewMonitorWebRtcIceCandidate
        : target === 'program'
          ? window.openMix.mixer.onProgramMonitorWebRtcIceCandidate
          : target === 'combined'
            ? window.openMix.mixer.onCombinedMonitorWebRtcIceCandidate
            : window.openMix.mixer.onMultiviewMonitorWebRtcIceCandidate

    const startMonitor =
      target === 'preview'
        ? window.openMix.mixer.startPreviewMonitorWebRtc
        : target === 'program'
          ? window.openMix.mixer.startProgramMonitorWebRtc
          : target === 'combined'
            ? window.openMix.mixer.startCombinedMonitorWebRtc
            : window.openMix.mixer.startMultiviewMonitorWebRtc

    const addIceCandidate =
      target === 'preview'
        ? window.openMix.mixer.addPreviewMonitorIceCandidate
        : target === 'program'
          ? window.openMix.mixer.addProgramMonitorIceCandidate
          : target === 'combined'
            ? window.openMix.mixer.addCombinedMonitorIceCandidate
            : window.openMix.mixer.addMultiviewMonitorIceCandidate

    const stopMonitor =
      target === 'preview'
        ? window.openMix.mixer.stopPreviewMonitorWebRtc
        : target === 'program'
          ? window.openMix.mixer.stopProgramMonitorWebRtc
          : target === 'combined'
            ? window.openMix.mixer.stopCombinedMonitorWebRtc
            : window.openMix.mixer.stopMultiviewMonitorWebRtc

    const removeAnswerListener = subscribeAnswer(async (answer) => {
      if (disposed) return

      await peerConnection.setRemoteDescription({
        type: answer.type as RTCSdpType,
        sdp: answer.sdp
      })
      remoteDescriptionReady = true

      while (pendingRemoteCandidates.length > 0) {
        const candidate = pendingRemoteCandidates.shift()
        if (candidate) {
          await peerConnection.addIceCandidate(candidate)
        }
      }
    })

    const removeIceListener = subscribeIce((candidate) => {
      const iceCandidate: RTCIceCandidateInit = {
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex
      }

      if (!remoteDescriptionReady) {
        pendingRemoteCandidates.push(iceCandidate)
        return
      }

      void peerConnection.addIceCandidate(iceCandidate).catch((error) => {
        console.error(`Error añadiendo ICE candidate del monitor ${label}:`, error)
      })
    })

    peerConnection.addTransceiver('video', { direction: 'recvonly' })
    peerConnection.onconnectionstatechange = () => {
      setConnectionState(peerConnection.connectionState)
    }
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return

      const candidate = {
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? 0,
        candidate: event.candidate.candidate
      }
      void addIceCandidate(candidate)
    }
    peerConnection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => {
          // El vídeo está silenciado; si Chromium retrasa autoplay, volverá a
          // arrancar al recibir interacción del usuario. No bloquea el mixer.
        })
      }
    }

    startTimeoutId = window.setTimeout(() => {
      void (async () => {
        if (disposed) return

        try {
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)
          if (!offer.sdp) {
            throw new Error('Offer SDP vacía')
          }
          await startMonitor(offer.sdp)
        } catch (error) {
          console.error(`Error iniciando monitor ${label} por WebRTC:`, error)
        }
      })()
    }, 500)

    return () => {
      disposed = true
      if (startTimeoutId !== null) {
        window.clearTimeout(startTimeoutId)
      }
      removeAnswerListener()
      removeIceListener()
      peerConnection.close()
      setConnectionState('closed')
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      const stopPromise = stopMonitor()
      void stopPromise.catch((error) => {
        console.error(`Error deteniendo monitor ${label} por WebRTC:`, error)
      })
    }
  }, [isRunning, label, startSignal, target])

  useEffect(() => {
    if (!isRunning || startSignal === 0) {
      return
    }

    let disposed = false
    let frameCallbackHandle: number | null = null
    let lastTotalVideoFrames: number | null = null
    let lastDroppedVideoFrames: number | null = null
    let lastPresentedVideoFrames: number | null = null
    let lastCallbackPresentedFrames: number | null = null
    let lastStatsTimestamp = performance.now()

    const video = videoRef.current as VideoElementWithFrameCallback | null

    const scheduleFrameCallback = (): void => {
      if (disposed || !video?.requestVideoFrameCallback) {
        return
      }

      frameCallbackHandle = video.requestVideoFrameCallback((_now, metadata) => {
        frameCallbackCountRef.current++
        latestCallbackPresentedFramesRef.current =
          typeof metadata.presentedFrames === 'number' ? metadata.presentedFrames : null
        scheduleFrameCallback()
      })
    }

    scheduleFrameCallback()

    const statsTimer = window.setInterval(() => {
      const now = performance.now()
      const sampleMs = Math.max(1, now - lastStatsTimestamp)
      const sampleSeconds = sampleMs / 1000
      const currentVideo = videoRef.current
      const playbackQuality = currentVideo?.getVideoPlaybackQuality()
      const totalVideoFrames = playbackQuality?.totalVideoFrames
      const totalDroppedFrames = playbackQuality?.droppedVideoFrames
      const qualityPresentedFrames =
        typeof totalVideoFrames === 'number' && typeof totalDroppedFrames === 'number'
          ? Math.max(0, totalVideoFrames - totalDroppedFrames)
          : null

      // En Chromium, requestVideoFrameCallback no es una garantía de "un callback
      // por cada frame visible". Para los monitores WebRTC usamos primero la
      // telemetría acumulada de HTMLVideoElement; el callback queda como fallback.
      const decodedFrames =
        typeof totalVideoFrames === 'number' && lastTotalVideoFrames !== null
          ? Math.max(0, totalVideoFrames - lastTotalVideoFrames)
          : frameCallbackCountRef.current
      const nextDroppedFrames =
        typeof totalDroppedFrames === 'number' && lastDroppedVideoFrames !== null
          ? Math.max(0, totalDroppedFrames - lastDroppedVideoFrames)
          : 0
      const presentedFrames =
        qualityPresentedFrames !== null && lastPresentedVideoFrames !== null
          ? Math.max(0, qualityPresentedFrames - lastPresentedVideoFrames)
          : latestCallbackPresentedFramesRef.current !== null &&
              lastCallbackPresentedFrames !== null
            ? Math.max(0, latestCallbackPresentedFramesRef.current - lastCallbackPresentedFrames)
            : frameCallbackCountRef.current
      const nextDecodedFps = normalizeFps(decodedFrames, sampleSeconds)
      const nextPresentedFps = normalizeFps(presentedFrames, sampleSeconds)

      if (typeof totalVideoFrames === 'number') {
        lastTotalVideoFrames = totalVideoFrames
      }
      if (typeof totalDroppedFrames === 'number') {
        lastDroppedVideoFrames = totalDroppedFrames
      }
      if (qualityPresentedFrames !== null) {
        lastPresentedVideoFrames = qualityPresentedFrames
      }
      if (latestCallbackPresentedFramesRef.current !== null) {
        lastCallbackPresentedFrames = latestCallbackPresentedFramesRef.current
      }
      lastStatsTimestamp = now

      setDecodedFps(nextDecodedFps)
      setPresentedFps(nextPresentedFps)
      setDroppedFrames(nextDroppedFrames)

      if (connectionState === 'connected' || nextDecodedFps > 0 || nextPresentedFps > 0) {
        window.openMix.mixer.reportMonitorStats({
          label: `${label}-WRTC`,
          receivedFps: nextDecodedFps,
          renderedFps: nextPresentedFps,
          skippedFrames: nextDroppedFrames,
          sampleMs,
          rasterWidth: currentVideo?.videoWidth || width,
          rasterHeight: currentVideo?.videoHeight || height
        })
      }

      frameCallbackCountRef.current = 0
    }, 1000)

    return () => {
      disposed = true
      window.clearInterval(statsTimer)
      if (frameCallbackHandle !== null && video?.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackHandle)
      }
    }
  }, [connectionState, height, isRunning, label, startSignal, target, width])

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#000',
        boxShadow: `inset 0 0 0 2px ${borderColor}`,
        borderRadius: '4px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block'
        }}
      />
      {showHud && (
        <>
          <span
            style={{
              position: 'absolute',
              left: '8px',
              bottom: '6px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              color: borderColor,
              fontSize: '10px',
              fontFamily: 'monospace'
            }}
          >
            {label} WebRTC · {startSignal === 0 ? 'waiting' : connectionState}
          </span>
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '8px',
              color: '#b7f5bd',
              fontSize: '11px',
              fontFamily: 'monospace',
              lineHeight: 1.3,
              textAlign: 'right',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              userSelect: 'none'
            }}
          >
            <div>RX {decodedFps} fps</div>
            <div>UI {presentedFps} fps</div>
            <div>DROP {droppedFrames}</div>
          </span>
        </>
      )}
    </div>
  )
}

export function MonitorPlaceholder({
  label,
  width,
  height,
  borderColor,
  statusLabel
}: {
  label: string
  width: number
  height: number
  borderColor: string
  statusLabel?: string
}): React.JSX.Element {
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#020407',
        boxShadow: `inset 0 0 0 2px ${borderColor}`,
        borderRadius: '4px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7c8ca4',
        fontFamily: 'monospace',
        fontSize: '12px'
      }}
    >
      {statusLabel ?? `${label} WRTC OFF`}
    </div>
  )
}

function createExternalMonitorHtml(target: 'preview' | 'program', label: string): string {
  const config = JSON.stringify({ target, label })
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        min-width: 100%;
        min-height: 100%;
        overflow: hidden;
        background: #000;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      body {
        position: fixed;
        inset: 0;
      }
      video {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        background: #000;
      }
      .label, .stats {
        position: absolute;
        z-index: 2;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.55);
        color: ${target === 'preview' ? '#43a047' : '#e53935'};
        font-size: 10px;
        user-select: none;
      }
      .label { left: 8px; bottom: 6px; }
      .stats {
        top: 4px;
        right: 8px;
        color: #b7f5bd;
        text-align: right;
        line-height: 1.3;
        background: transparent;
        text-shadow: 0 0 4px rgba(0,0,0,0.8);
      }
    </style>
  </head>
  <body>
    <video autoplay muted playsinline></video>
    <div class="label">${label} externo · waiting</div>
    <div class="stats"><div>RX 0 fps</div><div>UI 0 fps</div><div>DROP 0</div></div>
    <script>
      const { target, label } = ${config};
      const video = document.querySelector('video');
      const labelEl = document.querySelector('.label');
      const statsEl = document.querySelector('.stats');
      let disposed = false;
      let remoteDescriptionReady = false;
      let frameCallbackCount = 0;
      let latestCallbackPresentedFrames = null;
      let lastTotalVideoFrames = null;
      let lastDroppedVideoFrames = null;
      let lastPresentedVideoFrames = null;
      let lastCallbackPresentedFrames = null;
      let lastStatsTimestamp = performance.now();
      const pendingRemoteCandidates = [];
      const pc = new RTCPeerConnection({ iceServers: [] });
      const api = window.openMix && window.openMix.mixer;
      if (!api) {
        setLabelState('preload no disponible');
        console.error('window.openMix.mixer no disponible en monitor externo');
        throw new Error('window.openMix.mixer no disponible');
      }
      const subscribeAnswer = target === 'preview'
        ? api.onPreviewMonitorWebRtcAnswer
        : api.onProgramMonitorWebRtcAnswer;
      const subscribeIce = target === 'preview'
        ? api.onPreviewMonitorWebRtcIceCandidate
        : api.onProgramMonitorWebRtcIceCandidate;
      const startMonitor = target === 'preview'
        ? api.startPreviewMonitorWebRtc
        : api.startProgramMonitorWebRtc;
      const addIceCandidate = target === 'preview'
        ? api.addPreviewMonitorIceCandidate
        : api.addProgramMonitorIceCandidate;
      const stopMonitor = target === 'preview'
        ? api.stopPreviewMonitorWebRtc
        : api.stopProgramMonitorWebRtc;

      const normalizeFps = (frames, seconds) => Math.round(frames / Math.max(0.001, seconds));
      const setLabelState = (state) => {
        labelEl.textContent = label + ' externo · ' + state;
      };
      const scheduleFrameCallback = () => {
        if (disposed || !video.requestVideoFrameCallback) return;
        video.requestVideoFrameCallback((_now, metadata) => {
          frameCallbackCount++;
          latestCallbackPresentedFrames =
            typeof metadata.presentedFrames === 'number' ? metadata.presentedFrames : null;
          scheduleFrameCallback();
        });
      };

      const removeAnswerListener = subscribeAnswer(async (answer) => {
        if (disposed) return;
        await pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
        remoteDescriptionReady = true;
        while (pendingRemoteCandidates.length > 0) {
          const candidate = pendingRemoteCandidates.shift();
          if (candidate) await pc.addIceCandidate(candidate);
        }
      });
      const removeIceListener = subscribeIce((candidate) => {
        const iceCandidate = {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex
        };
        if (!remoteDescriptionReady) {
          pendingRemoteCandidates.push(iceCandidate);
          return;
        }
        void pc.addIceCandidate(iceCandidate);
      });

      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.onconnectionstatechange = () => setLabelState(pc.connectionState);
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void addIceCandidate({
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? 0,
          candidate: event.candidate.candidate
        });
      };
      pc.ontrack = (event) => {
        video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void video.play().catch(() => {});
      };

      const start = async () => {
        setLabelState('creando offer');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!offer.sdp) throw new Error('Offer SDP vacia');
        const result = await startMonitor(offer.sdp);
        if (!result || result.ok !== true) {
          throw new Error(result?.error?.message || 'No se pudo iniciar monitor WebRTC local');
        }
        setLabelState('offer enviada');
        scheduleFrameCallback();
      };

      const statsTimer = setInterval(() => {
        const now = performance.now();
        const sampleMs = Math.max(1, now - lastStatsTimestamp);
        const sampleSeconds = sampleMs / 1000;
        const quality = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
        const totalVideoFrames = quality?.totalVideoFrames;
        const totalDroppedFrames = quality?.droppedVideoFrames;
        const qualityPresentedFrames =
          typeof totalVideoFrames === 'number' && typeof totalDroppedFrames === 'number'
            ? Math.max(0, totalVideoFrames - totalDroppedFrames)
            : null;
        const decodedFrames =
          typeof totalVideoFrames === 'number' && lastTotalVideoFrames !== null
            ? Math.max(0, totalVideoFrames - lastTotalVideoFrames)
            : frameCallbackCount;
        const droppedFrames =
          typeof totalDroppedFrames === 'number' && lastDroppedVideoFrames !== null
            ? Math.max(0, totalDroppedFrames - lastDroppedVideoFrames)
            : 0;
        const presentedFrames =
          qualityPresentedFrames !== null && lastPresentedVideoFrames !== null
            ? Math.max(0, qualityPresentedFrames - lastPresentedVideoFrames)
            : latestCallbackPresentedFrames !== null && lastCallbackPresentedFrames !== null
              ? Math.max(0, latestCallbackPresentedFrames - lastCallbackPresentedFrames)
              : frameCallbackCount;
        const decodedFps = normalizeFps(decodedFrames, sampleSeconds);
        const presentedFps = normalizeFps(presentedFrames, sampleSeconds);
        if (typeof totalVideoFrames === 'number') lastTotalVideoFrames = totalVideoFrames;
        if (typeof totalDroppedFrames === 'number') lastDroppedVideoFrames = totalDroppedFrames;
        if (qualityPresentedFrames !== null) lastPresentedVideoFrames = qualityPresentedFrames;
        if (latestCallbackPresentedFrames !== null) lastCallbackPresentedFrames = latestCallbackPresentedFrames;
        lastStatsTimestamp = now;
        frameCallbackCount = 0;
        statsEl.innerHTML = '<div>RX ' + decodedFps + ' fps</div><div>UI ' + presentedFps +
          ' fps</div><div>DROP ' + droppedFrames + '</div>';
        if (pc.connectionState === 'connected' || decodedFps > 0 || presentedFps > 0) {
          api.reportMonitorStats({
            label: label + '-EXT',
            receivedFps: decodedFps,
            renderedFps: presentedFps,
            skippedFrames: droppedFrames,
            sampleMs,
            rasterWidth: video.videoWidth || 0,
            rasterHeight: video.videoHeight || 0
          });
        }
      }, 1000);

      window.addEventListener('beforeunload', () => {
        disposed = true;
        clearInterval(statsTimer);
        removeAnswerListener();
        removeIceListener();
        pc.close();
        void stopMonitor().catch(() => {});
      });

      setTimeout(() => void start().catch((error) => {
        console.error('Error iniciando monitor externo', label, error);
        setLabelState('error');
      }), 500);
    </script>
  </body>
</html>`
}

export function ExternalMonitorWebView({
  target,
  label,
  borderColor,
  width,
  height,
  isRunning,
  startSignal,
  preloadUrl
}: {
  target: 'preview' | 'program'
  label: string
  borderColor: string
  width: number
  height: number
  isRunning: boolean
  startSignal: number
  preloadUrl: string | null
}): React.JSX.Element {
  const html = createExternalMonitorHtml(target, label)
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`

  if (!isRunning || !preloadUrl) {
    return (
      <MonitorPlaceholder label={label} width={width} height={height} borderColor={borderColor} />
    )
  }

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#000',
        boxShadow: `inset 0 0 0 2px ${borderColor}`,
        borderRadius: '4px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <webview
        key={`${target}-${startSignal}`}
        src={src}
        preload={preloadUrl}
        partition={`persist:openmix-monitor-${target}`}
        ref={(node) => {
          node?.setAttribute('width', String(width))
          node?.setAttribute('height', String(height))
        }}
        webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=no"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          minWidth: `${width}px`,
          minHeight: `${height}px`,
          display: 'block',
          border: '0',
          position: 'absolute',
          inset: 0
        }}
      />
    </div>
  )
}
