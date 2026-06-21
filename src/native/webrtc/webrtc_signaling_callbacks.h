#pragma once

#include <gst/gst.h>

/**
 * Callbacks de senalizacion de webrtcbin.
 *
 * Este modulo solo cruza el plano de control SDP/ICE entre GStreamer y
 * JavaScript. No toca buffers de video ni audio, por eso puede vivir separado
 * de la construccion de ramas de media.
 */
void on_offer_set(GstPromise* promise, gpointer user_data);
void on_webrtc_answer_created(GstPromise* promise, gpointer user_data);
void on_webrtc_ice_candidate(
  GstElement* webrtcbin,
  guint mlineindex,
  gchar* candidate,
  gpointer user_data);
