;(function () {
  const DISABLED_VALUES = new Set(['0', 'false', 'off', 'none', 'disabled'])

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
  }

  function readFirstSearchValue(params, keys) {
    for (const key of keys) {
      const value = params.get(key)
      if (value !== null && value !== '') {
        return value
      }
    }

    return null
  }

  function parseBooleanMode(value) {
    if (value === null || value === undefined || value === '') {
      return undefined
    }

    return !DISABLED_VALUES.has(normalizeText(value))
  }

  function parseQualityMode(value) {
    const normalized = normalizeText(value)
    if (!normalized) {
      return undefined
    }

    if (normalized === 'recording' || normalized === 'rec') {
      return 'recording'
    }

    if (normalized === 'auto' || normalized === 'adaptive') {
      return 'auto'
    }

    return 'monitor'
  }

  function parseCodec(value) {
    const normalized = normalizeText(value)
    if (!normalized) {
      return undefined
    }

    return normalized === 'vp8' ? 'vp8' : 'h264'
  }

  function parseBitrateMode(value) {
    const normalized = normalizeText(value)
    if (!normalized) {
      return undefined
    }

    if (['auto', 'browser', 'native'].includes(normalized)) {
      return 'auto'
    }

    if (['cap', 'capped', 'ceiling', 'max-only'].includes(normalized)) {
      return 'cap'
    }

    return 'guided'
  }

  function parseSenderMode(value) {
    const normalized = normalizeText(value)
    if (!normalized) {
      return undefined
    }

    return ['legacy', 'plain', 'browser-default'].includes(normalized) ? 'legacy' : 'managed'
  }

  function parseMaxBitrateKbps(value) {
    if (value === null || value === undefined || value === '') {
      return null
    }

    const parsed = Number(String(value).trim())
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }

    return Math.max(500, Math.min(30000, Math.round(parsed)))
  }

  function parseStatsIntervalMs(value) {
    const parsed = Number(value || '')
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined
    }

    return Math.max(250, Math.min(30000, Math.round(parsed)))
  }

  function normalizeProfile(value, validProfileIds) {
    if (typeof value !== 'string' || value.length === 0) {
      return undefined
    }

    return validProfileIds.includes(value) ? value : undefined
  }

  function normalizeConfig(config, validProfileIds) {
    if (!config || typeof config !== 'object') {
      return {}
    }

    const normalized = {}
    const profile = normalizeProfile(config.profile, validProfileIds)
    const qualityMode = parseQualityMode(config.qualityMode)
    const codec = parseCodec(config.codec)
    const bitrateMode = parseBitrateMode(config.bitrateMode)
    const senderMode = parseSenderMode(config.senderMode)
    const statsIntervalMs = parseStatsIntervalMs(config.statsIntervalMs)

    if (profile) normalized.profile = profile
    if (qualityMode) normalized.qualityMode = qualityMode
    if (codec) normalized.codec = codec
    if (bitrateMode) normalized.bitrateMode = bitrateMode
    if (senderMode) normalized.senderMode = senderMode
    if (typeof config.audio === 'boolean') normalized.audio = config.audio
    if (typeof config.localPreview === 'boolean') normalized.localPreview = config.localPreview
    if (typeof config.cadenceMonitor === 'boolean') {
      normalized.cadenceMonitor = config.cadenceMonitor
    }
    if (typeof config.stats === 'boolean') normalized.stats = config.stats
    if (typeof config.transportCc === 'boolean') normalized.transportCc = config.transportCc
    if (Object.prototype.hasOwnProperty.call(config, 'maxBitrateKbps')) {
      normalized.maxBitrateKbps = parseMaxBitrateKbps(config.maxBitrateKbps)
    }
    if (statsIntervalMs) normalized.statsIntervalMs = statsIntervalMs

    return normalized
  }

  function parseQueryConfig(search, validProfileIds) {
    const params = new URLSearchParams(search)
    const config = {}
    const preset = readFirstSearchValue(params, ['preset', 'clientPreset'])
    const profile = normalizeProfile(params.get('profile'), validProfileIds)
    const qualityMode = parseQualityMode(
      readFirstSearchValue(params, ['quality', 'videoQualityMode'])
    )
    const codec = parseCodec(readFirstSearchValue(params, ['codec', 'videoCodec']))
    const bitrateMode = parseBitrateMode(
      readFirstSearchValue(params, ['bitrate', 'bitrateMode', 'videoBitrateMode'])
    )
    const senderMode = parseSenderMode(
      readFirstSearchValue(params, ['sender', 'senderMode', 'videoSenderMode'])
    )
    const audio = parseBooleanMode(readFirstSearchValue(params, ['audio', 'audioMode']))
    const localPreview = parseBooleanMode(
      readFirstSearchValue(params, ['preview', 'localPreview', 'cameraPreview'])
    )
    const cadenceMonitor = parseBooleanMode(
      readFirstSearchValue(params, ['cadence', 'cadenceMonitor', 'localCadence'])
    )
    const stats = parseBooleanMode(readFirstSearchValue(params, ['stats', 'diagnostics']))
    const transportCc = parseBooleanMode(
      readFirstSearchValue(params, ['twcc', 'transportCc', 'transport-cc'])
    )
    const maxBitrateKbps = parseMaxBitrateKbps(
      readFirstSearchValue(params, ['maxBitrateKbps', 'videoMaxBitrateKbps'])
    )
    const statsIntervalMs = parseStatsIntervalMs(
      readFirstSearchValue(params, ['statsIntervalMs', 'statsInterval'])
    )

    if (preset) config.preset = normalizeText(preset)
    if (profile) config.profile = profile
    if (qualityMode) config.qualityMode = qualityMode
    if (codec) config.codec = codec
    if (bitrateMode) config.bitrateMode = bitrateMode
    if (senderMode) config.senderMode = senderMode
    if (audio !== undefined) config.audio = audio
    if (localPreview !== undefined) config.localPreview = localPreview
    if (cadenceMonitor !== undefined) config.cadenceMonitor = cadenceMonitor
    if (stats !== undefined) config.stats = stats
    if (transportCc !== undefined) config.transportCc = transportCc
    if (maxBitrateKbps) config.maxBitrateKbps = maxBitrateKbps
    if (statsIntervalMs) config.statsIntervalMs = statsIntervalMs

    return {
      token: params.get('token'),
      config
    }
  }

  window.OpenMixMobileClientConfig = {
    normalizeConfig,
    parseMaxBitrateKbps,
    parseQueryConfig
  }
})()
