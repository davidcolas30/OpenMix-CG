#pragma once

#include <napi.h>

#include "webrtc_peer_lifecycle.h"

void set_webrtc_peer_controls_context(const WebRtcPeerLifecycleContext& context);

Napi::Value create_webrtc_peer_control(const Napi::CallbackInfo& info);
Napi::Value set_webrtc_remote_offer_control(const Napi::CallbackInfo& info);
Napi::Value add_webrtc_remote_ice_candidate_control(const Napi::CallbackInfo& info);
Napi::Value remove_webrtc_peer_control(const Napi::CallbackInfo& info);
