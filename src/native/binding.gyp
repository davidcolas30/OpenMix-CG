{
  "targets": [
    {
      "target_name": "gstreamer_addon",
      "sources": [
        "addon/gstreamer_addon.cpp",
        "addon/gstreamer_addon_exports.cpp",
        "addon/gstreamer_addon_state.cpp",
        "addon/gstreamer_addon_wiring.cpp",
        "addon/env_utils.cpp",
        "common/gst_utils.cpp",
        "graphics/graphics_overlay_controls.cpp",
        "graphics/graphics_overlay_frame.cpp",
        "graphics/graphics_overlay_runtime.cpp",
        "local_video/local_video_controls.cpp",
        "local_video/local_video_source.cpp",
        "mixer/mixer_control_actions.cpp",
        "mixer/mixer_diagnostics_state.cpp",
        "mixer/mixer_pipeline_builder.cpp",
        "mixer/mixer_pipeline_callbacks.cpp",
        "mixer/mixer_pipeline_creation.cpp",
        "mixer/mixer_pipeline_cleanup.cpp",
        "mixer/mixer_pipeline_diagnostics.cpp",
        "mixer/mixer_pipeline_handles.cpp",
        "mixer/mixer_pipeline_js_callbacks.cpp",
        "mixer/mixer_pipeline_lifecycle.cpp",
        "mixer/mixer_pipeline_pads.cpp",
        "mixer/mixer_pipeline_runtime_refs.cpp",
        "mixer/mixer_route_controls.cpp",
        "mixer/mixer_runtime_config.cpp",
        "mixer/mixer_runtime_config_graphics.cpp",
        "mixer/mixer_runtime_config_monitor.cpp",
        "mixer/mixer_runtime_config_multiview.cpp",
        "mixer/mixer_runtime_config_recording.cpp",
        "mixer/mixer_runtime_config_webrtc_sync.cpp",
        "mixer/mixer_selector_links.cpp",
        "mixer/mixer_source_routing.cpp",
        "mixer/mixer_transition.cpp",
        "monitors/monitor_frame_bridge.cpp",
        "monitors/monitor_webrtc_controls.cpp",
        "monitors/monitor_webrtc_endpoint.cpp",
        "monitors/monitor_diagnostics.cpp",
        "monitors/multiview_overlay.cpp",
        "monitors/multiview_source_control.cpp",
        "monitors/native_monitor_controls.cpp",
        "recording/recording_branch.cpp",
        "recording/recording_controls.cpp",
        "recording/recording_elements.cpp",
        "recording/recording_eos.cpp",
        "recording/recording_overlay.cpp",
        "recording/recording_probes.cpp",
        "recording/recording_raw_probe.cpp",
        "sync/sync_buffer_manager.cpp",
        "webrtc/webrtc_h264_branch.cpp",
        "webrtc/webrtc_h264_trace.cpp",
        "webrtc/webrtc_jitterbuffer_hooks.cpp",
        "webrtc/webrtc_legacy_bridge.cpp",
        "webrtc/webrtc_media_dispatch.cpp",
        "webrtc/webrtc_peer_controls.cpp",
        "webrtc/webrtc_peer_lifecycle.cpp",
        "webrtc/webrtc_pli_reserve.cpp",
        "webrtc/webrtc_rx_stats.cpp",
        "webrtc/webrtc_runtime_controls.cpp",
        "webrtc/webrtc_signaling_callbacks.cpp",
        "webrtc/webrtc_utils.cpp"
      ],

      # node-addon-api: wrapper C++ sobre N-API que simplifica la escritura del addon.
      # Se incluye como header-only library.
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include_dir\")",
        ".",
        "addon",
        "common",
        "graphics",
        "local_video",
        "mixer",
        "monitors",
        "recording",
        "sync",
        "webrtc"
      ],

      # NAPI_DISABLE_CPP_EXCEPTIONS: usamos return-value error handling
      # en vez de excepciones C++ (más seguro con GStreamer que es C puro).
      # NODE_ADDON_API_DISABLE_DEPRECATED: evita usar APIs obsoletas.
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NODE_ADDON_API_DISABLE_DEPRECATED",
        "GST_USE_UNSTABLE_API"
      ],

      "conditions": [
        ["OS=='mac'", {
          # En macOS con Homebrew, usamos pkg-config para descubrir
          # automáticamente dónde están los headers y librerías de GStreamer.
          # gstreamer-1.0: core de GStreamer
          # gstreamer-app-1.0: appsrc y appsink (inyectar/extraer frames)
          # gstreamer-webrtc-1.0: webrtcbin (recepción de streams WebRTC)
          # gstreamer-sdp-1.0: parsing/creación de mensajes SDP
          # gstreamer-rtp-1.0: inspección diagnóstica de timestamps RTP
          # gstreamer-video-1.0: GstVideoInfo/GstVideoFrame (stride handling)
          # cairo: dibujo ligero del HUD de multiview nativa dentro del frame
          "cflags": [
            "<!@(pkg-config --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0 gstreamer-sdp-1.0 gstreamer-rtp-1.0 cairo)"
          ],
          "xcode_settings": {
            "OTHER_CFLAGS": [
              "<!@(pkg-config --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0 gstreamer-sdp-1.0 gstreamer-rtp-1.0 cairo)"
            ],
            # C++17 necesario para std::optional y structured bindings
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "12.0"
          },
          "libraries": [
            "<!@(pkg-config --libs gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0 gstreamer-sdp-1.0 gstreamer-rtp-1.0 cairo)"
          ]
        }],
        ["OS=='linux'", {
          "cflags": [
            "<!@(pkg-config --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0 gstreamer-sdp-1.0 gstreamer-rtp-1.0 cairo)"
          ],
          "cflags_cc": ["-std=c++17"],
          "libraries": [
            "<!@(pkg-config --libs gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 gstreamer-webrtc-1.0 gstreamer-sdp-1.0 gstreamer-rtp-1.0 cairo)"
          ]
        }]
      ]
    }
  ]
}
