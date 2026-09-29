import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The editor is published as a single ES module plus a stylesheet, so a site can load it from a
// CDN without adopting this repo's toolchain.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.tsx'),
      formats: ['es'],
      fileName: () => 'v7-cms.js',
    },
    rollupOptions: {
      // React stays external: the host page provides it, and bundling a second copy would break
      // hooks.
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
});
