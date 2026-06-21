#include "webrtc_signaling_callbacks.h"

#include <gst/sdp/sdp.h>
#include <gst/webrtc/webrtc.h>

#include <cstdio>
#include <string>

#include "webrtc_peer.h"

/**
 * Callback: webrtcbin ha generado una SDP answer.
 *
 * Se dispara despues de que llamemos create-answer. Extraemos la SDP,
 * la configuramos como descripcion local, y la enviamos a JavaScript
 * para que la senalizacion la reenvie al movil.
 *
 * Flujo SDP completo:
 * 1. Movil crea offer (describe sus codecs, resolucion, tracks)
 * 2. Nosotros recibimos offer -> set-remote-description en webrtcbin
 * 3. Llamamos create-answer -> webrtcbin genera answer con sus capacidades
 * 4. AQUI: recibimos la answer -> set-local-description -> enviar al movil
 * 5. Movil recibe answer -> ambos lados saben que codecs/formatos usar
 */
void on_webrtc_answer_created(GstPromise* promise, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);
  printf("[WebRTC] on_webrtc_answer_created disparado para %s\n", peer->peerId.c_str());

  if (peer->destroyed) {
    printf("[WebRTC] Peer %s ya destruido, ignorando answer\n", peer->peerId.c_str());
    gst_promise_unref(promise);
    return;
  }

  // Verificar el estado del promise
  GstPromiseResult result = gst_promise_wait(promise);
  printf("[WebRTC] Promise result para %s: %d (0=pending, 1=interrupted, 2=replied, 3=expired)\n",
    peer->peerId.c_str(), (int)result);

  if (result != GST_PROMISE_RESULT_REPLIED) {
    fprintf(stderr, "[WebRTC] Error: promise no completado (result=%d) para %s\n",
      (int)result, peer->peerId.c_str());
    gst_promise_unref(promise);
    return;
  }

  // Verificar que el promise se resolvio correctamente
  const GstStructure* reply = gst_promise_get_reply(promise);
  if (!reply) {
    fprintf(stderr, "[WebRTC] Error: promise sin reply para %s\n",
      peer->peerId.c_str());
    gst_promise_unref(promise);
    return;
  }

  // Debug: imprimir la estructura del reply para ver que campos contiene
  gchar* replyStr = gst_structure_to_string(reply);
  printf("[WebRTC] Reply structure para %s: %s\n", peer->peerId.c_str(), replyStr);
  g_free(replyStr);

  // Extraer la SDP answer de la respuesta del promise
  GstWebRTCSessionDescription* answer = nullptr;
  gst_structure_get(reply, "answer",
    GST_TYPE_WEBRTC_SESSION_DESCRIPTION, &answer, NULL);

  if (!answer) {
    fprintf(stderr, "[WebRTC] Error: no se pudo obtener la SDP answer para %s\n",
      peer->peerId.c_str());
    gst_promise_unref(promise);
    return;
  }

  printf("[WebRTC] SDP answer generada exitosamente para %s\n", peer->peerId.c_str());

  // Configurar la answer como descripcion local del webrtcbin
  g_signal_emit_by_name(peer->webrtcbin, "set-local-description", answer, NULL);

  gchar* sdpText = gst_sdp_message_as_text(answer->sdp);
  std::string sdpStr(sdpText);
  g_free(sdpText);

  printf("[WebRTC] Enviando answer SDP a JS via TSFN para %s\n",
    peer->peerId.c_str());
  peer->onAnswerTsfn.BlockingCall(
    [sdpStr](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object answerObj = Napi::Object::New(env);
      answerObj.Set("type", Napi::String::New(env, "answer"));
      answerObj.Set("sdp", Napi::String::New(env, sdpStr));
      jsCallback.Call({ answerObj });
    }
  );

  gst_webrtc_session_description_free(answer);
  gst_promise_unref(promise);
}

/**
 * Callback: set-remote-description ha completado.
 *
 * Ahora que webrtcbin conoce la offer del peer remoto, podemos
 * crear la answer de forma segura. Este orden es CRITICO:
 * set-remote-description es asincrono; si llamamos create-answer
 * antes de que termine, webrtcbin no tiene la informacion del peer
 * y la answer seria invida o vacia.
 */
void on_offer_set(GstPromise* promise, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);

  // Verificar el resultado del set-remote-description
  GstPromiseResult result = gst_promise_wait(promise);
  printf("[WebRTC] on_offer_set para %s: result=%d (0=pending, 1=interrupted, 2=replied, 3=expired)\n",
    peer->peerId.c_str(), (int)result);

  gst_promise_unref(promise);

  if (peer->destroyed) return;

  if (result == GST_PROMISE_RESULT_INTERRUPTED) {
    fprintf(stderr, "[WebRTC] set-remote-description fue interrumpido para %s\n",
      peer->peerId.c_str());
    return;
  }

  printf("[WebRTC] Remote description configurada para %s, creando answer...\n",
    peer->peerId.c_str());

  // Ahora si es seguro crear la answer
  GstPromise* answerPromise = gst_promise_new_with_change_func(
    on_webrtc_answer_created, peer, NULL);
  g_signal_emit_by_name(peer->webrtcbin, "create-answer", NULL, answerPromise);
}

/**
 * Callback: webrtcbin ha generado un ICE candidate.
 *
 * Los ICE candidates son las direcciones de red por las que el peer
 * puede recibir media (IP:puerto). Hay tres tipos:
 * - host: IP local directa (la mas rapida, funciona en LAN)
 * - srflx: IP publica descubierta via STUN (para NAT traversal)
 * - relay: IP del servidor TURN (ultimo recurso, anade latencia)
 *
 * En modo Local Studio (LAN), los candidates host son suficientes.
 * Reenviamos cada candidate al movil via senalizacion.
 */
void on_webrtc_ice_candidate(
  GstElement* /*webrtcbin*/, guint mlineindex, gchar* candidate, gpointer user_data)
{
  WebRTCPeer* peer = static_cast<WebRTCPeer*>(user_data);
  if (peer->destroyed) return;

  printf("[WebRTC] ICE candidate local para %s: mline=%u %s\n",
    peer->peerId.c_str(), mlineindex, candidate);

  std::string candidateStr(candidate);
  guint idx = mlineindex;

  peer->onIceCandidateTsfn.BlockingCall(
    [candidateStr, idx](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object candidateObj = Napi::Object::New(env);
      candidateObj.Set("candidate", Napi::String::New(env, candidateStr));
      candidateObj.Set("sdpMLineIndex", Napi::Number::New(env, idx));
      jsCallback.Call({ candidateObj });
    }
  );
}
