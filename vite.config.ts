import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    // Three.js and its loaders form one shared vendor runtime (~578 kB minified
    // with Vite 8/Rolldown). App code stays below this measured budget.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
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
