#pragma once

#include <napi.h>
#include <gst/gst.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <thread>

#include "graphics_overlay_frame.h"
#include "local_video_source.h"
#include "monitor_webrtc_endpoint.h"
#include "recording_eos.h"
#include "recording_overlay.h"
#include "webrtc_peer.h"

// Constantes compartidas del addon nativo. Viven aqui para que el punto de
// entrada N-API no tenga que mezclar configuracion estructural con wiring.
constexpr int NUM_SOURCES = 4;
constexpr int MIXER_FRAME_RATE_NUM = 30;
constexpr int MIXER_FRAME_RATE_DEN = 1;
constexpr int MIXER_INTERNAL_WIDTH = 1920;
constexpr int MIXER_INTERNAL_HEIGHT = 1080;
constexpr int TRANSITION_TICK_MS = 16;
constexpr int FIRST_WEBRTC_SOURCE_INDEX = 1;
constexpr guint RECORDING_RAW_QUEUE_BUFFERS = 8;
constexpr int THUMB_INTERVAL_MS = 125;
constexpr int MULTIVIEW_OUTPUT_WIDTH = 1280;
constexpr int MULTIVIEW_OUTPUT_HEIGHT = 180;
constexpr int MULTIVIEW_COLUMNS = 4;
constexpr int MULTIVIEW_ROWS =
  (NUM_SOURCES + MULTIVIEW_COLUMNS - 1) / MULTIVIEW_COLUMNS;
constexpr int MULTIVIEW_GUTTER = 8;
constexpr int MULTIVIEW_SLOT_WIDTH =
  (MULTIVIEW_OUTPUT_WIDTH - (MULTIVIEW_COLUMNS + 1) * MULTIVIEW_GUTTER) /
  MULTIVIEW_COLUMNS;
constexpr int MULTIVIEW_SLOT_HEIGHT =
  (MULTIVIEW_OUTPUT_HEIGHT - (MULTIVIEW_ROWS + 1) * MULTIVIEW_GUTTER) /
  MULTIVIEW_ROWS;
constexpr int MAX_MONITOR_FPS = 30;
constexpr double SYNC_BUFFER_NTP_AGE_SMOOTHING_ALPHA = 0.08;
constexpr int MIN_RECORDING_AUDIO_DELAY_MS = -2000;
constexpr int MAX_RECORDING_AUDIO_DELAY_MS = 5000;
constexpr int RECORDING_AUDIO_RATE = 48000;
constexpr int RECORDING_AUDIO_CHANNELS = 1;
constexpr int RECORDING_AUDIO_BITRATE = 128000;
constexpr int DIAGNOSTIC_LOG_INTERVAL_MS = 2000;

extern int g_webrtcBridgeWidth;
extern int g_webrtcBridgeHeight;
extern const char* SOURCE_NAMES[NUM_SOURCES];

extern GstElement* g_pipeline;
extern GstElement* g_pgm_compositor;
extern GstElement* g_pgm_recording_compositor;
extern GstElement* g_pvw_compositor;
extern GstElement* g_multiview_compositor;

extern GstPad* g_pgm_pads[NUM_SOURCES];
extern GstPad* g_pgm_recording_pads[NUM_SOURCES];
extern GstPad* g_pvw_pads[NUM_SOURCES];
extern GstPad* g_multiview_pads[NUM_SOURCES];

extern GstElement* g_pgm_appsink;
extern GstElement* g_pvw_appsink;
extern GstElement* g_pgm_recording_appsink;
extern GstElement* g_pgm_recording_valve;
extern GstElement* g_pgm_recording_tee;
extern GstElement* g_pgm_monitor_source_valves[NUM_SOURCES];
extern GstElement* g_pvw_monitor_source_valves[NUM_SOURCES];
extern GstElement* g_pgm_recording_source_valves[NUM_SOURCES];
extern GstElement* g_multiview_source_valves[NUM_SOURCES];
extern GstElement* g_thumb_source_valves[NUM_SOURCES];
extern GstElement* g_pgm_selector_source_valves[NUM_SOURCES];
extern GstElement* g_pvw_selector_source_valves[NUM_SOURCES];
extern GstElement* g_thumb_appsinks[NUM_SOURCES];
extern GstElement* g_graphics_pgm_appsrc;
extern GstElement* g_graphics_pvw_appsrc;
extern GstPad* g_graphics_pgm_pad;
extern GstPad* g_graphics_pvw_pad;

extern GstElement* g_webrtc_selectors[NUM_SOURCES];
extern GstElement* g_webrtc_recording_selectors[NUM_SOURCES];
extern GstPad* g_webrtc_selector_fallback_pads[NUM_SOURCES];
extern GstPad* g_webrtc_recording_selector_fallback_pads[NUM_SOURCES];
extern GstElement* g_pgm_monitor_selector;
extern GstElement* g_pvw_monitor_selector;
extern GstElement* g_pgm_selector_appsink;
extern GstElement* g_pvw_selector_appsink;
extern GstElement* g_pgm_selector_native_monitor_valve;
extern GstElement* g_pgm_selector_native_monitor_sink;
extern GstElement* g_pvw_selector_native_monitor_valve;
extern GstElement* g_pvw_selector_native_monitor_sink;
extern GstElement* g_pgm_ab_transition_selector;
extern GstElement* g_pgm_ab_primary_compositor_valve;
extern GstElement* g_pgm_ab_secondary_compositor_valve;
extern GstElement* g_pvw_ab_primary_compositor_valve;
extern GstElement* g_pgm_ab_transition_source_valves[NUM_SOURCES];
extern GstElement* g_pgm_monitor_webrtc;
extern GstElement* g_pgm_monitor_webrtc_valve;
extern GstElement* g_pgm_monitor_h264pay;
extern GstElement* g_pvw_monitor_webrtc;
extern GstElement* g_pvw_monitor_webrtc_valve;
extern GstElement* g_pvw_monitor_h264pay;
extern GstElement* g_pgm_native_monitor_valve;
extern GstElement* g_pgm_native_monitor_sink;
extern GstElement* g_pvw_native_monitor_valve;
extern GstElement* g_pvw_native_monitor_sink;
extern GstElement* g_multiview_native_monitor_valve;
extern GstElement* g_multiview_native_monitor_sink;
extern GstElement* g_multiview_overlay;
extern GstElement* g_audio_reference_native_monitor_valve;
extern GstElement* g_audio_reference_native_monitor_sink;
extern GstElement* g_audio_reference_frame_valve;
extern GstElement* g_audio_reference_appsink;
extern GstElement* g_combined_monitor_compositor;
extern GstElement* g_combined_monitor_webrtc;
extern GstElement* g_combined_monitor_webrtc_valve;
extern GstElement* g_combined_monitor_pvw_input_valve;
extern GstElement* g_combined_monitor_pgm_input_valve;
extern GstElement* g_combined_monitor_h264pay;
extern GstPad* g_combined_monitor_pvw_pad;
extern GstPad* g_combined_monitor_pgm_pad;
extern GstElement* g_multiview_monitor_webrtc;
extern GstElement* g_multiview_monitor_webrtc_valve;
extern GstElement* g_multiview_monitor_h264pay;
extern GstPad* g_pgm_monitor_selector_pads[NUM_SOURCES];
extern GstPad* g_pvw_monitor_selector_pads[NUM_SOURCES];
extern GstPad* g_pgm_ab_transition_selector_pads[NUM_SOURCES];
extern GstPad* g_pgm_ab_primary_pad;
extern GstPad* g_pgm_ab_secondary_pad;
extern GstPad* g_pvw_ab_primary_pad;

extern Napi::ThreadSafeFunction g_pgmFrameCallback;
extern Napi::ThreadSafeFunction g_pvwFrameCallback;
extern Napi::ThreadSafeFunction g_thumbFrameCallback;
extern Napi::ThreadSafeFunction g_busCallback;
extern Napi::ThreadSafeFunction g_pgmRecordingFrameCallback;
extern Napi::ThreadSafeFunction g_audioReferenceFrameCallback;

extern MonitorWebRtcEndpoint g_pgmMonitorWebRtcEndpoint;
extern MonitorWebRtcEndpoint g_pvwMonitorWebRtcEndpoint;
extern MonitorWebRtcEndpoint g_combinedMonitorWebRtcEndpoint;
extern MonitorWebRtcEndpoint g_multiviewMonitorWebRtcEndpoint;

extern std::chrono::steady_clock::time_point g_lastThumbTime[NUM_SOURCES];

extern int g_programSource;
extern int g_previewSource;
extern std::atomic<int> g_programSourceForOverlay;
extern std::atomic<int> g_previewSourceForOverlay;
extern std::mutex g_mutex;
extern bool g_initialized;
extern bool g_programRecordingEnabled;
extern bool g_nativeProgramRecordingActive;
extern bool g_recordingKeepWarmSources[NUM_SOURCES];
extern std::atomic<bool> g_recordingProgramOverlayActive;
extern std::atomic<uint64_t> g_recordingTimelineGeneration;
extern GstElement* g_nativeProgramRecordingBin;
extern GstElement* g_nativeProgramRecordingAudioDelay;
extern GstElement* g_nativeProgramRecordingAudioSource;
extern GstElement* g_nativeProgramRecordingAudioMuxQueue;
extern GstElement* g_nativeProgramRecordingFileSink;
extern GstPad* g_nativeProgramRecordingTeePad;
extern GstPad* g_nativeProgramRecordingAudioMuxerSinkPad;
extern std::mutex g_nativeRecordingEosMutex;
extern std::condition_variable g_nativeRecordingEosCv;
extern bool g_nativeRecordingFileSinkEosSeen;
extern RecordingEosTracker g_nativeRecordingEosTracker;
extern bool g_transitionInProgress;
extern uint64_t g_transitionGeneration;
extern int g_monitorWidth;
extern int g_monitorHeight;
extern std::map<std::string, WebRTCPeer*> g_webrtcPeers;
extern std::mutex g_webrtcMutex;
extern std::atomic<bool> g_webrtcRxStatsRunning;
extern std::thread g_webrtcRxStatsThread;
extern std::atomic<int> g_activeWebrtcPeerCount;
extern std::atomic<int> g_syncBufferDecodedPeerCount;
extern std::atomic<bool> g_mediaPlaneActive;
extern LocalVideoSource* g_localVideoSources[NUM_SOURCES];
extern std::atomic<uint64_t> g_localVideoInstanceCounter;
extern GraphicsOverlayLatestFrame g_graphicsPgmLatestFrame;
extern GraphicsOverlayLatestFrame g_graphicsPvwLatestFrame;
extern std::thread g_graphicsOverlayPumpThread;
extern std::atomic<bool> g_graphicsOverlayPumpRunning;
extern RecordingGraphicsOverlayProbeContext g_recordingProgramOverlayProbeContext;
