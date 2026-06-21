#include "gstreamer_addon_wiring.h"

#include "gstreamer_addon_state.h"
#include "graphics_overlay_controls.h"
#include "graphics_overlay_runtime.h"
#include "gst_utils.h"
#include "local_video_controls.h"
#include "mixer_control_actions.h"
#include "mixer_diagnostics_state.h"
#include "mixer_pipeline_cleanup.h"
#include "mixer_pipeline_creation.h"
#include "mixer_pipeline_diagnostics.h"
#include "mixer_pipeline_handles.h"
#include "mixer_pipeline_js_callbacks.h"
#include "mixer_pipeline_lifecycle.h"
#include "mixer_pipeline_pads.h"
#include "mixer_pipeline_runtime_refs.h"
#include "mixer_route_controls.h"
#include "mixer_runtime_config.h"
#include "mixer_selector_links.h"
#include "monitor_diagnostics.h"
#include "monitor_frame_bridge.h"
#include "monitor_webrtc_controls.h"
#include "multiview_source_control.h"
#include "native_monitor_controls.h"
#include "recording_controls.h"
#include "sync_buffer_manager.h"
#include "webrtc_h264_branch.h"
#include "webrtc_h264_trace.h"
#include "webrtc_jitterbuffer_hooks.h"
#include "webrtc_legacy_bridge.h"
#include "webrtc_media_dispatch.h"
#include "webrtc_peer_controls.h"
#include "webrtc_peer_lifecycle.h"
#include "webrtc_runtime_controls.h"

static GraphicsOverlayRuntimeContext make_graphics_overlay_runtime_context()
{
  GraphicsOverlayRuntimeContext context;
  context.branchesEnabled = g_graphicsOverlayBranchesEnabled;
  context.programRecordingEnabled = g_programRecordingEnabled;
  context.nativeProgramRecordingActive = g_nativeProgramRecordingActive;
  context.pumpMode = g_graphicsOverlayPumpMode;
  context.overlayWidth = g_graphicsOverlayWidth;
  context.overlayHeight = g_graphicsOverlayHeight;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.pipeline = g_pipeline;
  context.programAppsrc = g_graphics_pgm_appsrc;
  context.previewAppsrc = g_graphics_pvw_appsrc;
  context.programPad = g_graphics_pgm_pad;
  context.previewPad = g_graphics_pvw_pad;
  context.programFrame = &g_graphicsPgmLatestFrame;
  context.previewFrame = &g_graphicsPvwLatestFrame;
  context.mutex = &g_mutex;
  context.mediaPlaneActive = &g_mediaPlaneActive;
  context.recordingProgramOverlayActive = &g_recordingProgramOverlayActive;
  context.pumpRunning = &g_graphicsOverlayPumpRunning;
  context.pumpThread = &g_graphicsOverlayPumpThread;
  return context;
}

static void cancel_active_transition_locked();
static void set_multiview_source_active(int sourceIndex, bool active);
static void reset_multiview_source_activity();
static void configure_webrtc_runtime_controls_context();
static void configure_native_monitor_controls_context();
static void configure_graphics_overlay_controls_context();
static void configure_mixer_route_controls_context();
static void configure_mixer_control_actions_context();
static void configure_mixer_pipeline_creation_context();
static void configure_mixer_pipeline_lifecycle_context();
static void configure_mixer_pipeline_runtime_refs_context();
static void configure_local_video_controls_context();
static void configure_recording_controls_context();

static void configure_mixer_diagnostics_state_context()
{
  MixerDiagnosticsStateContext context;
  context.sourceCount = NUM_SOURCES;
  context.multiviewColumns = MULTIVIEW_COLUMNS;
  context.multiviewGutter = MULTIVIEW_GUTTER;
  context.multiviewSlotWidth = MULTIVIEW_SLOT_WIDTH;
  context.multiviewSlotHeight = MULTIVIEW_SLOT_HEIGHT;
  context.sourceNames = SOURCE_NAMES;
  context.programSource = &g_programSourceForOverlay;
  context.previewSource = &g_previewSourceForOverlay;
  context.multiviewHudEnabled = &g_multiviewHudEnabled;
  context.multiviewStaticBarsOverlayEnabled =
    &g_multiviewStaticBarsOverlayEnabled;
  context.multiviewBarsCacheEnabled = &g_multiviewBarsCacheEnabled;
  configure_mixer_diagnostics_state(context);
}

static void configure_monitor_diagnostics_runtime_context()
{
  MonitorDiagnosticsRuntimeContext context;
  context.realtimeDiagnosticLogsEnabled = &g_realtimeDiagnosticLogsEnabled;
  context.stutterTraceEnabled = &g_stutterTraceEnabled;
  context.rtpTimelineTraceEnabled = &g_rtpTimelineTraceEnabled;
  context.rtpTimelineSummaryEnabled = &g_rtpTimelineSummaryEnabled;
  set_monitor_diagnostics_runtime_context(context);
}

static void configure_monitor_frame_bridge_runtime_context()
{
  MonitorFrameBridgeContext context;
  context.pipeline = &g_pipeline;
  context.pgmFrameCallback = &g_pgmFrameCallback;
  context.pvwFrameCallback = &g_pvwFrameCallback;
  context.thumbFrameCallback = &g_thumbFrameCallback;
  context.busCallback = &g_busCallback;
  context.pgmRecordingFrameCallback = &g_pgmRecordingFrameCallback;
  context.audioReferenceFrameCallback = &g_audioReferenceFrameCallback;
  context.mediaPlaneActive = &g_mediaPlaneActive;
  context.activeWebrtcPeerCount = &g_activeWebrtcPeerCount;
  context.syncBufferDecodedPeerCount = &g_syncBufferDecodedPeerCount;
  context.realtimeDiagnosticLogsEnabled = &g_realtimeDiagnosticLogsEnabled;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.thumbnailsEnabled = &g_thumbnailsEnabled;
  context.syncBufferEnabled = &g_syncBufferEnabled;
  context.monitorIpcMode = &g_monitorIpcMode;
  context.monitorActiveFps = &g_monitorActiveFps;
  context.monitorActiveIntervalMs = &g_monitorActiveIntervalMs;
  context.monitorIdleIntervalMs = &g_monitorIdleIntervalMs;
  context.syncBufferMinPeers = &g_syncBufferMinPeers;
  context.lastPgmMonitorFrameTime = mixer_last_pgm_monitor_frame_time();
  context.lastPvwMonitorFrameTime = mixer_last_pvw_monitor_frame_time();
  context.lastThumbTime = g_lastThumbTime;
  context.sourceCount = NUM_SOURCES;
  context.pgmDiagnostics = mixer_pgm_stream_diagnostics();
  context.pvwDiagnostics = mixer_pvw_stream_diagnostics();
  context.maxMonitorFps = MAX_MONITOR_FPS;
  context.thumbIntervalMs = THUMB_INTERVAL_MS;
  context.diagnosticLogIntervalMs = DIAGNOSTIC_LOG_INTERVAL_MS;
  set_monitor_frame_bridge_context(context);
}

static void configure_sync_buffer_runtime_context()
{
  SyncBufferRuntimeContext context;
  context.sourceCount = NUM_SOURCES;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.diagnosticLogIntervalMs = DIAGNOSTIC_LOG_INTERVAL_MS;
  context.ntpAgeSmoothingAlpha = SYNC_BUFFER_NTP_AGE_SMOOTHING_ALPHA;
  context.enabled = &g_syncBufferEnabled;
  context.statsEnabled = &g_syncBufferStatsEnabled;
  context.ntpEnabled = &g_syncBufferNtpEnabled;
  context.ntpApplyEnabled = &g_syncBufferNtpApplyEnabled;
  context.retimerEnabled = &g_syncBufferRetimerEnabled;
  context.clockGateEnabled = &g_syncBufferClockGateEnabled;
  context.latencyMs = &g_syncBufferLatencyMs;
  context.maxBuffers = &g_syncBufferMaxBuffers;
  context.maxTimeMs = &g_syncBufferMaxTimeMs;
  context.minPeers = &g_syncBufferMinPeers;
  context.ntpMaxDelayMs = &g_syncBufferNtpMaxDelayMs;
  context.ntpMinStepMs = &g_syncBufferNtpMinStepMs;
  context.ntpAdjustIntervalMs = &g_syncBufferNtpAdjustIntervalMs;
  context.ntpMaxStepMs = &g_syncBufferNtpMaxStepMs;
  context.decodedPeerCount = &g_syncBufferDecodedPeerCount;
  context.getPeerRunningTime = [](WebRTCPeer* peer) -> GstClockTime {
    GstElement* clockOwner = nullptr;
    if (peer && peer->standalonePipeline) {
      clockOwner = peer->pipeline;
    } else {
      clockOwner = g_pipeline;
    }
    return get_gst_element_running_time(clockOwner, false);
  };
  set_sync_buffer_runtime_context(context);
}

static void configure_webrtc_legacy_bridge_context()
{
  WebRtcLegacyBridgeContext context;
  context.bridgeWidth = &g_webrtcBridgeWidth;
  context.bridgeHeight = &g_webrtcBridgeHeight;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.diagnosticLogIntervalMs = DIAGNOSTIC_LOG_INTERVAL_MS;
  context.realtimeDiagnosticLogsEnabled = &g_realtimeDiagnosticLogsEnabled;
  context.setSourceActive = [](int sourceIndex, bool active) {
    set_multiview_source_active(sourceIndex, active);
  };
  set_webrtc_legacy_bridge_context(context);
}

static void configure_webrtc_h264_trace_context()
{
  WebRtcH264TraceContext context;
  context.stutterTraceEnabled = &g_stutterTraceEnabled;
  context.h264KeyframeTraceEnabled = &g_h264KeyframeTraceEnabled;
  set_webrtc_h264_trace_context(context);
}

static void configure_webrtc_jitterbuffer_hooks_context()
{
  WebRtcJitterbufferHooksContext context;
  context.sourceCount = NUM_SOURCES;
  context.syncBufferNtpEnabled = &g_syncBufferNtpEnabled;
  context.syncBufferStatsEnabled = &g_syncBufferStatsEnabled;
  context.webrtcRxStatsEnabled = &g_webrtcRxStatsEnabled;
  context.rtpTimelineSummaryEnabled = &g_rtpTimelineSummaryEnabled;
  context.webrtcRtpTimelineDiagnostics = mixer_webrtc_rtp_timeline_diagnostics();
  set_webrtc_jitterbuffer_hooks_context(context);
}

static void configure_webrtc_media_dispatch_context()
{
  WebRtcMediaDispatchContext context;
  context.sourceCount = NUM_SOURCES;
  context.rtpDirectSinkEnabled = &g_webrtcRtpDirectSinkEnabled;
  context.stutterTraceEnabled = &g_stutterTraceEnabled;
  context.decodeBranchEnabled = &g_webrtcDecodeBranchEnabled;
  context.webrtcRtpDiagnostics = mixer_webrtc_rtp_diagnostics();
  context.webrtcRtpTimelineDiagnostics = mixer_webrtc_rtp_timeline_diagnostics();
  context.makeH264BranchContext = []() {
    return make_webrtc_runtime_h264_branch_context();
  };
  set_webrtc_media_dispatch_context(context);
}

static void configure_webrtc_runtime_controls_context()
{
  WebRtcRuntimeControlsContext context;
  context.sourceCount = NUM_SOURCES;
  context.firstWebrtcSourceIndex = FIRST_WEBRTC_SOURCE_INDEX;
  context.monitorWidth = &g_monitorWidth;
  context.monitorHeight = &g_monitorHeight;
  context.internalWidth = MIXER_INTERNAL_WIDTH;
  context.internalHeight = MIXER_INTERNAL_HEIGHT;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.recordingRawQueueBuffers = RECORDING_RAW_QUEUE_BUFFERS;

  context.standaloneRxEnabled = g_webrtcStandaloneRxEnabled;
  context.pliReserveThreadEnabled = g_pliReserveThreadEnabled;
  context.receiveLatencyMs = g_webrtcReceiveLatencyMs;
  context.rxStatsEnabled = g_webrtcRxStatsEnabled;
  context.rxStatsIntervalMs = g_webrtcRxStatsIntervalMs;

  context.syncBufferLatencyMs = g_syncBufferLatencyMs;
  context.webrtcRtpQueueBuffers = g_webrtcRtpQueueBuffers;
  context.webrtcRtpQueueTimeMs = g_webrtcRtpQueueTimeMs;
  context.programSource = &g_programSource;
  context.syncBufferEnabled = g_syncBufferEnabled;
  context.webrtcDecodeBranchEnabled = g_webrtcDecodeBranchEnabled;
  context.webrtcMonitorBranchEnabled = g_webrtcMonitorBranchEnabled;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.stutterTraceEnabled = g_stutterTraceEnabled;
  context.h264KeyframeTraceEnabled = g_h264KeyframeTraceEnabled;
  context.monitorNormalizeMode = g_webrtcMonitorNormalizeMode;

  context.pipeline = &g_pipeline;
  context.webrtcSelectors = g_webrtc_selectors;
  context.webrtcRecordingSelectors = g_webrtc_recording_selectors;
  context.webrtcRtpDiagnostics = mixer_webrtc_rtp_diagnostics();
  context.webrtcEncodedDiagnostics = mixer_webrtc_encoded_diagnostics();
  context.webrtcDecodedDiagnostics = mixer_webrtc_decoded_diagnostics();
  context.webrtcMonitorOutDiagnostics = mixer_webrtc_monitor_out_diagnostics();
  context.webrtcRtpTimelineDiagnostics = mixer_webrtc_rtp_timeline_diagnostics();

  context.peers = &g_webrtcPeers;
  context.peersMutex = &g_webrtcMutex;
  context.activePeerCount = &g_activeWebrtcPeerCount;
  context.rxStatsRunning = &g_webrtcRxStatsRunning;
  context.rxStatsThread = &g_webrtcRxStatsThread;
  context.localVideoSources = g_localVideoSources;

  context.h264ParseSrcProbe = on_webrtc_h264_parse_src_probe;
  context.setSourceActive = [](int sourceIndex, bool active) {
    set_multiview_source_active(sourceIndex, active);
  };
  context.setSlotToFallback = [](int sourceIndex) {
    mixer_route_control_set_webrtc_slot_to_fallback(sourceIndex);
  };
  context.unmarkDecodedPeer = [](WebRTCPeer* peer) {
    unmark_peer_decoded_for_sync_buffer_timing(peer);
  };
  context.sourceMatchesRecordingKeepWarmSelection =
    [](int sourceIndex, int firstSource, int secondSource) {
      return mixer_route_control_source_matches_recording_keepwarm_selection(
        sourceIndex,
        firstSource,
        secondSource);
    };
  context.linkBranchesToMixerSelectors =
    [](WebRTCPeer* peer, GstElement* monitorOutQueue, GstElement* recordingOutQueue) {
      return link_webrtc_branches_to_mixer_selectors(
        peer,
        monitorOutQueue,
        recordingOutQueue);
    };
  set_webrtc_runtime_controls_context(context);
}

static void configure_monitor_webrtc_controls_context()
{
  MonitorWebRtcControlsContext context;
  context.pipeline = &g_pipeline;
  context.previewEndpoint = &g_pvwMonitorWebRtcEndpoint;
  context.programEndpoint = &g_pgmMonitorWebRtcEndpoint;
  context.combinedEndpoint = &g_combinedMonitorWebRtcEndpoint;
  context.multiviewEndpoint = &g_multiviewMonitorWebRtcEndpoint;
  set_monitor_webrtc_controls_context(context);
}

static void configure_native_monitor_controls_context()
{
  NativeMonitorControlsContext context;
  context.pipeline = &g_pipeline;
  context.nativeMonitorWindowsEnabled = &g_nativeMonitorWindowsEnabled;
  context.monitorRendererMode = &g_monitorRendererMode;
  context.pgmSelectorSink = &g_pgm_selector_native_monitor_sink;
  context.pgmSelectorValve = &g_pgm_selector_native_monitor_valve;
  context.pvwSelectorSink = &g_pvw_selector_native_monitor_sink;
  context.pvwSelectorValve = &g_pvw_selector_native_monitor_valve;
  context.pgmDirectSink = &g_pgm_native_monitor_sink;
  context.pgmDirectValve = &g_pgm_native_monitor_valve;
  context.pvwDirectSink = &g_pvw_native_monitor_sink;
  context.pvwDirectValve = &g_pvw_native_monitor_valve;
  context.multiviewSink = &g_multiview_native_monitor_sink;
  context.multiviewValve = &g_multiview_native_monitor_valve;
  context.audioReferenceSink = &g_audio_reference_native_monitor_sink;
  context.audioReferenceValve = &g_audio_reference_native_monitor_valve;
  context.audioReferenceFrameValve = &g_audio_reference_frame_valve;
  set_native_monitor_controls_context(context);
}

static void configure_graphics_overlay_controls_context()
{
  GraphicsOverlayControlsContext context;
  context.makeRuntimeContext = []() {
    return make_graphics_overlay_runtime_context();
  };
  set_graphics_overlay_controls_context(context);
}

static void configure_mixer_route_controls_context()
{
  MixerRouteControlsContext context;
  context.sourceCount = NUM_SOURCES;
  context.firstWebrtcSourceIndex = FIRST_WEBRTC_SOURCE_INDEX;
  context.internalWidth = MIXER_INTERNAL_WIDTH;
  context.internalHeight = MIXER_INTERNAL_HEIGHT;
  context.programSource = &g_programSource;
  context.previewSource = &g_previewSource;
  context.monitorWidth = &g_monitorWidth;
  context.monitorHeight = &g_monitorHeight;
  context.localVideoPrewarmEnabled = &g_localVideoPrewarmEnabled;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.recordingKeepWarmSources = g_recordingKeepWarmSources;
  context.combinedMonitorEnabled = &g_combinedMonitorEnabled;
  context.multiviewEnabled = &g_multiviewEnabled;
  context.monitorInputMode = &g_monitorInputMode;
  context.localVideoSources = g_localVideoSources;

  context.webrtcSelectors = g_webrtc_selectors;
  context.webrtcRecordingSelectors = g_webrtc_recording_selectors;
  context.webrtcSelectorFallbackPads = g_webrtc_selector_fallback_pads;
  context.webrtcRecordingSelectorFallbackPads =
    g_webrtc_recording_selector_fallback_pads;

  context.pgmSelectorSourceValves = g_pgm_selector_source_valves;
  context.pvwSelectorSourceValves = g_pvw_selector_source_valves;
  context.pgmMonitorSourceValves = g_pgm_monitor_source_valves;
  context.pvwMonitorSourceValves = g_pvw_monitor_source_valves;
  context.pgmRecordingSourceValves = g_pgm_recording_source_valves;
  context.pgmAbTransitionSourceValves = g_pgm_ab_transition_source_valves;

  context.pgmMonitorSelector = &g_pgm_monitor_selector;
  context.pvwMonitorSelector = &g_pvw_monitor_selector;
  context.pgmAbTransitionSelector = &g_pgm_ab_transition_selector;
  context.pgmAbPrimaryCompositorValve = &g_pgm_ab_primary_compositor_valve;
  context.pgmAbSecondaryCompositorValve = &g_pgm_ab_secondary_compositor_valve;
  context.pvwAbPrimaryCompositorValve = &g_pvw_ab_primary_compositor_valve;

  context.pgmCompositor = &g_pgm_compositor;
  context.pvwCompositor = &g_pvw_compositor;
  context.combinedMonitorCompositor = &g_combined_monitor_compositor;
  context.multiviewCompositor = &g_multiview_compositor;

  context.pgmMonitorSelectorPads = g_pgm_monitor_selector_pads;
  context.pvwMonitorSelectorPads = g_pvw_monitor_selector_pads;
  context.pgmAbTransitionSelectorPads = g_pgm_ab_transition_selector_pads;
  context.pgmPads = g_pgm_pads;
  context.pgmRecordingPads = g_pgm_recording_pads;
  context.pvwPads = g_pvw_pads;
  context.pgmAbPrimaryPad = &g_pgm_ab_primary_pad;
  context.pgmAbSecondaryPad = &g_pgm_ab_secondary_pad;
  context.pvwAbPrimaryPad = &g_pvw_ab_primary_pad;

  context.usesSelectorMonitorInputs = []() {
    return uses_selector_monitor_inputs();
  };
  context.isAbCompositorMonitorRenderer = []() {
    return is_ab_compositor_monitor_renderer();
  };
  context.recordingBranchRouter = [](bool enabled, int firstSource, int secondSource) {
    set_webrtc_runtime_recording_branches_for_sources(
      enabled,
      firstSource,
      secondSource);
  };
  set_mixer_route_controls_context(context);
}

static void configure_mixer_control_actions_context()
{
  MixerControlActionsContext context;
  context.mixerMutex = &g_mutex;
  context.pipeline = &g_pipeline;
  context.sourceCount = NUM_SOURCES;
  context.sourceNames = SOURCE_NAMES;
  context.programSource = &g_programSource;
  context.previewSource = &g_previewSource;
  context.programSourceForOverlay = &g_programSourceForOverlay;
  context.previewSourceForOverlay = &g_previewSourceForOverlay;
  context.transitionInProgress = &g_transitionInProgress;
  context.transitionGeneration = &g_transitionGeneration;
  context.transitionTickMs = TRANSITION_TICK_MS;
  context.pgmPads = g_pgm_pads;
  context.pgmAbPrimaryPad = &g_pgm_ab_primary_pad;
  context.pgmAbSecondaryPad = &g_pgm_ab_secondary_pad;
  context.isAbCompositorMonitorRenderer = []() {
    return is_ab_compositor_monitor_renderer();
  };
  context.updateCompositorAlphas = []() {
    mixer_route_control_update_compositor_alphas();
  };
  context.refreshPausedLocalVideoAfterRouteChange = [](int sourceIndex) {
    refresh_paused_local_video_after_route_change_locked(sourceIndex);
  };
  context.applyProgramTransitionFrame =
    [](MixerTransitionType transitionType, int outgoingSource, int incomingSource, double progress) {
      mixer_route_control_apply_program_transition_frame(
        transitionType,
        outgoingSource,
        incomingSource,
        progress);
    };
  set_mixer_control_actions_context(context);
}

static void configure_mixer_pipeline_creation_context()
{
  MixerPipelineCreationContext context;
  context.sourceCount = NUM_SOURCES;
  context.firstWebrtcSourceIndex = FIRST_WEBRTC_SOURCE_INDEX;
  context.internalWidth = MIXER_INTERNAL_WIDTH;
  context.internalHeight = MIXER_INTERNAL_HEIGHT;
  context.multiviewColumns = MULTIVIEW_COLUMNS;
  context.multiviewGutter = MULTIVIEW_GUTTER;
  context.multiviewSlotWidth = MULTIVIEW_SLOT_WIDTH;
  context.multiviewSlotHeight = MULTIVIEW_SLOT_HEIGHT;
  context.mixerMutex = &g_mutex;
  context.pipeline = &g_pipeline;
  context.monitorWidth = &g_monitorWidth;
  context.monitorHeight = &g_monitorHeight;
  context.webrtcBridgeWidth = &g_webrtcBridgeWidth;
  context.webrtcBridgeHeight = &g_webrtcBridgeHeight;

  context.monitorCallbacksEnabled = &g_monitorCallbacksEnabled;
  context.monitorIpcMode = &g_monitorIpcMode;
  context.monitorRendererMode = &g_monitorRendererMode;
  context.monitorGlZeroCopyEnabled = &g_monitorGlZeroCopyEnabled;
  context.monitorCompositorBackend = &g_monitorCompositorBackend;
  context.monitorCompositorFormatMode = &g_monitorCompositorFormatMode;
  context.nativeMonitorWindowsEnabled = &g_nativeMonitorWindowsEnabled;
  context.nativeMonitorSinkSyncEnabled = &g_nativeMonitorSinkSyncEnabled;
  context.nativeMonitorSinkFactory = &g_nativeMonitorSinkFactory;
  context.multiviewHudEnabled = &g_multiviewHudEnabled;
  context.multiviewBarsMode = &g_multiviewBarsMode;
  context.multiviewSourceFps = &g_multiviewSourceFps;
  context.thumbnailsEnabled = &g_thumbnailsEnabled;
  context.graphicsOverlayBranchesEnabled = &g_graphicsOverlayBranchesEnabled;
  context.monitorInputMode = &g_monitorInputMode;
  context.monitorCompositorsEnabled = &g_monitorCompositorsEnabled;
  context.combinedMonitorEnabled = &g_combinedMonitorEnabled;
  context.multiviewEnabled = &g_multiviewEnabled;

  context.pgmCompositor = &g_pgm_compositor;
  context.pgmRecordingCompositor = &g_pgm_recording_compositor;
  context.pvwCompositor = &g_pvw_compositor;
  context.multiviewCompositor = &g_multiview_compositor;
  context.combinedMonitorCompositor = &g_combined_monitor_compositor;
  context.pgmMonitorSelector = &g_pgm_monitor_selector;
  context.pvwMonitorSelector = &g_pvw_monitor_selector;
  context.pgmAbTransitionSelector = &g_pgm_ab_transition_selector;
  context.pgmRecordingTee = &g_pgm_recording_tee;

  context.pgmPads = g_pgm_pads;
  context.pgmRecordingPads = g_pgm_recording_pads;
  context.pvwPads = g_pvw_pads;
  context.graphicsPgmPad = &g_graphics_pgm_pad;
  context.graphicsPvwPad = &g_graphics_pvw_pad;
  context.pgmAbPrimaryPad = &g_pgm_ab_primary_pad;
  context.pgmAbSecondaryPad = &g_pgm_ab_secondary_pad;
  context.pvwAbPrimaryPad = &g_pvw_ab_primary_pad;

  context.programSource = &g_programSource;
  context.previewSource = &g_previewSource;
  context.programSourceForOverlay = &g_programSourceForOverlay;
  context.previewSourceForOverlay = &g_previewSourceForOverlay;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.syncBufferDecodedPeerCount = &g_syncBufferDecodedPeerCount;
  context.lastThumbTime = g_lastThumbTime;
  context.recordingOverlayProbeContext = &g_recordingProgramOverlayProbeContext;

  context.callbackTargets.pgmFrameCallback = &g_pgmFrameCallback;
  context.callbackTargets.pvwFrameCallback = &g_pvwFrameCallback;
  context.callbackTargets.thumbFrameCallback = &g_thumbFrameCallback;
  context.callbackTargets.busCallback = &g_busCallback;
  context.callbackTargets.pgmRecordingFrameCallback = &g_pgmRecordingFrameCallback;
  context.callbackTargets.audioReferenceFrameCallback = &g_audioReferenceFrameCallback;

  context.makeGraphicsRuntimeContext = []() {
    return make_graphics_overlay_runtime_context();
  };
  context.resetMultiviewSourceActivity = []() {
    reset_multiview_source_activity();
  };
  context.updateCompositorAlphas = []() {
    mixer_route_control_update_compositor_alphas();
  };
  context.resetSyncBufferNtpAlignmentState = []() {
    reset_sync_buffer_ntp_alignment_state();
  };
  context.setRecordingCompositorSleeping = [](bool shouldSleep) {
    set_recording_compositor_sleeping_locked(shouldSleep);
  };
  context.setMonitorCompositorsSleeping = [](bool shouldSleepPrimaryMonitors) {
    mixer_route_control_set_monitor_compositors_sleeping(shouldSleepPrimaryMonitors);
  };
  set_mixer_pipeline_creation_context(context);
}

static void configure_mixer_pipeline_lifecycle_context()
{
  MixerPipelineLifecycleContext context;
  context.mixerMutex = &g_mutex;
  context.pipeline = &g_pipeline;
  context.compositorRefs = {
    &g_pgm_compositor,
    &g_pvw_compositor,
    &g_multiview_compositor,
    &g_combined_monitor_compositor,
    &g_pgm_recording_compositor
  };
  context.threadSafeFunctions = {
    &g_pgmFrameCallback,
    &g_pvwFrameCallback,
    &g_thumbFrameCallback,
    &g_busCallback,
    &g_pgmRecordingFrameCallback,
    &g_audioReferenceFrameCallback
  };
  context.monitorWebRtcEndpoints = {
    &g_pgmMonitorWebRtcEndpoint,
    &g_pvwMonitorWebRtcEndpoint,
    &g_combinedMonitorWebRtcEndpoint,
    &g_multiviewMonitorWebRtcEndpoint
  };
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.nativeProgramRecordingActive = &g_nativeProgramRecordingActive;
  context.transitionInProgress = &g_transitionInProgress;
  context.activeWebrtcPeerCount = &g_activeWebrtcPeerCount;
  context.syncBufferDecodedPeerCount = &g_syncBufferDecodedPeerCount;
  context.mediaPlaneActive = &g_mediaPlaneActive;
  context.graphicsProgramFrame = &g_graphicsPgmLatestFrame;
  context.graphicsPreviewFrame = &g_graphicsPvwLatestFrame;
  context.cancelTransitionLocked = []() {
    cancel_active_transition_locked();
  };
  context.stopGraphicsOverlayPump = []() {
    stop_graphics_overlay_pump(make_graphics_overlay_runtime_context());
  };
  context.seedGraphicsOverlayInputs = []() {
    seed_graphics_overlay_inputs(make_graphics_overlay_runtime_context());
  };
  context.makeCleanupRefs = []() {
    return create_mixer_pipeline_cleanup_refs_refs();
  };
  set_mixer_pipeline_lifecycle_context(context);
}

static void configure_mixer_pipeline_runtime_refs_context()
{
  MixerPipelineRuntimeRefsContext context;
  context.sourceCount = NUM_SOURCES;
  context.firstWebrtcSourceIndex = FIRST_WEBRTC_SOURCE_INDEX;
  context.pipeline = &g_pipeline;
  context.multiviewOverlayState = mixer_multiview_overlay_state();

  context.pgmCompositor = &g_pgm_compositor;
  context.pgmRecordingCompositor = &g_pgm_recording_compositor;
  context.pvwCompositor = &g_pvw_compositor;
  context.multiviewCompositor = &g_multiview_compositor;
  context.combinedMonitorCompositor = &g_combined_monitor_compositor;
  context.pgmAppsink = &g_pgm_appsink;
  context.pvwAppsink = &g_pvw_appsink;
  context.pgmRecordingAppsink = &g_pgm_recording_appsink;
  context.pgmRecordingValve = &g_pgm_recording_valve;
  context.pgmRecordingTee = &g_pgm_recording_tee;
  context.pgmSelectorAppsink = &g_pgm_selector_appsink;
  context.pvwSelectorAppsink = &g_pvw_selector_appsink;
  context.audioReferenceAppsink = &g_audio_reference_appsink;
  context.graphicsPgmAppsrc = &g_graphics_pgm_appsrc;
  context.graphicsPvwAppsrc = &g_graphics_pvw_appsrc;
  context.pgmMonitorSelector = &g_pgm_monitor_selector;
  context.pvwMonitorSelector = &g_pvw_monitor_selector;
  context.pgmSelectorNativeMonitorValve = &g_pgm_selector_native_monitor_valve;
  context.pgmSelectorNativeMonitorSink = &g_pgm_selector_native_monitor_sink;
  context.pvwSelectorNativeMonitorValve = &g_pvw_selector_native_monitor_valve;
  context.pvwSelectorNativeMonitorSink = &g_pvw_selector_native_monitor_sink;
  context.pgmAbTransitionSelector = &g_pgm_ab_transition_selector;
  context.pgmAbPrimaryCompositorValve = &g_pgm_ab_primary_compositor_valve;
  context.pgmAbSecondaryCompositorValve = &g_pgm_ab_secondary_compositor_valve;
  context.pvwAbPrimaryCompositorValve = &g_pvw_ab_primary_compositor_valve;
  context.pgmMonitorWebrtc = &g_pgm_monitor_webrtc;
  context.pgmMonitorWebrtcValve = &g_pgm_monitor_webrtc_valve;
  context.pgmMonitorH264Pay = &g_pgm_monitor_h264pay;
  context.pvwMonitorWebrtc = &g_pvw_monitor_webrtc;
  context.pvwMonitorWebrtcValve = &g_pvw_monitor_webrtc_valve;
  context.pvwMonitorH264Pay = &g_pvw_monitor_h264pay;
  context.pgmNativeMonitorValve = &g_pgm_native_monitor_valve;
  context.pgmNativeMonitorSink = &g_pgm_native_monitor_sink;
  context.pvwNativeMonitorValve = &g_pvw_native_monitor_valve;
  context.pvwNativeMonitorSink = &g_pvw_native_monitor_sink;
  context.multiviewOverlay = &g_multiview_overlay;
  context.multiviewNativeMonitorValve = &g_multiview_native_monitor_valve;
  context.multiviewNativeMonitorSink = &g_multiview_native_monitor_sink;
  context.audioReferenceNativeMonitorValve = &g_audio_reference_native_monitor_valve;
  context.audioReferenceNativeMonitorSink = &g_audio_reference_native_monitor_sink;
  context.audioReferenceFrameValve = &g_audio_reference_frame_valve;
  context.combinedMonitorWebrtc = &g_combined_monitor_webrtc;
  context.combinedMonitorWebrtcValve = &g_combined_monitor_webrtc_valve;
  context.combinedMonitorPvwInputValve = &g_combined_monitor_pvw_input_valve;
  context.combinedMonitorPgmInputValve = &g_combined_monitor_pgm_input_valve;
  context.combinedMonitorH264Pay = &g_combined_monitor_h264pay;
  context.multiviewMonitorWebrtc = &g_multiview_monitor_webrtc;
  context.multiviewMonitorWebrtcValve = &g_multiview_monitor_webrtc_valve;
  context.multiviewMonitorH264Pay = &g_multiview_monitor_h264pay;

  context.pgmMonitorSourceValves = g_pgm_monitor_source_valves;
  context.pvwMonitorSourceValves = g_pvw_monitor_source_valves;
  context.pgmRecordingSourceValves = g_pgm_recording_source_valves;
  context.multiviewSourceValves = g_multiview_source_valves;
  context.thumbSourceValves = g_thumb_source_valves;
  context.pgmSelectorSourceValves = g_pgm_selector_source_valves;
  context.pvwSelectorSourceValves = g_pvw_selector_source_valves;
  context.pgmAbTransitionSourceValves = g_pgm_ab_transition_source_valves;
  context.thumbAppsinks = g_thumb_appsinks;
  context.webrtcSelectors = g_webrtc_selectors;
  context.webrtcRecordingSelectors = g_webrtc_recording_selectors;
  context.webrtcSelectorFallbackPads = g_webrtc_selector_fallback_pads;
  context.webrtcRecordingSelectorFallbackPads = g_webrtc_recording_selector_fallback_pads;
  context.pgmPads = g_pgm_pads;
  context.pgmRecordingPads = g_pgm_recording_pads;
  context.pvwPads = g_pvw_pads;
  context.multiviewPads = g_multiview_pads;
  context.pgmMonitorSelectorPads = g_pgm_monitor_selector_pads;
  context.pvwMonitorSelectorPads = g_pvw_monitor_selector_pads;
  context.pgmAbTransitionSelectorPads = g_pgm_ab_transition_selector_pads;
  context.combinedMonitorPvwPad = &g_combined_monitor_pvw_pad;
  context.combinedMonitorPgmPad = &g_combined_monitor_pgm_pad;
  context.graphicsPgmPad = &g_graphics_pgm_pad;
  context.graphicsPvwPad = &g_graphics_pvw_pad;
  context.pgmAbPrimaryPad = &g_pgm_ab_primary_pad;
  context.pgmAbSecondaryPad = &g_pgm_ab_secondary_pad;
  context.pvwAbPrimaryPad = &g_pvw_ab_primary_pad;

  context.pgmDiagnostics = mixer_pgm_stream_diagnostics();
  context.pvwDiagnostics = mixer_pvw_stream_diagnostics();
  context.pgmNativeMonitorDiagnostics = mixer_pgm_native_monitor_diagnostics();
  context.pvwNativeMonitorDiagnostics = mixer_pvw_native_monitor_diagnostics();
  context.pgmCompositorDiagnostics = mixer_pgm_compositor_diagnostics();
  context.pvwCompositorDiagnostics = mixer_pvw_compositor_diagnostics();
  context.pgmMonitorSourceDiagnostics = mixer_pgm_monitor_source_diagnostics();
  context.pvwMonitorSourceDiagnostics = mixer_pvw_monitor_source_diagnostics();
  context.webrtcRtpDiagnostics = mixer_webrtc_rtp_diagnostics();
  context.webrtcEncodedDiagnostics = mixer_webrtc_encoded_diagnostics();
  context.webrtcDecodedDiagnostics = mixer_webrtc_decoded_diagnostics();
  context.webrtcMonitorOutDiagnostics = mixer_webrtc_monitor_out_diagnostics();
  context.webrtcRtpTimelineDiagnostics = mixer_webrtc_rtp_timeline_diagnostics();
  context.lastPgmMonitorFrameTime = mixer_last_pgm_monitor_frame_time();
  context.lastPvwMonitorFrameTime = mixer_last_pvw_monitor_frame_time();
  set_mixer_pipeline_runtime_refs_context(context);
}

static MultiviewSourceControlContext make_multiview_source_control_context()
{
  MultiviewSourceControlContext context;
  context.sourceCount = NUM_SOURCES;
  context.enabled = g_multiviewEnabled;
  context.activeSlotsEnabled = g_multiviewActiveSlotsEnabled;
  context.barsMode = g_multiviewBarsMode;
  context.sourceActive = mixer_multiview_source_active();
  context.sourceValves = g_multiview_source_valves;
  return context;
}

static void set_multiview_source_active(int sourceIndex, bool active)
{
  set_multiview_source_active(
    make_multiview_source_control_context(),
    sourceIndex,
    active);
}

static void reset_multiview_source_activity()
{
  reset_multiview_source_activity(make_multiview_source_control_context());
}

static void cancel_active_transition_locked()
{
  if (!g_transitionInProgress) {
    return;
  }

  g_transitionInProgress = false;
  g_transitionGeneration += 1;
}

static void configure_local_video_controls_context()
{
  LocalVideoControlsContext context;
  context.mixerMutex = &g_mutex;
  context.pipeline = &g_pipeline;
  context.sources = g_localVideoSources;
  context.instanceCounter = &g_localVideoInstanceCounter;
  context.firstSourceIndex = FIRST_WEBRTC_SOURCE_INDEX;
  context.sourceCount = NUM_SOURCES;
  context.monitorWidth = &g_monitorWidth;
  context.monitorHeight = &g_monitorHeight;
  context.internalWidth = MIXER_INTERNAL_WIDTH;
  context.internalHeight = MIXER_INTERNAL_HEIGHT;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.recordingRawQueueBuffers = RECORDING_RAW_QUEUE_BUFFERS;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.programSource = &g_programSource;
  context.webrtcSelectors = g_webrtc_selectors;
  context.webrtcRecordingSelectors = g_webrtc_recording_selectors;
  context.getRunningTime = []() -> GstClockTime {
    return get_gst_element_running_time(g_pipeline, true);
  };
  context.sourceMatchesRecordingKeepWarmSelection =
    [](int sourceIndex, int firstSource, int secondSource) {
      return mixer_route_control_source_matches_recording_keepwarm_selection(
        sourceIndex,
        firstSource,
        secondSource);
    };
  context.setSourceActive = [](int sourceIndex, bool active) {
    set_multiview_source_active(sourceIndex, active);
  };
  context.setSlotToFallback = [](int sourceIndex) {
    mixer_route_control_set_webrtc_slot_to_fallback(sourceIndex);
  };
  context.updateCompositorAlphas = []() {
    mixer_route_control_update_compositor_alphas();
  };
  set_local_video_controls_context(context);
}

static void configure_recording_controls_context()
{
  RecordingControlsContext context;
  context.mixerMutex = &g_mutex;
  context.pipeline = &g_pipeline;
  context.pgmRecordingCompositor = &g_pgm_recording_compositor;
  context.pgmRecordingTee = &g_pgm_recording_tee;
  context.pgmRecordingValve = &g_pgm_recording_valve;
  context.nativeRecordingBin = &g_nativeProgramRecordingBin;
  context.nativeRecordingAudioDelay = &g_nativeProgramRecordingAudioDelay;
  context.nativeRecordingAudioSource = &g_nativeProgramRecordingAudioSource;
  context.nativeRecordingAudioMuxQueue = &g_nativeProgramRecordingAudioMuxQueue;
  context.nativeRecordingFileSink = &g_nativeProgramRecordingFileSink;
  context.nativeRecordingTeePad = &g_nativeProgramRecordingTeePad;
  context.nativeRecordingAudioMuxerSinkPad = &g_nativeProgramRecordingAudioMuxerSinkPad;
  context.eosTracker = &g_nativeRecordingEosTracker;
  context.programRecordingEnabled = &g_programRecordingEnabled;
  context.nativeProgramRecordingActive = &g_nativeProgramRecordingActive;
  context.recordingAudioEnabled = &g_recordingAudioEnabled;
  context.graphicsOverlayBranchesEnabled = &g_graphicsOverlayBranchesEnabled;
  context.recordingProgramOverlayActive = &g_recordingProgramOverlayActive;
  context.recordingTimelineGeneration = &g_recordingTimelineGeneration;
  context.graphicsProgramFrame = &g_graphicsPgmLatestFrame;
  context.recordingAudioSourceName = &g_recordingAudioSourceName;
  context.recordingAudioDelayMs = &g_recordingAudioDelayMs;
  context.programSource = &g_programSource;
  context.internalWidth = MIXER_INTERNAL_WIDTH;
  context.internalHeight = MIXER_INTERNAL_HEIGHT;
  context.frameRateNum = MIXER_FRAME_RATE_NUM;
  context.frameRateDen = MIXER_FRAME_RATE_DEN;
  context.recordingAudioRate = RECORDING_AUDIO_RATE;
  context.recordingAudioChannels = RECORDING_AUDIO_CHANNELS;
  context.recordingAudioBitrate = RECORDING_AUDIO_BITRATE;
  context.minRecordingAudioDelayMs = MIN_RECORDING_AUDIO_DELAY_MS;
  context.maxRecordingAudioDelayMs = MAX_RECORDING_AUDIO_DELAY_MS;
  context.setRecordingSourceValvesForSources =
    [](bool enabled, int firstSource, int secondSource) {
      mixer_route_control_set_recording_source_valves_for_sources(
        enabled,
        firstSource,
        secondSource);
    };
  context.applyRecordingSteadyProgramLayoutLocked = []() {
    mixer_route_control_apply_recording_steady_program_layout_locked();
  };
  set_recording_controls_context(context);
}

void configure_gstreamer_addon_runtime_contexts()
{
  configure_mixer_diagnostics_state_context();
  configure_monitor_diagnostics_runtime_context();
  configure_monitor_frame_bridge_runtime_context();
  configure_sync_buffer_runtime_context();
  configure_webrtc_legacy_bridge_context();
  configure_webrtc_h264_trace_context();
  configure_webrtc_jitterbuffer_hooks_context();
  configure_webrtc_media_dispatch_context();
  configure_webrtc_runtime_controls_context();
  configure_monitor_webrtc_controls_context();
  configure_native_monitor_controls_context();
  configure_graphics_overlay_controls_context();
  configure_mixer_route_controls_context();
  configure_mixer_control_actions_context();
  configure_mixer_pipeline_creation_context();
  configure_mixer_pipeline_lifecycle_context();
  configure_mixer_pipeline_runtime_refs_context();
  configure_local_video_controls_context();
  configure_recording_controls_context();
  configure_webrtc_peer_controls_from_runtime();
}
