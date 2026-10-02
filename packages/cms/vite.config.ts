import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// The editor is published as a single ES module plus a stylesheet, so a site can load it from a
// CDN without adopting this repo's toolchain.
export default defineConfig({
  plugins: [react()],
  // Library mode does not replace `process.env` the way an app build does, and a React dependency
  // references it. Without this the bundle throws "process is not defined" in a browser.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.tsx'),
      formats: ['es'],
      fileName: () => 'v7-cms.js',
    },
    // A fixed stylesheet name: the editor injects a link to it, and a hashed name would have to
    // be discovered at runtime, which does not survive being loaded as a plain module.
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    // Everything is bundled. The host page loads this with a plain `<script type="module">` and
    // resolves no bare specifiers of its own, so React has to travel with it. The diagram engines
    // are the exception, and they are fetched at runtime by src/preview/renderers.ts rather than
    // imported here.
    rollupOptions: {
      external: [],
      output: { inlineDynamicImports: true },
    },
    sourcemap: true,
  },
});
