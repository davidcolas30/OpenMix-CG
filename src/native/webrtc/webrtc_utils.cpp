#include "webrtc_utils.h"

#include <cstdio>

static int parse_payload_type_prefix(const char* value)
{
  if (!value) {
    return -1;
  }

  int payloadType = 0;
  bool hasDigits = false;
  for (const char* cursor = value; *cursor != '\0'; cursor++) {
    if (*cursor == ' ' || *cursor == '\t') {
      if (hasDigits) {
        break;
      }
      continue;
    }

    if (*cursor < '0' || *cursor > '9') {
      return -1;
    }

    hasDigits = true;
    payloadType = payloadType * 10 + (*cursor - '0');
    if (payloadType > 127) {
      return -1;
    }
  }

  return hasDigits ? payloadType : -1;
}

int find_h264_payload_type_in_offer(const GstSDPMessage* sdp)
{
  if (!sdp) {
    return -1;
  }

  const guint mediaCount = gst_sdp_message_medias_len(sdp);
  for (guint mediaIndex = 0; mediaIndex < mediaCount; mediaIndex++) {
    const GstSDPMedia* media = gst_sdp_message_get_media(sdp, mediaIndex);
    if (!media || g_strcmp0(gst_sdp_media_get_media(media), "video") != 0) {
      continue;
    }

    const guint attributeCount = gst_sdp_media_attributes_len(media);
    for (guint attributeIndex = 0; attributeIndex < attributeCount; attributeIndex++) {
      const GstSDPAttribute* attribute =
        gst_sdp_media_get_attribute(media, attributeIndex);
      if (!attribute || g_strcmp0(attribute->key, "rtpmap") != 0 || !attribute->value) {
        continue;
      }

      std::string value(attribute->value);
      if (value.find("H264/90000") == std::string::npos) {
        continue;
      }

      const int payloadType = parse_payload_type_prefix(attribute->value);
      if (payloadType >= 0) {
        return payloadType;
      }
    }
  }

  return -1;
}

std::string describe_rtp_pad_caps(GstPad* pad, guint32* clockRateOut)
{
  if (clockRateOut) {
    *clockRateOut = 0;
  }
  if (!pad) {
    return "media=unknown";
  }

  GstCaps* caps = gst_pad_get_current_caps(pad);
  if (!caps) {
    caps = gst_pad_query_caps(pad, nullptr);
  }
  if (!caps || gst_caps_is_empty(caps) || gst_caps_is_any(caps)) {
    if (caps) {
      gst_caps_unref(caps);
    }
    return "media=unknown";
  }

  GstStructure* structure = gst_caps_get_structure(caps, 0);
  const gchar* media = structure ? gst_structure_get_string(structure, "media") : nullptr;
  const gchar* encoding =
    structure ? gst_structure_get_string(structure, "encoding-name") : nullptr;

  gint payload = -1;
  gint clockRate = 0;
  if (structure) {
    gst_structure_get_int(structure, "payload", &payload);
    gst_structure_get_int(structure, "clock-rate", &clockRate);
  }

  std::string label = "media=";
  label += media ? media : "unknown";
  if (encoding) {
    label += "/";
    label += encoding;
  }
  if (payload >= 0) {
    label += "/pt=";
    label += std::to_string(payload);
  }
  if (clockRate > 0) {
    label += "/clock=";
    label += std::to_string(clockRate);
    if (clockRateOut) {
      *clockRateOut = static_cast<guint32>(clockRate);
    }
  }

  gst_caps_unref(caps);
  return label;
}

void log_sdp_video_summary(const char* label, const std::string& sdp)
{
  printf("[MonitorWebRTC] %s SDP video summary:\n", label);

  size_t lineStart = 0;
  while (lineStart < sdp.size()) {
    size_t lineEnd = sdp.find('\n', lineStart);
    if (lineEnd == std::string::npos) {
      lineEnd = sdp.size();
    }

    std::string line = sdp.substr(lineStart, lineEnd - lineStart);
    if (!line.empty() && line.back() == '\r') {
      line.pop_back();
    }

    if (line.rfind("m=video", 0) == 0 ||
        line.rfind("a=rtpmap:", 0) == 0 ||
        line.rfind("a=fmtp:", 0) == 0 ||
        line == "a=sendonly" ||
        line == "a=recvonly" ||
        line == "a=sendrecv" ||
        line == "a=inactive") {
      printf("[MonitorWebRTC]   %s\n", line.c_str());
    }

    lineStart = lineEnd + 1;
  }
}

const char* webrtc_connection_state_label(GstWebRTCPeerConnectionState state)
{
  switch (state) {
    case GST_WEBRTC_PEER_CONNECTION_STATE_NEW: return "new";
    case GST_WEBRTC_PEER_CONNECTION_STATE_CONNECTING: return "connecting";
    case GST_WEBRTC_PEER_CONNECTION_STATE_CONNECTED: return "connected";
    case GST_WEBRTC_PEER_CONNECTION_STATE_DISCONNECTED: return "disconnected";
    case GST_WEBRTC_PEER_CONNECTION_STATE_FAILED: return "failed";
    case GST_WEBRTC_PEER_CONNECTION_STATE_CLOSED: return "closed";
    default: return "unknown";
  }
}

const char* webrtc_ice_state_label(GstWebRTCICEConnectionState state)
{
  switch (state) {
    case GST_WEBRTC_ICE_CONNECTION_STATE_NEW: return "new";
    case GST_WEBRTC_ICE_CONNECTION_STATE_CHECKING: return "checking";
    case GST_WEBRTC_ICE_CONNECTION_STATE_CONNECTED: return "connected";
    case GST_WEBRTC_ICE_CONNECTION_STATE_COMPLETED: return "completed";
    case GST_WEBRTC_ICE_CONNECTION_STATE_FAILED: return "failed";
    case GST_WEBRTC_ICE_CONNECTION_STATE_DISCONNECTED: return "disconnected";
    case GST_WEBRTC_ICE_CONNECTION_STATE_CLOSED: return "closed";
    default: return "unknown";
  }
}

const char* webrtc_signaling_state_label(GstWebRTCSignalingState state)
{
  switch (state) {
    case GST_WEBRTC_SIGNALING_STATE_STABLE: return "stable";
    case GST_WEBRTC_SIGNALING_STATE_CLOSED: return "closed";
    case GST_WEBRTC_SIGNALING_STATE_HAVE_LOCAL_OFFER: return "have-local-offer";
    case GST_WEBRTC_SIGNALING_STATE_HAVE_REMOTE_OFFER: return "have-remote-offer";
    case GST_WEBRTC_SIGNALING_STATE_HAVE_LOCAL_PRANSWER: return "have-local-pranswer";
    case GST_WEBRTC_SIGNALING_STATE_HAVE_REMOTE_PRANSWER: return "have-remote-pranswer";
    default: return "unknown";
  }
}
