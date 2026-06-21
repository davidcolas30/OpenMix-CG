#pragma once

// Conecta el estado global del addon con los contextos de cada submodulo.
// Se llama una vez durante initialize(), despues de leer las guardas de entorno.
void configure_gstreamer_addon_runtime_contexts();
