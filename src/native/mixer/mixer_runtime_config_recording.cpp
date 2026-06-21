#include "mixer_runtime_config_internal.h"

#include "env_utils.h"
#include "mixer_runtime_config.h"
#include "mixer_runtime_config_defaults.h"
#include "recording_elements.h"

#include <cstdio>

namespace {

namespace defaults = openmix::mixer_runtime_config_defaults;

} // namespace

namespace openmix::mixer_runtime_config {

void configure_local_video_prewarm_mode()
{
  g_localVideoPrewarmEnabled = parse_env_bool_with_default(
    "OPENMIX_LOCAL_VIDEO_PREWARM",
    true,
    "LocalVideo");

  printf("[LocalVideo] Precalentamiento de ramas PGM: %s\n",
    g_localVideoPrewarmEnabled ? "on" : "off");
}

void configure_recording_audio_mode()
{
  const bool enabledByRecordingFlag = parse_env_bool_with_default(
    "OPENMIX_RECORDING_AUDIO",
    false,
    "RecordingAudio");
  const bool enabledByLegacyFlag = parse_env_bool_with_default(
    "OPENMIX_LOCAL_AUDIO",
    enabledByRecordingFlag,
    "RecordingAudio");

  g_recordingAudioEnabled = enabledByLegacyFlag;
  const int legacyDelayMs = parse_env_int_clamped(
    "OPENMIX_LOCAL_AUDIO_DELAY_MS",
    defaults::kDefaultRecordingAudioDelayMs,
    defaults::kMinRecordingAudioDelayMs,
    defaults::kMaxRecordingAudioDelayMs
  );
  g_recordingAudioDelayMs = parse_env_int_clamped(
    "OPENMIX_RECORDING_AUDIO_DELAY_MS",
    legacyDelayMs,
    defaults::kMinRecordingAudioDelayMs,
    defaults::kMaxRecordingAudioDelayMs
  );
  g_recordingAudioSourceName = resolve_recording_audio_source_name();

  printf("[RecordingAudio] REC audio local: %s source=%s delay=%dms\n",
    g_recordingAudioEnabled ? "on" : "off",
    g_recordingAudioSourceName.c_str(),
    g_recordingAudioDelayMs);
}

} // namespace openmix::mixer_runtime_config
