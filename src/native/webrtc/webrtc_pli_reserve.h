#pragma once

void start_webrtc_pli_reserve_thread_if_needed(bool enabled);
bool mark_webrtc_pli_reserve_thread_should_stop_if(bool shouldStop);
void join_webrtc_pli_reserve_thread_after_unlock();
