#pragma once

#include <gst/gst.h>
#include <gst/sdp/sdp.h>
#include <gst/webrtc/webrtc.h>
#include <string>

int find_h264_payload_type_in_offer(const GstSDPMessage* sdp);
std::string describe_rtp_pad_caps(GstPad* pad, guint32* clockRateOut);
void log_sdp_video_summary(const char* label, const std::string& sdp);

const char* webrtc_connection_state_label(GstWebRTCPeerConnectionState state);
const char* webrtc_ice_state_label(GstWebRTCICEConnectionState state);
const char* webrtc_signaling_state_label(GstWebRTCSignalingState state);
