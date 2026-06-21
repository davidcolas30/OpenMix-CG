#include "gstreamer_addon_state.h"

#include "mixer_runtime_config.h"

int g_webrtcBridgeWidth = 960;
int g_webrtcBridgeHeight = 540;

const char* SOURCE_NAMES[NUM_SOURCES] = {
  "SMPTE Bars", "Cam 1", "Cam 2", "Cam 3"
};

GstElement* g_pipeline = nullptr;
GstElement* g_pgm_compositor = nullptr;
GstElement* g_pgm_recording_compositor = nullptr;
GstElement* g_pvw_compositor = nullptr;
GstElement* g_multiview_compositor = nullptr;

GstPad* g_pgm_pads[NUM_SOURCES] = {};
GstPad* g_pgm_recording_pads[NUM_SOURCES] = {};
GstPad* g_pvw_pads[NUM_SOURCES] = {};
GstPad* g_multiview_pads[NUM_SOURCES] = {};

GstElement* g_pgm_appsink = nullptr;
GstElement* g_pvw_appsink = nullptr;
GstElement* g_pgm_recording_appsink = nullptr;
GstElement* g_pgm_recording_valve = nullptr;
GstElement* g_pgm_recording_tee = nullptr;
GstElement* g_pgm_monitor_source_valves[NUM_SOURCES] = {};
GstElement* g_pvw_monitor_source_valves[NUM_SOURCES] = {};
GstElement* g_pgm_recording_source_valves[NUM_SOURCES] = {};
GstElement* g_multiview_source_valves[NUM_SOURCES] = {};
GstElement* g_thumb_source_valves[NUM_SOURCES] = {};
GstElement* g_pgm_selector_source_valves[NUM_SOURCES] = {};
GstElement* g_pvw_selector_source_valves[NUM_SOURCES] = {};
GstElement* g_thumb_appsinks[NUM_SOURCES] = {};
GstElement* g_graphics_pgm_appsrc = nullptr;
GstElement* g_graphics_pvw_appsrc = nullptr;
GstPad* g_graphics_pgm_pad = nullptr;
GstPad* g_graphics_pvw_pad = nullptr;

GstElement* g_webrtc_selectors[NUM_SOURCES] = {};
GstElement* g_webrtc_recording_selectors[NUM_SOURCES] = {};
GstPad* g_webrtc_selector_fallback_pads[NUM_SOURCES] = {};
GstPad* g_webrtc_recording_selector_fallback_pads[NUM_SOURCES] = {};
GstElement* g_pgm_monitor_selector = nullptr;
GstElement* g_pvw_monitor_selector = nullptr;
GstElement* g_pgm_selector_appsink = nullptr;
GstElement* g_pvw_selector_appsink = nullptr;
GstElement* g_pgm_selector_native_monitor_valve = nullptr;
GstElement* g_pgm_selector_native_monitor_sink = nullptr;
GstElement* g_pvw_selector_native_monitor_valve = nullptr;
GstElement* g_pvw_selector_native_monitor_sink = nullptr;
GstElement* g_pgm_ab_transition_selector = nullptr;
GstElement* g_pgm_ab_primary_compositor_valve = nullptr;
GstElement* g_pgm_ab_secondary_compositor_valve = nullptr;
GstElement* g_pvw_ab_primary_compositor_valve = nullptr;
GstElement* g_pgm_ab_transition_source_valves[NUM_SOURCES] = {};
GstElement* g_pgm_monitor_webrtc = nullptr;
GstElement* g_pgm_monitor_webrtc_valve = nullptr;
GstElement* g_pgm_monitor_h264pay = nullptr;
GstElement* g_pvw_monitor_webrtc = nullptr;
GstElement* g_pvw_monitor_webrtc_valve = nullptr;
GstElement* g_pvw_monitor_h264pay = nullptr;
GstElement* g_pgm_native_monitor_valve = nullptr;
GstElement* g_pgm_native_monitor_sink = nullptr;
GstElement* g_pvw_native_monitor_valve = nullptr;
GstElement* g_pvw_native_monitor_sink = nullptr;
GstElement* g_multiview_native_monitor_valve = nullptr;
GstElement* g_multiview_native_monitor_sink = nullptr;
GstElement* g_multiview_overlay = nullptr;
GstElement* g_audio_reference_native_monitor_valve = nullptr;
GstElement* g_audio_reference_native_monitor_sink = nullptr;
GstElement* g_audio_reference_frame_valve = nullptr;
GstElement* g_audio_reference_appsink = nullptr;
GstElement* g_combined_monitor_compositor = nullptr;
GstElement* g_combined_monitor_webrtc = nullptr;
GstElement* g_combined_monitor_webrtc_valve = nullptr;
GstElement* g_combined_monitor_pvw_input_valve = nullptr;
GstElement* g_combined_monitor_pgm_input_valve = nullptr;
GstElement* g_combined_monitor_h264pay = nullptr;
GstPad* g_combined_monitor_pvw_pad = nullptr;
GstPad* g_combined_monitor_pgm_pad = nullptr;
GstElement* g_multiview_monitor_webrtc = nullptr;
GstElement* g_multiview_monitor_webrtc_valve = nullptr;
GstElement* g_multiview_monitor_h264pay = nullptr;
GstPad* g_pgm_monitor_selector_pads[NUM_SOURCES] = {};
GstPad* g_pvw_monitor_selector_pads[NUM_SOURCES] = {};
GstPad* g_pgm_ab_transition_selector_pads[NUM_SOURCES] = {};
GstPad* g_pgm_ab_primary_pad = nullptr;
GstPad* g_pgm_ab_secondary_pad = nullptr;
GstPad* g_pvw_ab_primary_pad = nullptr;

Napi::ThreadSafeFunction g_pgmFrameCallback;
Napi::ThreadSafeFunction g_pvwFrameCallback;
Napi::ThreadSafeFunction g_thumbFrameCallback;
Napi::ThreadSafeFunction g_busCallback;
Napi::ThreadSafeFunction g_pgmRecordingFrameCallback;
Napi::ThreadSafeFunction g_audioReferenceFrameCallback;

MonitorWebRtcEndpoint g_pgmMonitorWebRtcEndpoint(
  "PGM",
  "startProgramMonitorWebRTC(sdpString: string, onAnswer: fn, onIceCandidate: fn)",
  "La salida WebRTC local de Program no está disponible",
  "No se pudo crear GstSDPMessage para monitor PGM",
  "SDP offer inválida para monitor PGM",
  "ProgramMonitorWebRTCAnswer",
  "ProgramMonitorWebRTCIce",
  &g_pgm_monitor_webrtc,
  &g_pgm_monitor_webrtc_valve,
  &g_pgm_monitor_h264pay);
MonitorWebRtcEndpoint g_pvwMonitorWebRtcEndpoint(
  "PVW",
  "startPreviewMonitorWebRTC(sdpString: string, onAnswer: fn, onIceCandidate: fn)",
  "La salida WebRTC local de Preview no está disponible",
  "No se pudo crear GstSDPMessage para monitor PVW",
  "SDP offer inválida para monitor PVW",
  "PreviewMonitorWebRTCAnswer",
  "PreviewMonitorWebRTCIce",
  &g_pvw_monitor_webrtc,
  &g_pvw_monitor_webrtc_valve,
  &g_pvw_monitor_h264pay);
MonitorWebRtcEndpoint g_combinedMonitorWebRtcEndpoint(
  "COMBINED",
  "startCombinedMonitorWebRTC(sdpString: string, onAnswer: fn, onIceCandidate: fn)",
  "La salida WebRTC local combinada no está disponible",
  "No se pudo crear GstSDPMessage para monitor combinado",
  "SDP offer inválida para monitor combinado",
  "CombinedMonitorWebRTCAnswer",
  "CombinedMonitorWebRTCIce",
  &g_combined_monitor_webrtc,
  &g_combined_monitor_webrtc_valve,
  &g_combined_monitor_h264pay,
  &g_combined_monitor_pvw_input_valve,
  &g_combined_monitor_pgm_input_valve,
  true);
MonitorWebRtcEndpoint g_multiviewMonitorWebRtcEndpoint(
  "MULTIVIEW",
  "startMultiviewMonitorWebRTC(sdpString: string, onAnswer: fn, onIceCandidate: fn)",
  "La salida WebRTC local de Multiview no está disponible",
  "No se pudo crear GstSDPMessage para monitor Multiview",
  "SDP offer inválida para monitor Multiview",
  "MultiviewMonitorWebRTCAnswer",
  "MultiviewMonitorWebRTCIce",
  &g_multiview_monitor_webrtc,
  &g_multiview_monitor_webrtc_valve,
  &g_multiview_monitor_h264pay);

std::chrono::steady_clock::time_point g_lastThumbTime[NUM_SOURCES] = {};

int g_programSource = 0;
int g_previewSource = 1;
std::atomic<int> g_programSourceForOverlay{0};
std::atomic<int> g_previewSourceForOverlay{1};
std::mutex g_mutex;
bool g_initialized = false;
bool g_programRecordingEnabled = false;
bool g_nativeProgramRecordingActive = false;
bool g_recordingKeepWarmSources[NUM_SOURCES] = {};
std::atomic<bool> g_recordingProgramOverlayActive{false};
std::atomic<uint64_t> g_recordingTimelineGeneration{0};
GstElement* g_nativeProgramRecordingBin = nullptr;
GstElement* g_nativeProgramRecordingAudioDelay = nullptr;
GstElement* g_nativeProgramRecordingAudioSource = nullptr;
GstElement* g_nativeProgramRecordingAudioMuxQueue = nullptr;
GstElement* g_nativeProgramRecordingFileSink = nullptr;
GstPad* g_nativeProgramRecordingTeePad = nullptr;
GstPad* g_nativeProgramRecordingAudioMuxerSinkPad = nullptr;
std::mutex g_nativeRecordingEosMutex;
std::condition_variable g_nativeRecordingEosCv;
bool g_nativeRecordingFileSinkEosSeen = false;
RecordingEosTracker g_nativeRecordingEosTracker{
  &g_nativeRecordingEosMutex,
  &g_nativeRecordingEosCv,
  &g_nativeRecordingFileSinkEosSeen
};
bool g_transitionInProgress = false;
uint64_t g_transitionGeneration = 0;
int g_monitorWidth = 960;
int g_monitorHeight = 540;
std::map<std::string, WebRTCPeer*> g_webrtcPeers;
std::mutex g_webrtcMutex;
std::atomic<bool> g_webrtcRxStatsRunning{false};
std::thread g_webrtcRxStatsThread;
std::atomic<int> g_activeWebrtcPeerCount{0};
std::atomic<int> g_syncBufferDecodedPeerCount{0};
std::atomic<bool> g_mediaPlaneActive{false};
LocalVideoSource* g_localVideoSources[NUM_SOURCES] = {};
std::atomic<uint64_t> g_localVideoInstanceCounter{0};
GraphicsOverlayLatestFrame g_graphicsPgmLatestFrame;
GraphicsOverlayLatestFrame g_graphicsPvwLatestFrame;
std::thread g_graphicsOverlayPumpThread;
std::atomic<bool> g_graphicsOverlayPumpRunning{false};
RecordingGraphicsOverlayProbeContext g_recordingProgramOverlayProbeContext = {
  &g_recordingProgramOverlayActive,
  &g_mutex,
  &g_programRecordingEnabled,
  &g_graphicsOverlayBranchesEnabled,
  &g_graphicsPgmLatestFrame,
  MIXER_INTERNAL_WIDTH,
  MIXER_INTERNAL_HEIGHT
};
