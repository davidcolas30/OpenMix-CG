#include "webrtc_pli_reserve.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <thread>

namespace {

/*
 * Timer PLI deshabilitado:
 *
 * Durante la optimizacion de WebRTC se comprobo que enviar RTCP PLI cada dos
 * segundos empeoraba la imagen al forzar keyframes cuando la estimacion de
 * ancho de banda del navegador aun estaba calentando. El mecanismo operativo
 * de recuperacion vive en rtph264depay con request-keyframe=true; este hilo
 * queda como reserva bajo guarda explicita para poder reactivar pruebas sin
 * volver a tocar el ciclo de vida de peers.
 */
const int PLI_INTERVAL_SEC = 2;
std::atomic<bool> g_pliRunning{false};
std::thread g_pliThread;

void run_periodic_pli_reserve_timer()
{
  while (g_pliRunning.load()) {
    std::this_thread::sleep_for(std::chrono::seconds(PLI_INTERVAL_SEC));
    if (!g_pliRunning.load()) {
      break;
    }
    // PLI periodico deshabilitado: ver comentario de modulo arriba.
  }
}

} // namespace

void start_webrtc_pli_reserve_thread_if_needed(bool enabled)
{
  if (!enabled || g_pliRunning.load()) {
    return;
  }

  g_pliRunning = true;
  g_pliThread = std::thread(run_periodic_pli_reserve_timer);
  printf("[WebRTC] Hilo PLI arrancado en modo reserva "
         "(envio periodico deshabilitado, intervalo nominal=%d s)\n",
    PLI_INTERVAL_SEC);
}

bool mark_webrtc_pli_reserve_thread_should_stop_if(bool shouldStop)
{
  if (!shouldStop || !g_pliRunning.load()) {
    return false;
  }

  g_pliRunning = false;
  return true;
}

void join_webrtc_pli_reserve_thread_after_unlock()
{
  if (g_pliThread.joinable()) {
    g_pliThread.join();
    printf("[WebRTC] Hilo PLI de reserva detenido (no quedan peers)\n");
  }
}
