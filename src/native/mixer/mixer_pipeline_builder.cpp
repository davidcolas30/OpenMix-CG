#include "mixer_pipeline_builder.h"

#include "monitor_frame_bridge.h"

#include <array>
#include <cstdio>
#include <string>

static std::string monitor_compositor_input_chain(
  const char* compositorName,
  const char* format,
  int monitorWidth,
  int monitorHeight)
{
  return "videoconvert ! video/x-raw,format=" +
    std::string(format) +
    ",width=" + std::to_string(monitorWidth) +
    ",height=" + std::to_string(monitorHeight) +
    ",framerate=30/1,pixel-aspect-ratio=1/1 ! " +
    compositorName + ". ";
}

std::string build_mixer_pipeline_description(const MixerPipelineBuildConfig& config)
{
  const int combinedMonitorWidth = config.monitorWidth * 2;
  const bool useGlMonitorCompositor =
    config.monitorCompositorBackend == MONITOR_COMPOSITOR_BACKEND_GL;
  const bool useGlMonitorZeroCopy =
    useGlMonitorCompositor && config.monitorGlZeroCopyEnabled;
  const bool shouldCreateNativeMonitorSink = config.nativeMonitorWindowsEnabled;
  const char* nativeMonitorValveDrop = "true";
  const char* nativeMonitorSinkFactory = shouldCreateNativeMonitorSink
    ? config.nativeMonitorSinkFactory
    : "fakesink";
  const char* nativeMonitorSinkProperties = shouldCreateNativeMonitorSink
    ? (config.nativeMonitorSinkSyncEnabled
        ? "sync=true async=false enable-last-sample=false qos=false max-lateness=-1 force-aspect-ratio=false"
        : "sync=false async=false enable-last-sample=false qos=false max-lateness=-1 force-aspect-ratio=false")
    : "sync=false async=false";
  const char* pgmMonitorIpcValveDrop =
    (config.monitorCallbacksEnabled &&
      should_forward_monitor_frame(config.monitorIpcMode, MONITOR_FRAME_TARGET_PGM))
      ? "false"
      : "true";
  const char* pvwMonitorIpcValveDrop =
    (config.monitorCallbacksEnabled &&
      should_forward_monitor_frame(config.monitorIpcMode, MONITOR_FRAME_TARGET_PVW))
      ? "false"
      : "true";
  const char* pgmSelectorIpcValveDrop =
    (config.monitorRendererMode == MONITOR_RENDERER_SELECTOR &&
     config.monitorCallbacksEnabled &&
     should_forward_monitor_frame(config.monitorIpcMode, MONITOR_FRAME_TARGET_PGM))
      ? "false"
      : "true";
  const char* pvwSelectorIpcValveDrop =
    (config.monitorRendererMode == MONITOR_RENDERER_SELECTOR &&
     config.monitorCallbacksEnabled &&
     should_forward_monitor_frame(config.monitorIpcMode, MONITOR_FRAME_TARGET_PVW))
      ? "false"
      : "true";
  if (!shouldCreateNativeMonitorSink) {
    printf("[Mixer] Sink monitor nativo sustituido por fakesink (sin ventana de sistema)\n");
  }

  const bool useI420MonitorCompositor =
    !useGlMonitorCompositor &&
    config.monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_I420;
  const bool useI420BaseWithBgraGraphics =
    !useGlMonitorCompositor &&
    config.monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_I420_BASE_BGRA_GRAPHICS;
  const bool keepBgraMonitorCompositorOutput =
    !useGlMonitorCompositor &&
    config.monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_BGRA;
  const char* cpuMonitorVideoInputFormat =
    (useI420MonitorCompositor || useI420BaseWithBgraGraphics) ? "I420" : "BGRA";
  const char* cpuMonitorGraphicsInputFormat =
    useI420BaseWithBgraGraphics ? "BGRA" : cpuMonitorVideoInputFormat;
  const char* monitorCompositorOutputFormat =
    (useI420MonitorCompositor ||
      (!keepBgraMonitorCompositorOutput && !useI420BaseWithBgraGraphics))
      ? "I420"
      : "BGRA";
  const std::string monitorCompositorOutputCaps = useGlMonitorZeroCopy
    ? "video/x-raw(memory:GLMemory),format=RGBA,width=" +
        std::to_string(config.monitorWidth) +
        ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! "
    : "video/x-raw,format=" + std::string(monitorCompositorOutputFormat) +
        ",width=" + std::to_string(config.monitorWidth) +
        ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1 ! ";
  const std::string monitorCompositorIpcOutputChain = useGlMonitorZeroCopy
    ? "gldownload ! videoconvert ! video/x-raw,format=I420,width=" +
        std::to_string(config.monitorWidth) +
        ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! "
    : "";
  const std::string monitorCompositorToCpuChain = useGlMonitorZeroCopy
    ? "gldownload ! videoconvert ! "
    : "videoconvert ! ";
  const std::string monitorCompositorNativeOutputChain = useGlMonitorZeroCopy
    ? "glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,width=" +
        std::to_string(config.monitorWidth) +
        ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! "
    : "videoconvert ! videoscale ! video/x-raw,width=" +
        std::to_string(config.monitorWidth) +
        ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! ";
  const std::string pgmMonitorCompositorInput = useGlMonitorCompositor
    ? "glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,width=" +
        std::to_string(config.monitorWidth) + ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! comp_pgm. "
    : monitor_compositor_input_chain(
        "comp_pgm",
        cpuMonitorVideoInputFormat,
        config.monitorWidth,
        config.monitorHeight);
  const std::string pvwMonitorCompositorInput = useGlMonitorCompositor
    ? "glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,width=" +
        std::to_string(config.monitorWidth) + ",height=" + std::to_string(config.monitorHeight) +
        ",framerate=30/1,pixel-aspect-ratio=1/1 ! comp_pvw. "
    : monitor_compositor_input_chain(
        "comp_pvw",
        cpuMonitorVideoInputFormat,
        config.monitorWidth,
        config.monitorHeight);
  const std::string pgmGraphicsMonitorCompositorInput = useGlMonitorCompositor
    ? pgmMonitorCompositorInput
    : monitor_compositor_input_chain(
        "comp_pgm",
        cpuMonitorGraphicsInputFormat,
        config.monitorWidth,
        config.monitorHeight);
  const std::string pvwGraphicsMonitorCompositorInput = useGlMonitorCompositor
    ? pvwMonitorCompositorInput
    : monitor_compositor_input_chain(
        "comp_pvw",
        cpuMonitorGraphicsInputFormat,
        config.monitorWidth,
        config.monitorHeight);
  const std::string pgmMonitorCompositorElement = useGlMonitorCompositor
    ? std::string("glvideomixer name=comp_pgm force-live=true background=black ! ") +
        (useGlMonitorZeroCopy ? "" : "gldownload ! videoconvert ! ")
    : "compositor name=comp_pgm ignore-inactive-pads=true force-live=true ! " +
        std::string(config.monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420
          ? "videoconvert ! "
          : "");
  const std::string pvwMonitorCompositorElement = useGlMonitorCompositor
    ? std::string("glvideomixer name=comp_pvw force-live=true background=black ! ") +
        (useGlMonitorZeroCopy ? "" : "gldownload ! videoconvert ! ")
    : "compositor name=comp_pvw ignore-inactive-pads=true force-live=true ! " +
        std::string(config.monitorCompositorFormatMode == MONITOR_COMPOSITOR_FORMAT_BGRA_TO_I420
          ? "videoconvert ! "
          : "");
  const bool needsMultiviewOverlay =
    config.multiviewHudEnabled || config.multiviewBarsMode == MULTIVIEW_BARS_STATIC;
  const std::string multiviewHudOverlayChain = needsMultiviewOverlay
    ? "cairooverlay name=multiview_overlay ! "
    : "";
  const std::string multiviewSourceRateChain = config.multiviewSourceFps > 0
    ? "videorate drop-only=true ! video/x-raw,framerate=" +
        std::to_string(config.multiviewSourceFps) + "/1 ! "
    : "";
  if (useGlMonitorCompositor) {
    printf("[Mixer] PGM/PVW monitor usan glvideomixer experimental%s\n",
      useGlMonitorZeroCopy ? " (GLMemory hasta glimagesink)" : "");
  } else {
    printf("[Mixer] PGM/PVW monitor compositor CPU: video=%s graphics=%s output=%s\n",
      cpuMonitorVideoInputFormat,
      cpuMonitorGraphicsInputFormat,
      monitorCompositorOutputFormat);
  }

  std::array<char, 65536> pipelineDesc{};
  const int written = std::snprintf(pipelineDesc.data(), pipelineDesc.size(),
    "videotestsrc pattern=0 is-live=true ! videoscale ! "
    "video/x-raw,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! tee name=t0 "
    "t0. ! valve name=pgm_monitor_src_valve0 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "videotestsrc pattern=0 is-live=true ! video/x-raw,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "valve name=pgm_record_src_valve0 drop=true drop-mode=forward-sticky-events ! "
    "queue max-size-buffers=8 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! comp_pgm_record. "
    "t0. ! valve name=pvw_monitor_src_valve0 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t0. ! valve name=pgm_selector_src_valve0 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_monitor_selector. "
    "t0. ! valve name=pvw_selector_src_valve0 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pvw_monitor_selector. "
    "t0. ! valve name=pgm_ab_transition_src_valve0 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_ab_transition_selector. "
    "t0. ! valve name=multiview_src_valve0 drop=false drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! %svideoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! comp_multiview. "
    "t0. ! valve name=thumb_src_valve0 drop=false ! queue max-size-buffers=1 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! "
    "appsink name=thumb0 drop=true max-buffers=1 sync=false async=false "
    "input-selector name=webrtc_selector1 sync-streams=false cache-buffers=false ! tee name=t1 "
    "t1. ! valve name=pgm_monitor_src_valve1 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t1. ! valve name=pvw_monitor_src_valve1 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t1. ! valve name=pgm_selector_src_valve1 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_monitor_selector. "
    "t1. ! valve name=pvw_selector_src_valve1 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pvw_monitor_selector. "
    "t1. ! valve name=pgm_ab_transition_src_valve1 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_ab_transition_selector. "
    "t1. ! valve name=multiview_src_valve1 drop=false drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! %svideoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! comp_multiview. "
    "t1. ! valve name=thumb_src_valve1 drop=false ! queue max-size-buffers=1 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! "
    "appsink name=thumb1 drop=true max-buffers=1 sync=false async=false "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_selector1. "
    "input-selector name=webrtc_record_selector1 sync-streams=false cache-buffers=false ! "
    "valve name=pgm_record_src_valve1 drop=true drop-mode=forward-sticky-events ! queue max-size-buffers=8 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! comp_pgm_record. "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_record_selector1. "
    "input-selector name=webrtc_selector2 sync-streams=false cache-buffers=false ! tee name=t2 "
    "t2. ! valve name=pgm_monitor_src_valve2 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t2. ! valve name=pvw_monitor_src_valve2 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t2. ! valve name=pgm_selector_src_valve2 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_monitor_selector. "
    "t2. ! valve name=pvw_selector_src_valve2 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pvw_monitor_selector. "
    "t2. ! valve name=pgm_ab_transition_src_valve2 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_ab_transition_selector. "
    "t2. ! valve name=multiview_src_valve2 drop=false drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! %svideoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! comp_multiview. "
    "t2. ! valve name=thumb_src_valve2 drop=false ! queue max-size-buffers=1 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! "
    "appsink name=thumb2 drop=true max-buffers=1 sync=false async=false "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_selector2. "
    "input-selector name=webrtc_record_selector2 sync-streams=false cache-buffers=false ! "
    "valve name=pgm_record_src_valve2 drop=true drop-mode=forward-sticky-events ! queue max-size-buffers=8 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! comp_pgm_record. "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_record_selector2. "
    "input-selector name=webrtc_selector3 sync-streams=false cache-buffers=false ! tee name=t3 "
    "t3. ! valve name=pgm_monitor_src_valve3 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t3. ! valve name=pvw_monitor_src_valve3 drop=true drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "t3. ! valve name=pgm_selector_src_valve3 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_monitor_selector. "
    "t3. ! valve name=pvw_selector_src_valve3 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pvw_monitor_selector. "
    "t3. ! valve name=pgm_ab_transition_src_valve3 drop=true ! queue max-size-buffers=2 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1 ! pgm_ab_transition_selector. "
    "t3. ! valve name=multiview_src_valve3 drop=false drop-mode=transform-to-gap ! queue max-size-buffers=2 leaky=downstream ! %svideoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! comp_multiview. "
    "t3. ! valve name=thumb_src_valve3 drop=false ! queue max-size-buffers=1 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=320,height=180 ! "
    "appsink name=thumb3 drop=true max-buffers=1 sync=false async=false "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_selector3. "
    "input-selector name=webrtc_record_selector3 sync-streams=false cache-buffers=false ! "
    "valve name=pgm_record_src_valve3 drop=true drop-mode=forward-sticky-events ! queue max-size-buffers=8 leaky=downstream ! videoscale ! videoconvert ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! comp_pgm_record. "
    "videotestsrc pattern=black is-live=true ! "
    "video/x-raw,format=I420,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! webrtc_record_selector3. "
    "appsrc name=graphics_pgm_src is-live=true format=time do-timestamp=true block=false max-buffers=2 ! "
    "queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "appsrc name=graphics_pvw_src is-live=true format=time do-timestamp=true block=false max-buffers=2 ! "
    "queue max-size-buffers=2 leaky=downstream ! videoscale ! %s"
    "%s"
    "%s"
    "tee name=pgm_monitor_compositor_t "
    "pgm_monitor_compositor_t. ! valve name=pgm_monitor_ipc_valve drop=%s ! "
    "queue max-size-buffers=2 leaky=downstream ! "
    "%s"
    "appsink name=pgm_sink drop=true max-buffers=1 sync=false async=false "
    "pgm_monitor_compositor_t. ! valve name=pgm_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "%s"
    "%s name=pgm_native_monitor_sink %s "
    "pgm_monitor_compositor_t. ! valve name=combined_monitor_pgm_input_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "comp_combined_monitor. "
    "pgm_monitor_compositor_t. ! valve name=pgm_monitor_webrtc_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "video/x-raw,format=NV12,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "vtenc_h264_hw realtime=true allow-frame-reordering=false bitrate=2500 max-keyframe-interval=30 ! "
    "video/x-h264,profile=baseline,stream-format=avc,alignment=au ! "
    "h264parse config-interval=-1 ! rtph264pay name=pgm_monitor_h264pay config-interval=-1 ! "
    "application/x-rtp,media=video,encoding-name=H264,clock-rate=90000 ! "
    "webrtcbin name=pgm_monitor_webrtc "
    "input-selector name=pgm_monitor_selector sync-streams=false cache-buffers=false ! "
    "tee name=pgm_monitor_selector_t "
    "pgm_monitor_selector_t. ! valve name=pgm_selector_ipc_valve drop=%s ! "
    "queue max-size-buffers=2 leaky=downstream ! "
    "appsink name=pgm_selector_sink drop=true max-buffers=1 sync=false async=false "
    "pgm_monitor_selector_t. ! valve name=pgm_selector_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "videoconvert ! videoscale ! "
    "video/x-raw,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "%s name=pgm_selector_native_monitor_sink %s "
    "pgm_monitor_selector_t. ! valve name=pgm_ab_primary_compositor_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "input-selector name=pgm_ab_transition_selector sync-streams=false cache-buffers=false ! "
    "valve name=pgm_ab_secondary_compositor_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "compositor name=comp_pgm_record ignore-inactive-pads=true force-live=true background=black ! "
    "videoconvert ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! "
    "videorate drop-only=true max-rate=30 ! "
    "video/x-raw,format=BGRA,width=%d,height=%d,framerate=30/1 ! "
    "tee name=pgm_record_tee "
    "pgm_record_tee. ! valve name=pgm_record_valve drop=true ! queue max-size-buffers=2 leaky=downstream ! "
    "appsink name=pgm_record_sink drop=true max-buffers=1 sync=false async=false "
    "%s"
    "%s"
    "tee name=pvw_monitor_compositor_t "
    "pvw_monitor_compositor_t. ! valve name=pvw_monitor_ipc_valve drop=%s ! "
    "queue max-size-buffers=2 leaky=downstream ! "
    "%s"
    "appsink name=pvw_sink drop=true max-buffers=1 sync=false async=false "
    "pvw_monitor_compositor_t. ! valve name=pvw_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "%s"
    "%s name=pvw_native_monitor_sink %s "
    "pvw_monitor_compositor_t. ! valve name=combined_monitor_pvw_input_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "comp_combined_monitor. "
    "pvw_monitor_compositor_t. ! valve name=pvw_monitor_webrtc_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "video/x-raw,format=NV12,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "vtenc_h264_hw realtime=true allow-frame-reordering=false bitrate=2500 max-keyframe-interval=30 ! "
    "video/x-h264,profile=baseline,stream-format=avc,alignment=au ! "
    "h264parse config-interval=-1 ! rtph264pay name=pvw_monitor_h264pay config-interval=-1 ! "
    "application/x-rtp,media=video,encoding-name=H264,clock-rate=90000 ! "
    "webrtcbin name=pvw_monitor_webrtc "
    "compositor name=comp_combined_monitor ignore-inactive-pads=true force-live=true background=black ! "
    "videoconvert ! "
    "video/x-raw,format=I420,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "valve name=combined_monitor_webrtc_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! videoconvert ! "
    "video/x-raw,format=NV12,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "vtenc_h264_hw realtime=true allow-frame-reordering=false bitrate=4500 max-keyframe-interval=30 ! "
    "video/x-h264,profile=baseline,stream-format=avc,alignment=au ! "
    "h264parse config-interval=-1 ! rtph264pay name=combined_monitor_h264pay config-interval=-1 ! "
    "application/x-rtp,media=video,encoding-name=H264,clock-rate=90000 ! "
    "webrtcbin name=combined_monitor_webrtc "
    "input-selector name=pvw_monitor_selector sync-streams=false cache-buffers=false ! "
    "tee name=pvw_monitor_selector_t "
    "pvw_monitor_selector_t. ! valve name=pvw_selector_ipc_valve drop=%s ! "
    "queue max-size-buffers=2 leaky=downstream ! "
    "appsink name=pvw_selector_sink drop=true max-buffers=1 sync=false async=false "
    "pvw_monitor_selector_t. ! valve name=pvw_selector_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "videoconvert ! videoscale ! "
    "video/x-raw,width=%d,height=%d,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "%s name=pvw_selector_native_monitor_sink %s "
    "pvw_monitor_selector_t. ! valve name=audio_reference_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "videoconvert ! videoscale ! "
    "video/x-raw,width=480,height=270,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "%s name=audio_reference_native_monitor_sink %s "
    "pvw_monitor_selector_t. ! valve name=audio_reference_frame_valve drop=true ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "videoconvert ! videoscale ! "
    "video/x-raw,format=BGRA,width=320,height=180,framerate=30/1,pixel-aspect-ratio=1/1 ! "
    "appsink name=audio_reference_sink drop=true max-buffers=1 sync=false async=false "
    "pvw_monitor_selector_t. ! valve name=pvw_ab_primary_compositor_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! %s"
    "compositor name=comp_multiview ignore-inactive-pads=true force-live=true background=black ! "
    "%s"
    "videoconvert ! "
    "video/x-raw,format=I420,width=1280,height=180,framerate=15/1,pixel-aspect-ratio=1/1 ! tee name=multiview_monitor_t "
    "multiview_monitor_t. ! valve name=multiview_native_monitor_valve drop=%s ! "
    "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 leaky=downstream ! "
    "%s name=multiview_native_monitor_sink %s "
    "multiview_monitor_t. ! valve name=multiview_monitor_webrtc_valve drop=true ! "
    "queue max-size-buffers=2 leaky=downstream ! videoconvert ! "
    "video/x-raw,format=NV12,width=1280,height=180,framerate=15/1,pixel-aspect-ratio=1/1 ! "
    "vtenc_h264_hw realtime=true allow-frame-reordering=false bitrate=1200 max-keyframe-interval=30 ! "
    "video/x-h264,profile=baseline,stream-format=avc,alignment=au ! "
    "h264parse config-interval=-1 ! rtph264pay name=multiview_monitor_h264pay config-interval=-1 ! "
    "application/x-rtp,media=video,encoding-name=H264,clock-rate=90000 ! "
    "webrtcbin name=multiview_monitor_webrtc ",
    config.internalWidth, config.internalHeight,
    pgmMonitorCompositorInput.c_str(),
    config.internalWidth, config.internalHeight,
    pvwMonitorCompositorInput.c_str(),
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    multiviewSourceRateChain.c_str(),
    pgmMonitorCompositorInput.c_str(),
    pvwMonitorCompositorInput.c_str(),
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    multiviewSourceRateChain.c_str(),
    config.internalWidth, config.internalHeight,
    pgmMonitorCompositorInput.c_str(),
    pvwMonitorCompositorInput.c_str(),
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    multiviewSourceRateChain.c_str(),
    config.internalWidth, config.internalHeight,
    pgmMonitorCompositorInput.c_str(),
    pvwMonitorCompositorInput.c_str(),
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    config.monitorWidth, config.monitorHeight,
    multiviewSourceRateChain.c_str(),
    config.internalWidth, config.internalHeight,
    pgmGraphicsMonitorCompositorInput.c_str(),
    pvwGraphicsMonitorCompositorInput.c_str(),
    pgmMonitorCompositorElement.c_str(),
    monitorCompositorOutputCaps.c_str(),
    pgmMonitorIpcValveDrop, monitorCompositorIpcOutputChain.c_str(),
    nativeMonitorValveDrop, monitorCompositorNativeOutputChain.c_str(),
    nativeMonitorSinkFactory, nativeMonitorSinkProperties,
    monitorCompositorToCpuChain.c_str(), config.monitorWidth, config.monitorHeight,
    monitorCompositorToCpuChain.c_str(), config.monitorWidth, config.monitorHeight,
    pgmSelectorIpcValveDrop,
    nativeMonitorValveDrop, config.monitorWidth, config.monitorHeight,
    nativeMonitorSinkFactory, nativeMonitorSinkProperties,
    pgmMonitorCompositorInput.c_str(),
    pgmMonitorCompositorInput.c_str(),
    config.internalWidth, config.internalHeight,
    config.internalWidth, config.internalHeight,
    pvwMonitorCompositorElement.c_str(),
    monitorCompositorOutputCaps.c_str(),
    pvwMonitorIpcValveDrop, monitorCompositorIpcOutputChain.c_str(),
    nativeMonitorValveDrop, monitorCompositorNativeOutputChain.c_str(),
    nativeMonitorSinkFactory, nativeMonitorSinkProperties,
    monitorCompositorToCpuChain.c_str(), config.monitorWidth, config.monitorHeight,
    monitorCompositorToCpuChain.c_str(), config.monitorWidth, config.monitorHeight,
    combinedMonitorWidth, config.monitorHeight,
    combinedMonitorWidth, config.monitorHeight,
    pvwSelectorIpcValveDrop,
    nativeMonitorValveDrop, config.monitorWidth, config.monitorHeight,
    nativeMonitorSinkFactory, nativeMonitorSinkProperties,
    nativeMonitorValveDrop, nativeMonitorSinkFactory, nativeMonitorSinkProperties,
    pvwMonitorCompositorInput.c_str(),
    multiviewHudOverlayChain.c_str(),
    nativeMonitorValveDrop, nativeMonitorSinkFactory, nativeMonitorSinkProperties);

  if (written < 0 || static_cast<size_t>(written) >= pipelineDesc.size()) {
    fprintf(stderr,
      "[Mixer] Descripcion del pipeline truncada; aumenta el buffer del builder\n");
  }

  return std::string(pipelineDesc.data());
}
