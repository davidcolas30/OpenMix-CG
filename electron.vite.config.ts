import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        /**
         * Marcar el addon nativo (.node) como externo.
         *
         * Los archivos .node son binarios compilados que Node.js carga
         * con dlopen() — no pueden (ni deben) ser procesados por Vite/Rollup.
         * Al marcarlos como external, el bundler los deja como require() sin modificar.
         */
        external: [/\.node$/]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
