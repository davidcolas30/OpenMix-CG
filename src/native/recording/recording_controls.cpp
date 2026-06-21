#include "recording_controls.h"

#include <chrono>
#include <cstdio>
#include <string>
#include <thread>

#include "env_utils.h"
#include "gst_utils.h"
#include "recording_branch.h"
#include "recording_elements.h"
#include "recording_probes.h"

namespace {

RecordingControlsContext g_context;

GstElement* current_pipeline()
{
  return g_context.pipeline ? *g_context.pipeline : nullptr;
}

GstElement* current_recording_compositor()
{
  return g_context.pgmRecordingCompositor ? *g_context.pgmRecordingCompositor : nullptr;
}

GstElement* current_recording_tee()
{
  return g_context.pgmRecordingTee ? *g_context.pgmRecordingTee : nullptr;
}

GstElement* current_recording_valve()
{
  return g_context.pgmRecordingValve ? *g_context.pgmRecordingValve : nullptr;
}

GstElement* current_native_recording_bin()
{
  return g_context.nativeRecordingBin ? *g_context.nativeRecordingBin : nullptr;
}

bool current_bool(const bool* value)
{
  return value && *value;
}

int current_int(const int* value, int fallback)
{
  return value ? *value : fallback;
}

std::string current_string(const std::string* value)
{
  return value ? *value : std::string();
}

bool has_program_overlay_frame()
{
  return g_context.graphicsProgramFrame && g_context.graphicsProgramFrame->enabled;
}

void set_recording_program_overlay_active(bool active)
{
  if (g_context.recordingProgramOverlayActive) {
    g_context.recordingProgramOverlayActive->store(active, std::memory_order_relaxed);
  }
}

void refresh_recording_program_overlay_active(bool inputsEnabled)
{
  set_recording_program_overlay_active(
    inputsEnabled &&
      current_bool(g_context.nativeProgramRecordingActive) &&
      current_bool(g_context.graphicsOverlayBranchesEnabled) &&
      has_program_overlay_frame());
}

void set_legacy_recording_valve_drop(bool drop)
{
  GstElement* valve = current_recording_valve();
  if (valve) {
    g_object_set(valve, "drop", drop ? TRUE : FALSE, NULL);
  }
}

void apply_recording_audio_delay_locked()
{
  if (!g_context.nativeRecordingAudioDelay || !*g_context.nativeRecordingAudioDelay) {
    return;
  }

  const gint64 tsOffset =
    static_cast<gint64>(current_int(g_context.recordingAudioDelayMs, 0)) * GST_MSECOND;
  set_int64_property_if_exists(*g_context.nativeRecordingAudioDelay, "ts-offset", tsOffset);
}

bool attach_native_recording_branch_locked(const NativeRecordingBranch& branch)
{
  GstElement* pipeline = current_pipeline();
  GstElement* recordingTee = current_recording_tee();
  GstElement* recordingBin = branch.bin;
  if (!pipeline || !recordingTee || !recordingBin) {
    return false;
  }

  if (g_context.eosTracker) {
    reset_recording_eos_tracker(*g_context.eosTracker);
  }

  gst_bin_add(GST_BIN(pipeline), recordingBin);

  GstPadTemplate* teePadTemplate =
    gst_element_class_get_pad_template(GST_ELEMENT_GET_CLASS(recordingTee), "src_%u");
  GstPad* teePad = gst_element_request_pad(recordingTee, teePadTemplate, nullptr, nullptr);
  GstPad* binSinkPad = gst_element_get_static_pad(recordingBin, "sink");

  if (!teePad || !binSinkPad || gst_pad_link(teePad, binSinkPad) != GST_PAD_LINK_OK) {
    if (teePad) {
      gst_element_release_request_pad(recordingTee, teePad);
      gst_object_unref(teePad);
    }
    if (binSinkPad) {
      gst_object_unref(binSinkPad);
    }
    gst_element_set_state(recordingBin, GST_STATE_NULL);
    gst_bin_remove(GST_BIN(pipeline), recordingBin);
    return false;
  }

  gst_object_unref(binSinkPad);
  if (g_context.nativeRecordingTeePad) {
    *g_context.nativeRecordingTeePad = teePad;
  }
  if (g_context.nativeRecordingBin) {
    *g_context.nativeRecordingBin = recordingBin;
  }
  if (g_context.nativeRecordingAudioDelay) {
    *g_context.nativeRecordingAudioDelay = branch.audioDelay;
  }
  if (g_context.nativeRecordingAudioSource) {
    *g_context.nativeRecordingAudioSource = branch.audioSource;
  }
  if (g_context.nativeRecordingAudioMuxQueue) {
    *g_context.nativeRecordingAudioMuxQueue = branch.audioMuxQueue;
  }
  if (g_context.nativeRecordingAudioMuxerSinkPad) {
    *g_context.nativeRecordingAudioMuxerSinkPad = branch.audioMuxerSinkPad;
  }
  if (g_context.nativeRecordingFileSink) {
    *g_context.nativeRecordingFileSink = branch.fileSink;
  }

  /*
   * El EOS del pipeline global no sirve para saber si ha cerrado REC: el mixer
   * sigue vivo. Observamos el sink del fichero y esperamos a que el contenedor
   * MP4 haya propagado EOS hasta filesink antes de desmontar la rama.
   */
  if (g_context.eosTracker && branch.fileSink) {
    add_recording_filesink_eos_probe(branch.fileSink, *g_context.eosTracker);
  }

  return true;
}

bool recording_context_ready()
{
  return g_context.mixerMutex &&
    g_context.pipeline &&
    g_context.pgmRecordingTee &&
    g_context.pgmRecordingValve &&
    g_context.nativeRecordingBin &&
    g_context.nativeProgramRecordingActive &&
    g_context.programRecordingEnabled;
}

bool recording_control_context_ready()
{
  return g_context.mixerMutex != nullptr;
}

} // namespace

void set_recording_controls_context(const RecordingControlsContext& context)
{
  g_context = context;
}

GstElement* set_recording_compositor_sleeping_locked(bool shouldSleep)
{
  return set_recording_compositor_sleeping(current_recording_compositor(), shouldSleep);
}

GstElement* set_recording_inputs_enabled_locked(bool enabled)
{
  if (g_context.programRecordingEnabled) {
    *g_context.programRecordingEnabled = enabled;
  }
  refresh_recording_program_overlay_active(enabled);

  if (enabled && g_context.recordingTimelineGeneration) {
    g_context.recordingTimelineGeneration->fetch_add(1, std::memory_order_relaxed);
  }

  // Estas valves están antes de videoscale/videoconvert/compositor. Cerrarlas
  // corta el trabajo 1080p desde la raíz: con REC activo solo abrimos Program
  // (o Program+Preview durante una transición), no todas las fuentes.
  if (enabled) {
    if (g_context.applyRecordingSteadyProgramLayoutLocked) {
      g_context.applyRecordingSteadyProgramLayoutLocked();
    }
    if (g_context.setRecordingSourceValvesForSources) {
      g_context.setRecordingSourceValvesForSources(
        true,
        current_int(g_context.programSource, 0),
        -1);
    }
  } else if (g_context.setRecordingSourceValvesForSources) {
    g_context.setRecordingSourceValvesForSources(false, -1, -1);
  }

  if (!enabled) {
    set_recording_compositor_sleeping_locked(true);
    return nullptr;
  }

  return set_recording_compositor_sleeping_locked(false);
}

void destroy_native_recording_branch_locked(bool sendEos)
{
  set_recording_program_overlay_active(false);

  GstElement* nativeRecordingBin = current_native_recording_bin();
  if (!nativeRecordingBin) {
    if (g_context.nativeProgramRecordingActive) {
      *g_context.nativeProgramRecordingActive = false;
    }
    return;
  }

  GstPad* teePad = g_context.nativeRecordingTeePad
    ? *g_context.nativeRecordingTeePad
    : nullptr;
  GstElement* audioMuxQueue = g_context.nativeRecordingAudioMuxQueue
    ? *g_context.nativeRecordingAudioMuxQueue
    : nullptr;
  GstElement* audioSource = g_context.nativeRecordingAudioSource
    ? *g_context.nativeRecordingAudioSource
    : nullptr;
  GstPad* audioMuxerSinkPad = g_context.nativeRecordingAudioMuxerSinkPad
    ? *g_context.nativeRecordingAudioMuxerSinkPad
    : nullptr;

  if (sendEos) {
    if (teePad) {
      /*
       * STOP REC es el corte operativo del fichero. A partir de aqui dejamos
       * pasar eventos como EOS, pero no buffers nuevos desde Program; si no,
       * el muxer sigue creciendo mientras esperamos a que se cierre el MP4.
       */
      add_drop_recording_buffers_after_stop_probe(teePad);
    }
    // MP4 necesita EOS para escribir el índice/moov final. Este EOS se manda
    // solo a la rama dinámica de grabación, no al pipeline completo.
    if (audioMuxQueue) {
      /*
       * El audio local es una fuente live independiente del Program. Cortamos
       * buffers nuevos y marcamos EOS directamente en el pad del muxer: asi el
       * track de audio termina en el STOP operativo sin bloquear el hilo
       * principal atravesando colas internas de GStreamer.
       */
      drop_future_source_pad_buffers(audioMuxQueue, "audio");
      send_eos_to_muxer_sink_pad(audioMuxerSinkPad, "audio");
    } else if (audioSource) {
      push_eos_from_source_pad(audioSource, "audio");
    }
    const gboolean videoEosSent =
      gst_element_send_event(nativeRecordingBin, gst_event_new_eos());
    if (!videoEosSent) {
      fprintf(stderr, "[Output] No se pudo enviar EOS a REC video\n");
    }
    if (g_context.eosTracker) {
      wait_recording_filesink_eos(*g_context.eosTracker, std::chrono::seconds(8));
    }
  }

  GstPad* binSinkPad = gst_element_get_static_pad(nativeRecordingBin, "sink");
  if (teePad && binSinkPad) {
    gst_pad_unlink(teePad, binSinkPad);
  }
  if (binSinkPad) {
    gst_object_unref(binSinkPad);
  }

  GstElement* recordingTee = current_recording_tee();
  if (teePad && recordingTee) {
    gst_element_release_request_pad(recordingTee, teePad);
    gst_object_unref(teePad);
  }
  if (g_context.nativeRecordingTeePad) {
    *g_context.nativeRecordingTeePad = nullptr;
  }
  if (g_context.nativeRecordingAudioDelay) {
    *g_context.nativeRecordingAudioDelay = nullptr;
  }
  if (g_context.nativeRecordingAudioSource) {
    *g_context.nativeRecordingAudioSource = nullptr;
  }
  if (g_context.nativeRecordingAudioMuxQueue) {
    *g_context.nativeRecordingAudioMuxQueue = nullptr;
  }
  if (g_context.nativeRecordingAudioMuxerSinkPad &&
      *g_context.nativeRecordingAudioMuxerSinkPad) {
    gst_object_unref(*g_context.nativeRecordingAudioMuxerSinkPad);
    *g_context.nativeRecordingAudioMuxerSinkPad = nullptr;
  }
  if (g_context.nativeRecordingFileSink) {
    *g_context.nativeRecordingFileSink = nullptr;
  }

  gst_element_set_state(nativeRecordingBin, GST_STATE_NULL);
  GstElement* pipeline = current_pipeline();
  if (pipeline) {
    gst_bin_remove(GST_BIN(pipeline), nativeRecordingBin);
  }
  if (g_context.nativeRecordingBin) {
    *g_context.nativeRecordingBin = nullptr;
  }
  if (g_context.nativeProgramRecordingActive) {
    *g_context.nativeProgramRecordingActive = false;
  }
}

Napi::Value set_program_recording_enabled(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!recording_control_context_ready()) {
    Napi::Error::New(env, "Contexto de grabación no inicializado")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (info.Length() < 1 || !info[0].IsBoolean()) {
    Napi::Error::New(env, "setProgramRecordingEnabled requiere un booleano")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const bool enabled = info[0].As<Napi::Boolean>().Value();
  GstElement* recordingCompositorToSync = nullptr;
  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    recordingCompositorToSync = set_recording_inputs_enabled_locked(enabled);
    // API heredada: abre/cierra el appsink de 1080p que entrega buffers a JS.
    // La grabación nueva no usa esta salida, pero se conserva para pruebas y
    // para no romper llamadas antiguas mientras migramos arquitectura.
    set_legacy_recording_valve_drop(!enabled);
  }

  sync_recording_compositor_state(recordingCompositorToSync);
  return env.Undefined();
}

Napi::Value start_program_recording(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!recording_control_context_ready()) {
    Napi::Error::New(env, "Contexto de grabación no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (!recording_context_ready()) {
    Napi::Error::New(env, "Contexto de grabación no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 4 || !info[0].IsString() || !info[1].IsString() ||
      !info[2].IsString() || !info[3].IsNumber()) {
    Napi::Error::New(env,
      "startProgramRecording(filePath, container, videoPreset, qualityCrf) requiere string, string, string, number")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const std::string filePath = info[0].As<Napi::String>().Utf8Value();
  const std::string container = info[1].As<Napi::String>().Utf8Value();
  const std::string videoPreset = info[2].As<Napi::String>().Utf8Value();
  const int qualityCrf = info[3].As<Napi::Number>().Int32Value();

  if (container != "mp4" && container != "mkv") {
    Napi::Error::New(env, "Contenedor de grabación no soportado. Usa 'mp4' o 'mkv'.")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    if (!current_pipeline() || !current_recording_tee()) {
      Napi::Error::New(env, "El pipeline del mixer no está preparado para grabar.")
        .ThrowAsJavaScriptException();
      return Napi::Boolean::New(env, false);
    }

    if (current_bool(g_context.nativeProgramRecordingActive) ||
        current_native_recording_bin()) {
      Napi::Error::New(env, "Ya hay una grabación nativa activa.")
        .ThrowAsJavaScriptException();
      return Napi::Boolean::New(env, false);
    }

    // La rama legacy queda cerrada: REC debe quedarse dentro de GStreamer y no
    // empujar BGRA 1080p al Main Process de Electron.
    set_legacy_recording_valve_drop(true);
  }

  NativeRecordingBranchConfig recordingBranchConfig;
  recordingBranchConfig.filePath = filePath;
  recordingBranchConfig.container = container;
  recordingBranchConfig.videoPreset = videoPreset;
  recordingBranchConfig.qualityCrf = qualityCrf;
  recordingBranchConfig.internalWidth = g_context.internalWidth;
  recordingBranchConfig.internalHeight = g_context.internalHeight;
  recordingBranchConfig.frameRateNum = g_context.frameRateNum;
  recordingBranchConfig.frameRateDen = g_context.frameRateDen;
  recordingBranchConfig.audioEnabled = current_bool(g_context.recordingAudioEnabled);
  recordingBranchConfig.audioSourceName =
    current_string(g_context.recordingAudioSourceName);
  recordingBranchConfig.audioDelayMs = current_int(g_context.recordingAudioDelayMs, 0);
  recordingBranchConfig.audioRate = g_context.recordingAudioRate;
  recordingBranchConfig.audioChannels = g_context.recordingAudioChannels;
  recordingBranchConfig.audioBitrate = g_context.recordingAudioBitrate;
  recordingBranchConfig.recordingTimelineGeneration =
    g_context.recordingTimelineGeneration;

  NativeRecordingBranch branch =
    create_native_recording_branch(recordingBranchConfig);
  if (!branch.bin) {
    Napi::Error::New(env, "No se pudo crear la rama nativa de grabación H264.")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const std::string selectedEncoder = branch.encoderName;
  const bool recordingAudioEnabled = branch.audioEnabled;
  const std::string selectedAudioSource = branch.audioSourceName;
  const std::string selectedAudioEncoder = branch.audioEncoderName;
  const int recordingPrewarmMs = parse_env_int_clamped(
    "OPENMIX_RECORDING_PREWARM_MS",
    250,
    0,
    1000);

  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    if (current_bool(g_context.nativeProgramRecordingActive) ||
        current_native_recording_bin()) {
      if (branch.audioMuxerSinkPad) {
        gst_object_unref(branch.audioMuxerSinkPad);
      }
      gst_object_unref(branch.bin);
      Napi::Error::New(env, "Ya hay una grabación nativa activa.")
        .ThrowAsJavaScriptException();
      return Napi::Boolean::New(env, false);
    }

    /*
     * La rama de fichero se engancha con las entradas REC todavia cerradas. Es
     * el orden seguro para ramas dinamicas: primero existe y entra en PLAYING la
     * salida nueva; despues abrimos las valves de Program. Si se hace al reves,
     * el tee puede empujar buffers hacia un bin que aun esta cambiando de estado.
     */
    if (!attach_native_recording_branch_locked(branch)) {
      if (branch.audioMuxerSinkPad) {
        gst_object_unref(branch.audioMuxerSinkPad);
      }
      Napi::Error::New(env, "No se pudo conectar la rama nativa de grabación al Program.")
        .ThrowAsJavaScriptException();
      return Napi::Boolean::New(env, false);
    }
  }

  /*
   * Sincronizar el estado de una rama dinámica puede disparar eventos de latencia
   * en todo el pipeline. No se hace con g_mutex tomado: si un hilo de streaming
   * necesita ese mismo candado para responder, Electron queda congelado al pulsar
   * REC.
   */
  printf("[Output] REC arrancando rama de fichero...\n");
  const gboolean recordingStateSynced =
    gst_element_sync_state_with_parent(branch.bin);
  printf("[Output] REC rama de fichero arrancada: %s\n", recordingStateSynced ? "ok" : "error");
  if (!recordingStateSynced) {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    destroy_native_recording_branch_locked(false);
    set_recording_inputs_enabled_locked(false);
    Napi::Error::New(env, "No se pudo arrancar la rama nativa de grabación.")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  GstElement* recordingCompositorToSync = nullptr;
  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    /*
     * A partir de aqui el fichero ya existe como consumidor PLAYING. Abrimos el
     * Program 1080p y despertamos su compositor fuera del mutex para que el MP4
     * reciba la misma fuente logica que esta al aire, incluidas las barras.
     */
    recordingCompositorToSync = set_recording_inputs_enabled_locked(true);
  }
  sync_recording_compositor_state(recordingCompositorToSync);

  int currentProgramSource = -1;
  int currentAudioDelayMs = 0;
  {
    std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
    if (g_context.nativeProgramRecordingActive) {
      *g_context.nativeProgramRecordingActive = true;
    }
    refresh_recording_program_overlay_active(
      current_bool(g_context.programRecordingEnabled));
    currentProgramSource = current_int(g_context.programSource, 0);
    currentAudioDelayMs = current_int(g_context.recordingAudioDelayMs, 0);
  }

  if (recordingPrewarmMs > 0) {
    /*
     * Este prewarm ya escribe en la rama dinámica. Evita que el primer IDR salga
     * de un compositor recién abierto, pero conserva en el fichero la señal que
     * el operador tenía en Program al pulsar REC.
     */
    std::this_thread::sleep_for(std::chrono::milliseconds(recordingPrewarmMs));
  }
  printf("[Output] Grabación nativa iniciada: encoder=%s container=%s source=%d audio=%s%s%s delay=%dms file=%s\n",
    selectedEncoder.c_str(),
    container.c_str(),
    currentProgramSource,
    recordingAudioEnabled ? "on" : "off",
    recordingAudioEnabled ? " source=" : "",
    recordingAudioEnabled ? selectedAudioSource.c_str() : "",
    recordingAudioEnabled ? currentAudioDelayMs : 0,
    filePath.c_str());
  if (recordingAudioEnabled) {
    printf("[RecordingAudio] encoder=%s\n", selectedAudioEncoder.c_str());
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value stop_program_recording(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (!recording_control_context_ready()) {
    return Napi::Boolean::New(env, false);
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);

  if (!current_bool(g_context.nativeProgramRecordingActive)) {
    return Napi::Boolean::New(env, false);
  }

  destroy_native_recording_branch_locked(true);
  set_recording_inputs_enabled_locked(false);
  set_legacy_recording_valve_drop(true);
  printf("[Output] Grabación nativa detenida\n");
  return Napi::Boolean::New(env, true);
}

Napi::Value set_recording_audio_delay_ms(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();

  if (!recording_control_context_ready()) {
    Napi::Error::New(env, "Contexto de grabación no inicializado")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::Error::New(env, "setRecordingAudioDelayMs(delayMs) requiere un numero")
      .ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  const int requestedDelayMs = info[0].As<Napi::Number>().Int32Value();
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);
  if (g_context.recordingAudioDelayMs) {
    *g_context.recordingAudioDelayMs = clamp_recording_audio_delay_ms(
      requestedDelayMs,
      g_context.minRecordingAudioDelayMs,
      g_context.maxRecordingAudioDelayMs);
  }
  apply_recording_audio_delay_locked();
  printf("[RecordingAudio] delay=%dms%s\n",
    current_int(g_context.recordingAudioDelayMs, 0),
    g_context.nativeRecordingAudioDelay && *g_context.nativeRecordingAudioDelay
      ? " aplicado"
      : " preparado");
  return Napi::Boolean::New(env, true);
}

Napi::Value get_recording_audio_state(const Napi::CallbackInfo& info)
{
  Napi::Env env = info.Env();
  if (!recording_control_context_ready()) {
    Napi::Object state = Napi::Object::New(env);
    state.Set("enabled", Napi::Boolean::New(env, false));
    state.Set("active", Napi::Boolean::New(env, false));
    state.Set("source", Napi::String::New(env, ""));
    state.Set("delayMs", Napi::Number::New(env, 0));
    return state;
  }
  std::lock_guard<std::mutex> lock(*g_context.mixerMutex);

  Napi::Object state = Napi::Object::New(env);
  state.Set("enabled", Napi::Boolean::New(env, current_bool(g_context.recordingAudioEnabled)));
  state.Set("active", Napi::Boolean::New(env,
    current_bool(g_context.nativeProgramRecordingActive) &&
      g_context.nativeRecordingAudioDelay &&
      *g_context.nativeRecordingAudioDelay != nullptr));
  state.Set("source", Napi::String::New(env, current_string(g_context.recordingAudioSourceName)));
  state.Set("delayMs", Napi::Number::New(env, current_int(g_context.recordingAudioDelayMs, 0)));
  return state;
}
