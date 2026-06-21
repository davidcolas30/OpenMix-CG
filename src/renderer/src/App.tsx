/**
 * App.tsx — Componente raíz de OpenMix-CG.
 *
 * Renderiza el layout del mezclador de vídeo con:
 * - Grid de fuentes con thumbnails en vivo
 * - Monitores Preview (PVW) y Program (PGM)
 * - Controles de corte y selección de fuente
 */

import MixerLayout from './components/MixerLayout'

function App(): React.JSX.Element {
  return <MixerLayout />
}

export default App
