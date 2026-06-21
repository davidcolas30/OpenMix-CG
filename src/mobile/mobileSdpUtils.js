;(function () {
  /**
   * Da prioridad a perfiles H264 más estables para emisión en tiempo real.
   *
   * Los logs recientes muestran negociación `profile-level-id=64001f` (High)
   * y una caída simultánea del sender y del receptor a ~16-17fps. Como el
   * cuello ya no está en la red ni en el bridge, aquí preferimos Baseline /
   * Constrained Baseline, luego Main, y dejamos High como último recurso.
   */
  function scoreH264Codec(codec) {
    const fmtp = codec?.sdpFmtpLine || ''
    const match = /profile-level-id=([0-9a-fA-F]{6})/.exec(fmtp)
    const profileLevelId = match ? match[1].toLowerCase() : ''
    const profilePrefix = profileLevelId.slice(0, 2)

    switch (profilePrefix) {
      case '42':
        return 300 // Baseline / Constrained Baseline
      case '4d':
      case '58':
        return 200 // Main / Extended
      case '64':
        return 100 // High profile
      default:
        return 0
    }
  }

  /**
   * Añade pistas de bitrate a la SDP offer de vídeo.
   *
   * RTCRtpSender.setParameters() ya fija maxBitrate/minBitrate, pero los
   * logs de 1080p30 muestran que Chrome puede arrancar igualmente con una
   * estimación de ancho de banda muy conservadora (~300kbps). A esa tasa,
   * H.264 1080p con movimiento produce macro-bloques aunque la LAN no pierda
   * paquetes. Estas pistas SDP son un mecanismo no estándar de Chrome, por
   * eso se mantienen aquí como ajuste experimental del spike 1080p30.
   */
  function applyVideoSdpBitrateHints(description, options = {}) {
    const originalSdp = description?.sdp
    if (!originalSdp) {
      return description
    }

    const senderMode = options.senderMode || 'managed'
    const bitrateMode = options.bitrateMode || 'cap'
    const videoProfile = options.videoProfile
    const maxBitrateBps = Number(options.maxBitrateBps)

    if (senderMode === 'legacy') {
      console.log('[WebRTC] SDP bitrate hints omitidos: sender=legacy')
      return description
    }

    if (bitrateMode !== 'guided') {
      console.log(
        `[WebRTC] SDP bitrate hints desactivados: ` +
          `bitrate=${bitrateMode === 'cap' ? 'max-only' : 'browser-auto'}`
      )
      return description
    }

    if (!videoProfile || !Number.isFinite(maxBitrateBps) || maxBitrateBps <= 0) {
      console.warn('[WebRTC] SDP bitrate hints omitidos: contexto de bitrate incompleto')
      return description
    }

    const sdpMaxBitrate = maxBitrateBps
    const maxKbps = Math.round(sdpMaxBitrate / 1000)
    const minBitrate = Number.isFinite(videoProfile.minBitrate)
      ? videoProfile.minBitrate
      : Math.floor(sdpMaxBitrate * 0.5)
    const startBitrate = Number.isFinite(videoProfile.startBitrate)
      ? videoProfile.startBitrate
      : minBitrate
    const minKbps = Math.min(Math.round(minBitrate / 1000), Math.floor(maxKbps * 0.75))
    const startKbps = Math.min(
      Math.round(startBitrate / 1000),
      Math.max(minKbps, Math.floor(maxKbps * 0.9))
    )
    const nextSdp = addVideoBandwidthLines(
      addH264GoogleBitrateFmtp(originalSdp, { minKbps, startKbps, maxKbps }),
      sdpMaxBitrate
    )

    if (nextSdp !== originalSdp) {
      console.log(
        `[WebRTC] SDP bitrate hints aplicados para ${videoProfile.description}: ` +
          `start=${startKbps}kbps min=${minKbps}kbps max=${maxKbps}kbps`
      )
    }

    return {
      type: description.type,
      sdp: nextSdp
    }
  }

  /**
   * Prueba de diagnóstico: permite retirar Transport-CC de la offer.
   *
   * Transport-wide congestion control añade una extensión RTP y feedback RTCP
   * para que el receptor informe al emisor de tiempos de llegada. En teoría
   * mejora la adaptación de bitrate, pero los pulsos actuales aparecen como
   * ráfagas de entrega ya en la entrada de `webrtcbin`; por eso necesitamos
   * comprobar si la cadencia de feedback TWCC forma parte del problema.
   */
  function applyVideoSdpTransportCcPolicy(description, options = {}) {
    const originalSdp = description?.sdp
    const transportCcEnabled = options.transportCcEnabled !== false
    if (transportCcEnabled || !originalSdp) {
      return description
    }

    const nextSdp = removeTransportCcFromVideoSdp(originalSdp)
    if (nextSdp !== originalSdp) {
      console.log('[WebRTC] Transport-CC retirado de la SDP offer para diagnóstico')
    } else {
      console.log(
        '[WebRTC] Transport-CC solicitado off, pero no se encontraron líneas TWCC en la offer'
      )
    }

    return {
      type: description.type,
      sdp: nextSdp
    }
  }

  function removeTransportCcFromVideoSdp(sdp) {
    const lineBreak = sdp.includes('\r\n') ? '\r\n' : '\n'
    const lines = sdp.split(lineBreak)
    const videoStart = lines.findIndex((line) => line.startsWith('m=video'))
    if (videoStart === -1) {
      return sdp
    }

    const videoEnd = findMediaSectionEnd(lines, videoStart)
    const nextLines = lines.filter((line, index) => {
      const inVideoSection = index > videoStart && index < videoEnd
      if (!inVideoSection) {
        return true
      }

      const normalized = line.toLowerCase()
      return (
        !normalized.includes('transport-wide-cc') && !/^a=rtcp-fb:\d+\s+transport-cc\b/i.test(line)
      )
    })

    return nextLines.join(lineBreak)
  }

  function addVideoBandwidthLines(sdp, maxBitrateBps) {
    const lineBreak = sdp.includes('\r\n') ? '\r\n' : '\n'
    const lines = sdp.split(lineBreak)
    const videoStart = lines.findIndex((line) => line.startsWith('m=video'))
    if (videoStart === -1) {
      return sdp
    }

    const videoEnd = findMediaSectionEnd(lines, videoStart)
    const filteredLines = lines.filter((line, index) => {
      const inVideoSection = index > videoStart && index < videoEnd
      return !inVideoSection || (!line.startsWith('b=AS:') && !line.startsWith('b=TIAS:'))
    })
    const nextVideoStart = filteredLines.findIndex((line) => line.startsWith('m=video'))
    const insertAt = findBandwidthInsertIndex(filteredLines, nextVideoStart)

    filteredLines.splice(
      insertAt,
      0,
      `b=AS:${Math.round(maxBitrateBps / 1000)}`,
      `b=TIAS:${maxBitrateBps}`
    )

    return filteredLines.join(lineBreak)
  }

  function addH264GoogleBitrateFmtp(sdp, bitrateHints) {
    const lineBreak = sdp.includes('\r\n') ? '\r\n' : '\n'
    const lines = sdp.split(lineBreak)
    const videoStart = lines.findIndex((line) => line.startsWith('m=video'))
    if (videoStart === -1) {
      return sdp
    }

    const videoEnd = findMediaSectionEnd(lines, videoStart)
    const h264Payloads = new Set()

    for (let i = videoStart + 1; i < videoEnd; i++) {
      const match = /^a=rtpmap:(\d+)\s+H264\/90000/i.exec(lines[i])
      if (match) {
        h264Payloads.add(match[1])
      }
    }

    if (h264Payloads.size === 0) {
      return sdp
    }

    const fmtpSuffix =
      `x-google-start-bitrate=${bitrateHints.startKbps};` +
      `x-google-min-bitrate=${bitrateHints.minKbps};` +
      `x-google-max-bitrate=${bitrateHints.maxKbps}`
    const payloadsWithFmtp = new Set()
    const nextLines = [...lines]

    for (let i = videoStart + 1; i < videoEnd; i++) {
      const match = /^a=fmtp:(\d+)\s+(.+)$/.exec(nextLines[i])
      if (!match || !h264Payloads.has(match[1])) {
        continue
      }

      payloadsWithFmtp.add(match[1])
      nextLines[i] = appendFmtpParameters(nextLines[i], fmtpSuffix)
    }

    for (let i = videoEnd - 1; i > videoStart; i--) {
      const match = /^a=rtpmap:(\d+)\s+H264\/90000/i.exec(nextLines[i])
      if (match && !payloadsWithFmtp.has(match[1])) {
        nextLines.splice(i + 1, 0, `a=fmtp:${match[1]} ${fmtpSuffix}`)
      }
    }

    return nextLines.join(lineBreak)
  }

  function appendFmtpParameters(line, parameters) {
    const [, payload, currentParams] = /^a=fmtp:(\d+)\s+(.+)$/.exec(line) || []
    if (!payload || !currentParams) {
      return line
    }

    const cleanedParams = currentParams
      .split(';')
      .map((part) => part.trim())
      .filter(
        (part) =>
          part &&
          !part.startsWith('x-google-start-bitrate=') &&
          !part.startsWith('x-google-min-bitrate=') &&
          !part.startsWith('x-google-max-bitrate=')
      )

    return `a=fmtp:${payload} ${[...cleanedParams, parameters].join(';')}`
  }

  function findMediaSectionEnd(lines, startIndex) {
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        return i
      }
    }

    return lines.length
  }

  function findBandwidthInsertIndex(lines, videoStart) {
    for (let i = videoStart + 1; i < lines.length; i++) {
      if (!lines[i].startsWith('i=') && !lines[i].startsWith('c=')) {
        return i
      }
    }

    return videoStart + 1
  }

  window.OpenMixMobileSdpUtils = Object.freeze({
    addH264GoogleBitrateFmtp,
    addVideoBandwidthLines,
    applyVideoSdpBitrateHints,
    applyVideoSdpTransportCcPolicy,
    removeTransportCcFromVideoSdp,
    scoreH264Codec
  })
})()
