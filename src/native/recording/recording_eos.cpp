#include "recording_eos.h"

#include <cstdio>

void reset_recording_eos_tracker(RecordingEosTracker& tracker)
{
  if (!tracker.mutex || !tracker.filesinkEosSeen) {
    return;
  }

  std::lock_guard<std::mutex> eosLock(*tracker.mutex);
  *tracker.filesinkEosSeen = false;
}

static GstPadProbeReturn on_recording_filesink_event_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer userData)
{
  if (!(GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM)) {
    return GST_PAD_PROBE_OK;
  }

  GstEvent* event = GST_PAD_PROBE_INFO_EVENT(info);
  if (!event || GST_EVENT_TYPE(event) != GST_EVENT_EOS) {
    return GST_PAD_PROBE_OK;
  }

  RecordingEosTracker* tracker = static_cast<RecordingEosTracker*>(userData);
  if (!tracker || !tracker->mutex || !tracker->condition || !tracker->filesinkEosSeen) {
    return GST_PAD_PROBE_OK;
  }

  {
    std::lock_guard<std::mutex> eosLock(*tracker->mutex);
    *tracker->filesinkEosSeen = true;
  }
  tracker->condition->notify_all();
  printf("[Output] EOS REC recibido en filesink\n");
  return GST_PAD_PROBE_OK;
}

void add_recording_filesink_eos_probe(
  GstElement* fileSink,
  RecordingEosTracker& tracker)
{
  if (!fileSink) {
    return;
  }

  GstPad* fileSinkPad = gst_element_get_static_pad(fileSink, "sink");
  if (!fileSinkPad) {
    return;
  }

  gst_pad_add_probe(
    fileSinkPad,
    GST_PAD_PROBE_TYPE_EVENT_DOWNSTREAM,
    on_recording_filesink_event_probe,
    &tracker,
    nullptr);
  gst_object_unref(fileSinkPad);
}

bool wait_recording_filesink_eos(
  RecordingEosTracker& tracker,
  std::chrono::seconds timeout)
{
  if (!tracker.mutex || !tracker.condition || !tracker.filesinkEosSeen) {
    return false;
  }

  std::unique_lock<std::mutex> eosLock(*tracker.mutex);
  const bool eosReceived = tracker.condition->wait_for(
    eosLock,
    timeout,
    [&tracker] { return *tracker.filesinkEosSeen; });

  if (!eosReceived) {
    fprintf(stderr,
      "[Output] Timeout esperando EOS de grabacion nativa; el contenedor puede quedar incompleto\n");
  }
  return eosReceived;
}

bool push_eos_from_source_pad(GstElement* element, const char* label)
{
  if (!element) {
    return false;
  }

  GstPad* srcPad = gst_element_get_static_pad(element, "src");
  if (!srcPad) {
    fprintf(stderr, "[Output] No se pudo localizar pad src para cerrar REC %s\n", label);
    return false;
  }

  /*
   * Las fuentes live internas de la rama (por ejemplo osxaudiosrc) no reciben
   * el EOS que entra por el ghost pad de video. Para que mp4mux escriba el moov
   * final, cada pad del muxer debe ver EOS; por eso empujamos el evento desde
   * el src pad de audio hacia delante.
   */
  const gboolean sent = gst_pad_push_event(srcPad, gst_event_new_eos());
  gst_object_unref(srcPad);
  if (!sent) {
    fprintf(stderr, "[Output] No se pudo enviar EOS a REC %s\n", label);
  }
  return sent == TRUE;
}

static GstPadProbeReturn drop_recording_buffers_after_stop_probe(
  GstPad* /*pad*/,
  GstPadProbeInfo* info,
  gpointer /*userData*/)
{
  const GstPadProbeType type = GST_PAD_PROBE_INFO_TYPE(info);
  if ((type & GST_PAD_PROBE_TYPE_BUFFER) ||
      (type & GST_PAD_PROBE_TYPE_BUFFER_LIST)) {
    return GST_PAD_PROBE_DROP;
  }
  return GST_PAD_PROBE_OK;
}

void add_drop_recording_buffers_after_stop_probe(GstPad* pad)
{
  if (!pad) {
    return;
  }

  gst_pad_add_probe(
    pad,
    static_cast<GstPadProbeType>(
      GST_PAD_PROBE_TYPE_BUFFER | GST_PAD_PROBE_TYPE_BUFFER_LIST),
    drop_recording_buffers_after_stop_probe,
    nullptr,
    nullptr);
}

bool send_eos_to_muxer_sink_pad(GstPad* sinkPad, const char* label)
{
  if (!sinkPad) {
    return false;
  }

  /*
   * Al parar REC no conviene empujar EOS desde audioMuxQueue.src: en pruebas
   * reales, esa llamada podia quedarse bloqueada intentando tomar locks de pads
   * mientras el muxer recibia rafagas de video. Enviar EOS directamente al sink
   * pad del muxer marca cerrado el track de audio sin recorrer la cola.
   *
   * EOS es un evento serializado: si el pad esta ocupado por el streaming
   * thread, puede esperar al stream-lock y congelar Electron. FLUSH_START no es
   * serializado y desbloquea ese pad; FLUSH_STOP deja el pad listo para recibir
   * el EOS operativo de cierre.
   */
  gst_pad_send_event(sinkPad, gst_event_new_flush_start());
  gst_pad_send_event(sinkPad, gst_event_new_flush_stop(FALSE));
  const gboolean sent = gst_pad_send_event(sinkPad, gst_event_new_eos());
  if (!sent) {
    fprintf(stderr, "[Output] No se pudo enviar EOS directo a REC %s\n", label);
  }
  return sent == TRUE;
}

void drop_future_source_pad_buffers(GstElement* element, const char* label)
{
  if (!element) {
    return;
  }

  GstPad* srcPad = gst_element_get_static_pad(element, "src");
  if (!srcPad) {
    fprintf(stderr, "[Output] No se pudo localizar pad src para cortar buffers REC %s\n", label);
    return;
  }

  add_drop_recording_buffers_after_stop_probe(srcPad);
  gst_object_unref(srcPad);
}
