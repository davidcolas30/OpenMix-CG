/**
 * gstreamer_addon.cpp — punto de entrada N-API del backend nativo.
 *
 * Este archivo solo inicializa GStreamer, lee las guardas de entorno y registra
 * las funciones exportadas a JavaScript. El estado global, el cableado de
 * contextos y la logica multimedia viven en modulos especializados para que la
 * arquitectura sea navegable y mantenible.
 */

#include <napi.h>
#include <gst/gst.h>

#include "env_utils.h"
#include "gstreamer_addon_exports.h"
#include "gstreamer_addon_state.h"
#include "gstreamer_addon_wiring.h"
#include "mixer_runtime_config.h"

// ────────────────────────────────────────────────────────────
// Funciones exportadas a JavaScript
// ────────────────────────────────────────────────────────────

/**
 * initialize() — Inicializa GStreamer.
 * Debe llamarse UNA sola vez antes de crear pipelines.
 *
 * Configura GST_PLUGIN_SYSTEM_PATH para que GStreamer encuentre los
 * plugins instalados por Homebrew (en macOS ARM). Sin esto, al ejecutar
 * dentro de Electron, el entorno no hereda las rutas del shell y
 * plugins como webrtcbin no se encuentran.
 */
static Napi::Value Initialize(const Napi::CallbackInfo& info)
{
  if (!g_initialized) {
    configure_gstreamer_environment_for_electron();
    gst_init(nullptr, nullptr);
    configure_mixer_runtime_from_env();
    configure_gstreamer_addon_runtime_contexts();
    g_initialized = true;
  }
  return info.Env().Undefined();
}

/**
 * Módulo de inicialización N-API.
 *
 * Registra todas las funciones del mixer y WebRTC como propiedades del módulo.
 * Estas funciones son accesibles desde JavaScript después de require().
 *
 * Uso desde JS:
 *   const addon = require('./gstreamer_addon.node');
 *   addon.initialize();
 *   addon.createMixerPipeline(
 *     onPgm, onPvw, onThumb, onBus, onPgmRecording, onAudioReference,
 *     monitorWidth, monitorHeight);
 *   addon.startPipeline();
 *   addon.cut();
 *   addon.createWebRTCPeer(peerId, sourceIndex, onAnswer, onIceCandidate);
 */
static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
  return register_gstreamer_addon_exports(
    env,
    exports,
    Napi::Function::New(env, Initialize));
}

NODE_API_MODULE(gstreamer_addon, Init)
