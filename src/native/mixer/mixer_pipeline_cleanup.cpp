#include "mixer_pipeline_cleanup.h"

#include "gst_utils.h"

static void clear_pad_refs(std::vector<GstPad**>& padRefs)
{
  for (GstPad** padRef : padRefs) {
    if (padRef) {
      clear_gst_pad(*padRef);
    }
  }
  padRefs.clear();
}

static void clear_element_refs(MixerPipelineCleanupRefs& refs)
{
  for (GstElement** elementRef : refs.elementRefs) {
    if (!elementRef) {
      continue;
    }

    clear_gst_element(*elementRef);
    if (elementRef == refs.multiviewOverlay && refs.multiviewOverlayState) {
      release_multiview_static_bars_cache(*refs.multiviewOverlayState);
    }
  }
  refs.elementRefs.clear();
}

void release_mixer_pipeline_gstreamer_refs(MixerPipelineCleanupRefs& refs)
{
  clear_pad_refs(refs.padRefs);
  clear_element_refs(refs);
  if (refs.pipeline) {
    clear_gst_element(*refs.pipeline);
  }
}
