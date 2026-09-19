import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { localStarMapPlugin } from './scripts/catalog/map-server.mjs';
export default defineConfig({
  plugins: [localStarMapPlugin(fileURLToPath(new URL('../.catalog-research/athyg-4.0/map-v1/', import.meta.url))), {
    name: 'ship-third-party-notices',
    generateBundle() {
      this.emitFile({
        type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md',
        source: readFileSync(new URL('./THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'),
      });
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    // Three.js and its loaders form one shared vendor runtime (~578 kB minified
    // with Vite 8/Rolldown). App code stays below this measured budget.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        visualLab: fileURLToPath(new URL('./visual-lab.html', import.meta.url)),
        environments: fileURLToPath(new URL('./environments.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (normalizedId.includes('/node_modules/three/examples/')) return 'three-addons';
          if (normalizedId.includes('/node_modules/three/')) return 'three-core';
          if (normalizedId.includes('/node_modules/@supabase/')) return 'supabase';
          if (normalizedId.includes('/node_modules/gsap/')) return 'animation';
          if (normalizedId.includes('/node_modules/cannon-es/')) return 'physics';
          if (normalizedId.includes('/node_modules/howler/')) return 'audio';
          if (
            normalizedId.includes('/node_modules/socket.io-') ||
            normalizedId.includes('/node_modules/engine.io-') ||
            normalizedId.includes('/node_modules/@socket.io/')
          ) return 'realtime';
        }
      }
    }
  }
});
