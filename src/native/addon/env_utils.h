#pragma once

int parse_env_int_clamped(
  const char* envName,
  int defaultValue,
  int minValue,
  int maxValue);

bool parse_env_bool_with_default(
  const char* envName,
  bool defaultValue,
  const char* logPrefix);

bool is_stutter_isolation_enabled();

void configure_gstreamer_environment_for_electron();
