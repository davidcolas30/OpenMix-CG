;(function () {
  /**
   * Perfiles de captura/envío del móvil.
   *
   * El bridge WebRTC ya acepta hasta 1080p, pero la estabilidad depende de
   * dos capas previas: si el sensor puede sostener 30fps con luz suficiente
   * y si el sender/WebRTC aguanta el salto de carga sin caer de cadencia.
   *
   * Por eso separamos aquí tres objetivos de captura. El perfil estable se
   * mantiene en 360p30; HD y Full HD sirven como pasos experimentales para
   * comprobar si el cuello siguiente está en el emisor o más adelante.
   */
  const MOBILE_VIDEO_PROFILES = Object.freeze({
    balanced: Object.freeze({
      id: 'balanced',
      buttonLabel: '360p',
      description: '360p30',
      width: 640,
      height: 360,
      frameRate: 30,
      maxBitrate: 1_500_000,
      minBitrate: 800_000,
      startBitrate: 1_000_000,
      degradationPreference: 'maintain-framerate'
    }),
    hd: Object.freeze({
      id: 'hd',
      buttonLabel: '720p',
      description: '720p30',
      width: 1280,
      height: 720,
      frameRate: 30,
      maxBitrate: 4_000_000,
      minBitrate: 2_000_000,
      startBitrate: 3_000_000,
      degradationPreference: 'maintain-framerate'
    }),
    fullhd: Object.freeze({
      id: 'fullhd',
      buttonLabel: '1080p',
      description: '1080p30',
      width: 1920,
      height: 1080,
      frameRate: 30,
      maxBitrate: 6_000_000,
      minBitrate: 3_000_000,
      startBitrate: 4_500_000,
      recordingMaxBitrate: 12_000_000,
      recordingMinBitrate: 6_000_000,
      recordingStartBitrate: 8_000_000,
      sdpMaxBitrate: 12_000_000,
      degradationPreference: 'maintain-framerate',
      recordingDegradationPreference: 'maintain-resolution',
      allowEncoderScaling: true
    })
  })

  window.OpenMixMobileVideoPolicy = Object.freeze({
    MOBILE_VIDEO_PROFILES,
    MOBILE_VIDEO_PROFILE_ORDER: Object.freeze(['balanced', 'hd', 'fullhd']),
    DEFAULT_MOBILE_VIDEO_STATS_INTERVAL_MS: 2000,
    POST_WARMUP_KEYFRAME_MIN_BITRATE_KBPS: 2500,
    POST_WARMUP_KEYFRAME_MIN_FPS: 24,
    AUTO_VIDEO_PROMOTION_MIN_FPS: 29,
    AUTO_VIDEO_PROMOTION_MIN_AVAILABLE_KBPS: 8_000,
    AUTO_VIDEO_PROMOTION_REQUIRED_SAMPLES: 2,
    AUTO_VIDEO_DEMOTION_MAX_FPS: 27,
    AUTO_VIDEO_DEMOTION_MAX_AVAILABLE_KBPS: 5_000,
    AUTO_VIDEO_DEMOTION_REQUIRED_SAMPLES: 2,
    AUTO_VIDEO_MIN_SWITCH_INTERVAL_MS: 12_000
  })
})()
