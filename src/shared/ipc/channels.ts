/**
 * Canales IPC centralizados.
 *
 * Todos los nombres de canales que se usan entre Main y Renderer se definen
 * aquí como constantes. Así evitamos cadenas sueltas repartidas por el código
 * y los errores tipográficos se detectan en compilación.
 *
 * Convención de nombres: "módulo:acción" en kebab-case.
 */
export const ipcChannels = {
  // ── Mixer (Fase 2 — Paradigma Preview/Program) ─────────
  // Canales de comando (Renderer → Main): invoke/handle
  mixerStart: 'mixer:start',
  mixerStop: 'mixer:stop',
  mixerCut: 'mixer:cut',
  mixerAutoTransition: 'mixer:auto-transition',
  mixerSetProgramSource: 'mixer:set-program-source',
  mixerSetPreviewSource: 'mixer:set-preview-source',
  mixerGetState: 'mixer:get-state',
  mixerReportMonitorStats: 'mixer:report-monitor-stats',
  mixerGetMonitorSettings: 'mixer:get-monitor-settings',
  mixerUpdateMonitorSettings: 'mixer:update-monitor-settings',
  mixerGetPreviewMonitorTransport: 'mixer:get-preview-monitor-transport',
  mixerGetMonitorSurfaceConfig: 'mixer:get-monitor-surface-config',
  mixerGetMonitorTargets: 'mixer:get-monitor-targets',
  mixerGetRecordingAudioState: 'mixer:get-recording-audio-state',
  mixerSetRecordingAudioDelay: 'mixer:set-recording-audio-delay',
  mixerSetNativeMonitorLayout: 'mixer:set-native-monitor-layout',
  mixerStartPreviewMonitorWebRtc: 'mixer:start-preview-monitor-webrtc',
  mixerAddPreviewMonitorIceCandidate: 'mixer:add-preview-monitor-ice-candidate',
  mixerStopPreviewMonitorWebRtc: 'mixer:stop-preview-monitor-webrtc',
  mixerStartProgramMonitorWebRtc: 'mixer:start-program-monitor-webrtc',
  mixerAddProgramMonitorIceCandidate: 'mixer:add-program-monitor-ice-candidate',
  mixerStopProgramMonitorWebRtc: 'mixer:stop-program-monitor-webrtc',
  mixerStartCombinedMonitorWebRtc: 'mixer:start-combined-monitor-webrtc',
  mixerAddCombinedMonitorIceCandidate: 'mixer:add-combined-monitor-ice-candidate',
  mixerStopCombinedMonitorWebRtc: 'mixer:stop-combined-monitor-webrtc',
  mixerStartMultiviewMonitorWebRtc: 'mixer:start-multiview-monitor-webrtc',
  mixerAddMultiviewMonitorIceCandidate: 'mixer:add-multiview-monitor-ice-candidate',
  mixerStopMultiviewMonitorWebRtc: 'mixer:stop-multiview-monitor-webrtc',
  // Canales de eventos (Main → Renderer): send/on
  mixerPgmFrame: 'mixer:pgm-frame',
  mixerPvwFrame: 'mixer:pvw-frame',
  mixerSourceFrame: 'mixer:source-frame',
  mixerAudioReferenceFrame: 'mixer:audio-reference-frame',
  mixerBusMessage: 'mixer:bus-message',
  mixerPreviewMonitorWebRtcAnswer: 'mixer:preview-monitor-webrtc-answer',
  mixerPreviewMonitorWebRtcIceCandidate: 'mixer:preview-monitor-webrtc-ice-candidate',
  mixerProgramMonitorWebRtcAnswer: 'mixer:program-monitor-webrtc-answer',
  mixerProgramMonitorWebRtcIceCandidate: 'mixer:program-monitor-webrtc-ice-candidate',
  mixerCombinedMonitorWebRtcAnswer: 'mixer:combined-monitor-webrtc-answer',
  mixerCombinedMonitorWebRtcIceCandidate: 'mixer:combined-monitor-webrtc-ice-candidate',
  mixerMultiviewMonitorWebRtcAnswer: 'mixer:multiview-monitor-webrtc-answer',
  mixerMultiviewMonitorWebRtcIceCandidate: 'mixer:multiview-monitor-webrtc-ice-candidate',

  // ── Sources (Fase 3 — WebRTC) ───────────────────────
  // Canales de comando (Renderer → Main)
  sourcesList: 'sources:list',
  sourcesCreateToken: 'sources:create-token',
  sourcesRemovePeer: 'sources:remove-peer',
  sourcesGetServerInfo: 'sources:get-server-info',
  sourcesChooseLocalVideo: 'sources:choose-local-video',
  sourcesLoadLocalVideo: 'sources:load-local-video',
  sourcesClearLocalVideo: 'sources:clear-local-video',
  sourcesRestartLocalVideo: 'sources:restart-local-video',
  sourcesSetLocalVideoPaused: 'sources:set-local-video-paused',
  sourcesSetLocalVideoLoop: 'sources:set-local-video-loop',
  sourcesSetLocalVideoAutoPlay: 'sources:set-local-video-auto-play',
  sourcesListLocalVideos: 'sources:list-local-videos',
  // Canales de eventos (Main → Renderer)
  sourcesPeerState: 'sources:peer-state',
  sourcesLocalVideosChanged: 'sources:local-videos-changed',

  // ── Graphics ───────────────────────────────────────────
  graphicsListTemplates: 'graphics:list-templates',
  graphicsAddTemplate: 'graphics:add-template',
  graphicsSelectItem: 'graphics:select-item',
  graphicsRemoveItem: 'graphics:remove-item',
  graphicsUpdateField: 'graphics:update-field',
  graphicsSetPlacement: 'graphics:set-placement',
  graphicsSetOverlayTargets: 'graphics:set-overlay-targets',
  graphicsShowItem: 'graphics:show-item',
  graphicsHideItem: 'graphics:hide-item',
  graphicsGetState: 'graphics:get-state',
  graphicsGetPreviewFrame: 'graphics:get-preview-frame',
  graphicsGetMixerFrame: 'graphics:get-mixer-frame',
  graphicsSetPreviewOutput: 'graphics:set-preview-output',
  graphicsPreviewFrame: 'graphics:preview-frame',
  graphicsMixerFrame: 'graphics:mixer-frame',

  // ── Output ─────────────────────────────────────────────
  outputStartRecording: 'output:start-recording',
  outputStopRecording: 'output:stop-recording',
  outputGetRecordingState: 'output:get-recording-state',
  outputGetRecordingSettings: 'output:get-recording-settings',
  outputUpdateRecordingSettings: 'output:update-recording-settings',
  outputChooseRecordingDirectory: 'output:choose-recording-directory',

  // ── Shortcuts ──────────────────────────────────────────
  shortcutsGetSettings: 'shortcuts:get-settings',
  shortcutsUpdateBinding: 'shortcuts:update-binding',
  shortcutsResetDefaults: 'shortcuts:reset-defaults'
} as const
