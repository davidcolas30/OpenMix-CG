#pragma once

#include <gst/gst.h>
#include <string>

void set_source_valve_drop(GstElement* valve, bool shouldDrop);
void set_selector_active_pad(GstElement* selector, GstPad* pad);
GstPad* find_sink_pad_by_name(GstElement* element, const char* padName);
void clear_gst_element(GstElement*& element);
void clear_gst_pad(GstPad*& pad);
void detach_compositor_request_pad(
  GstElement* compositor,
  GstPad** storedPad,
  const char* label);
void log_compositor_sink_pad_mapping_if_requested(
  GstElement* compositor,
  const char* label);
GstClockTime get_gst_element_running_time(
  GstElement* clockOwner,
  bool useSystemClockFallback);
void set_compositor_sleeping(GstElement* compositor, bool shouldSleep);
void unlock_compositor_for_shutdown(GstElement* compositor);

bool element_has_property(GstElement* element, const char* propertyName);
void set_int_property_if_exists(GstElement* element, const char* propertyName, int value);
void set_bool_property_if_exists(GstElement* element, const char* propertyName, bool value);
void set_int64_property_if_exists(GstElement* element, const char* propertyName, gint64 value);
void set_uint64_property_if_exists(GstElement* element, const char* propertyName, guint64 value);
void set_object_arg_if_exists(GstElement* element, const char* propertyName, const char* value);

std::string read_numeric_or_bool_property(GObject* object, const char* propertyName);
std::string read_structure_property(GObject* object, const char* propertyName);
