#pragma once

namespace openmix::mixer_runtime_config_defaults {

inline constexpr int kNumRuntimeSources = 4;
inline constexpr int kMixerInternalWidth = 1920;
inline constexpr int kMixerInternalHeight = 1080;
inline constexpr int kDefaultGraphicsOverlayWidth = 1280;
inline constexpr int kDefaultGraphicsOverlayHeight = 720;
inline constexpr int kDefaultMonitorActiveFps = 30;
inline constexpr int kDefaultMonitorIdleFps = 5;
inline constexpr int kMinMonitorFps = 1;
inline constexpr int kMaxMonitorFps = 30;
inline constexpr int kDefaultWebrtcReceiveLatencyMs = 200;
inline constexpr int kDefaultWebrtcRtpQueueBuffers = 2048;
inline constexpr int kDefaultWebrtcRtpQueueTimeMs = 0;
inline constexpr int kDefaultSyncBufferLatencyMs = 66;
inline constexpr int kDefaultSyncBufferMaxBuffers = 8;
inline constexpr int kDefaultSyncBufferMaxTimeMs = 250;
inline constexpr int kDefaultSyncBufferNtpMaxDelayMs = 120;
inline constexpr int kDefaultSyncBufferNtpMinStepMs = 5;
inline constexpr int kDefaultSyncBufferNtpAdjustIntervalMs = 500;
inline constexpr int kDefaultSyncBufferNtpMaxStepMs = 20;
inline constexpr int kDefaultSyncBufferMinPeers = 2;
inline constexpr int kDefaultRecordingAudioDelayMs = 0;
inline constexpr int kMinRecordingAudioDelayMs = -2000;
inline constexpr int kMaxRecordingAudioDelayMs = 5000;

} // namespace openmix::mixer_runtime_config_defaults
