#include "webrtc_peer_controls.h"

namespace {

WebRtcPeerLifecycleContext g_context;

} // namespace

void set_webrtc_peer_controls_context(const WebRtcPeerLifecycleContext& context)
{
  g_context = context;
}

Napi::Value create_webrtc_peer_control(const Napi::CallbackInfo& info)
{
  return create_webrtc_peer(info, g_context);
}

Napi::Value set_webrtc_remote_offer_control(const Napi::CallbackInfo& info)
{
  return set_webrtc_remote_offer(info, g_context);
}

Napi::Value add_webrtc_remote_ice_candidate_control(const Napi::CallbackInfo& info)
{
  return add_webrtc_remote_ice_candidate(info, g_context);
}

Napi::Value remove_webrtc_peer_control(const Napi::CallbackInfo& info)
{
  return remove_webrtc_peer(info, g_context);
}
