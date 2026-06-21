#include "gst_utils.h"

#include <cstdio>

void set_source_valve_drop(GstElement* valve, bool shouldDrop)
{
  if (!valve) {
    return;
  }

  g_object_set(valve, "drop", shouldDrop ? TRUE : FALSE, NULL);
}

void set_selector_active_pad(GstElement* selector, GstPad* pad)
{
  if (!selector || !pad) {
    return;
  }

  g_object_set(selector, "active-pad", pad, NULL);
}

GstPad* find_sink_pad_by_name(GstElement* element, const char* padName)
{
  if (!element || !padName) {
    return nullptr;
  }

  GstIterator* iterator = gst_element_iterate_sink_pads(element);
  if (!iterator) {
    return nullptr;
  }

  GstPad* foundPad = nullptr;
  GValue item = G_VALUE_INIT;
  bool done = false;
  while (!done) {
    switch (gst_iterator_next(iterator, &item)) {
      case GST_ITERATOR_OK: {
        GstPad* pad = GST_PAD(g_value_get_object(&item));
        gchar* currentName = gst_pad_get_name(pad);
        const bool matches = currentName && g_strcmp0(currentName, padName) == 0;
        g_free(currentName);
        if (matches) {
          foundPad = GST_PAD(gst_object_ref(pad));
          done = true;
        }
        g_value_reset(&item);
        break;
      }
      case GST_ITERATOR_RESYNC:
        gst_iterator_resync(iterator);
        break;
      default:
        done = true;
        break;
    }
  }

  if (G_VALUE_TYPE(&item) != 0) {
    g_value_unset(&item);
  }
  gst_iterator_free(iterator);
  return foundPad;
}

void clear_gst_element(GstElement*& element)
{
  if (!element) {
    return;
  }

  gst_object_unref(element);
  element = nullptr;
}

void clear_gst_pad(GstPad*& pad)
{
  if (!pad) {
    return;
  }

  gst_object_unref(pad);
  pad = nullptr;
}

void detach_compositor_request_pad(
  GstElement* compositor,
  GstPad** storedPad,
  const char* label)
{
  if (!compositor || !storedPad || !*storedPad) {
    return;
  }

  GstPad* pad = *storedPad;
  GstPad* peer = gst_pad_get_peer(pad);
  if (peer) {
    gst_pad_unlink(peer, pad);
    gst_object_unref(peer);
  }

  // Estos pads nacen porque la descripcion textual enlaza una rama al
  // compositor. En los modos de diagnostico/optimizacion los soltamos de
  // verdad: alpha=0 no basta si GstAggregator decide seguir calendarizando
  // una entrada muda.
  gst_element_release_request_pad(compositor, pad);
  gst_object_unref(pad);
  *storedPad = nullptr;

  printf("[Mixer] Rama %s desconectada del compositor para diagnostico\n", label);
}

void log_compositor_sink_pad_mapping_if_requested(
  GstElement* compositor,
  const char* label)
{
  const gchar* enabled = g_getenv("OPENMIX_RECORDING_PAD_MAP_LOG");
  if (!enabled ||
      (g_ascii_strcasecmp(enabled, "1") != 0 &&
       g_ascii_strcasecmp(enabled, "true") != 0 &&
       g_ascii_strcasecmp(enabled, "on") != 0)) {
    return;
  }

  if (!compositor || !label) {
    return;
  }

  GstIterator* iterator = gst_element_iterate_sink_pads(compositor);
  if (!iterator) {
    return;
  }

  printf("[Mixer] Mapa pads %s\n", label);
  GValue item = G_VALUE_INIT;
  bool done = false;
  while (!done) {
    switch (gst_iterator_next(iterator, &item)) {
      case GST_ITERATOR_OK: {
        GstPad* pad = GST_PAD(g_value_get_object(&item));
        gchar* padName = gst_pad_get_name(pad);
        GstPad* peer = gst_pad_get_peer(pad);
        gchar* peerPadName = peer ? gst_pad_get_name(peer) : nullptr;
        GstElement* peerElement = peer
          ? GST_ELEMENT(gst_pad_get_parent_element(peer))
          : nullptr;
        gchar* peerElementName = peerElement ? gst_element_get_name(peerElement) : nullptr;
        printf("[Mixer]   %s <- %s.%s\n",
          padName ? padName : "(sin-pad)",
          peerElementName ? peerElementName : "(sin-peer)",
          peerPadName ? peerPadName : "(sin-peer-pad)");
        if (peerElementName) { g_free(peerElementName); }
        if (peerElement) { gst_object_unref(peerElement); }
        if (peerPadName) { g_free(peerPadName); }
        if (peer) { gst_object_unref(peer); }
        if (padName) { g_free(padName); }
        g_value_reset(&item);
        break;
      }
      case GST_ITERATOR_RESYNC:
        gst_iterator_resync(iterator);
        break;
      default:
        done = true;
        break;
    }
  }
  if (G_VALUE_TYPE(&item) != 0) {
    g_value_unset(&item);
  }
  gst_iterator_free(iterator);
}

GstClockTime get_gst_element_running_time(
  GstElement* clockOwner,
  bool useSystemClockFallback)
{
  if (!clockOwner) {
    return 0;
  }

  GstClock* clock = gst_element_get_clock(clockOwner);
  if (!clock && useSystemClockFallback) {
    /*
     * Algunas pruebas headless sustituyen las ventanas nativas por fakesink y
     * pueden no exponer clock via gst_element_get_clock() justo al crear ramas
     * dinamicas. El base_time del pipeline sigue siendo valido, asi que usamos
     * el reloj de sistema de GStreamer como respaldo.
     */
    clock = gst_system_clock_obtain();
  }
  if (!clock) {
    return 0;
  }

  GstClockTime now = gst_clock_get_time(clock);
  GstClockTime baseTime = gst_element_get_base_time(clockOwner);
  gst_object_unref(clock);

  if (!GST_CLOCK_TIME_IS_VALID(now) ||
      !GST_CLOCK_TIME_IS_VALID(baseTime) ||
      now <= baseTime) {
    return 0;
  }

  return now - baseTime;
}

void set_compositor_sleeping(GstElement* compositor, bool shouldSleep)
{
  if (!compositor) {
    return;
  }

  if (shouldSleep) {
    gst_element_set_locked_state(compositor, TRUE);
    gst_element_set_state(compositor, GST_STATE_READY);
  } else {
    gst_element_set_locked_state(compositor, FALSE);
    gst_element_sync_state_with_parent(compositor);
  }
}

void unlock_compositor_for_shutdown(GstElement* compositor)
{
  if (!compositor) {
    return;
  }

  // Los compositores dormidos quedan con locked_state=true en READY. Antes de
  // parar o destruir el pipeline hay que desbloquearlos, porque el estado NULL
  // del padre no atraviesa elementos bloqueados.
  gst_element_set_locked_state(compositor, FALSE);
  gst_element_set_state(compositor, GST_STATE_NULL);
}

bool element_has_property(GstElement* element, const char* propertyName)
{
  return element != nullptr &&
    g_object_class_find_property(G_OBJECT_GET_CLASS(element), propertyName) != nullptr;
}

void set_int_property_if_exists(GstElement* element, const char* propertyName, int value)
{
  if (element_has_property(element, propertyName)) {
    g_object_set(element, propertyName, value, NULL);
  }
}

void set_bool_property_if_exists(GstElement* element, const char* propertyName, bool value)
{
  if (element_has_property(element, propertyName)) {
    g_object_set(element, propertyName, value ? TRUE : FALSE, NULL);
  }
}

void set_int64_property_if_exists(GstElement* element, const char* propertyName, gint64 value)
{
  if (element_has_property(element, propertyName)) {
    g_object_set(element, propertyName, value, NULL);
  }
}

void set_uint64_property_if_exists(GstElement* element, const char* propertyName, guint64 value)
{
  if (element_has_property(element, propertyName)) {
    g_object_set(element, propertyName, value, NULL);
  }
}

void set_object_arg_if_exists(GstElement* element, const char* propertyName, const char* value)
{
  if (element_has_property(element, propertyName)) {
    gst_util_set_object_arg(G_OBJECT(element), propertyName, value);
  }
}

static GParamSpec* find_object_property(GObject* object, const char* propertyName)
{
  if (!object || !propertyName) {
    return nullptr;
  }
  return g_object_class_find_property(G_OBJECT_GET_CLASS(object), propertyName);
}

std::string read_numeric_or_bool_property(GObject* object, const char* propertyName)
{
  GParamSpec* pspec = find_object_property(object, propertyName);
  if (!pspec) {
    return "n/a";
  }

  const GType valueType = G_PARAM_SPEC_VALUE_TYPE(pspec);
  if (valueType == G_TYPE_UINT) {
    guint value = 0;
    g_object_get(object, propertyName, &value, NULL);
    return std::to_string(value);
  }
  if (valueType == G_TYPE_INT || G_TYPE_IS_ENUM(valueType)) {
    gint value = 0;
    g_object_get(object, propertyName, &value, NULL);
    return std::to_string(value);
  }
  if (valueType == G_TYPE_BOOLEAN) {
    gboolean value = FALSE;
    g_object_get(object, propertyName, &value, NULL);
    return value ? "true" : "false";
  }

  return "n/a";
}

std::string read_structure_property(GObject* object, const char* propertyName)
{
  GParamSpec* pspec = find_object_property(object, propertyName);
  if (!pspec || G_PARAM_SPEC_VALUE_TYPE(pspec) != GST_TYPE_STRUCTURE) {
    return "n/a";
  }

  GstStructure* structure = nullptr;
  g_object_get(object, propertyName, &structure, NULL);
  if (!structure) {
    return "n/a";
  }

  gchar* structureText = gst_structure_to_string(structure);
  std::string result = structureText ? structureText : "n/a";
  g_free(structureText);
  gst_structure_free(structure);
  return result;
}
