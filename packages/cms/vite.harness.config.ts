/**
 * A browser harness that mounts the real editor against the memory backend, so the UI can be
 * driven and screenshotted without a network, a token or a build step for the fixture site.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Windows needs fileURLToPath here: `new URL(...).pathname` yields "/E:/…", which Vite cannot
// resolve. The workspace packages are aliased to source so the harness runs without a build.
const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: 'harness',
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    host: '127.0.0.1',
    // The workspace packages are resolved from source and live above the harness root.
    fs: { allow: [here('../../..'), here('../../../node_modules/.pnpm'), '.'] },
  },
  optimizeDeps: {
    include: ['markdown-it', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  },
  resolve: {
    alias: {
      '@v7-cms/core/serialize': here('../core/src/serialize/index.ts'),
      '@v7-cms/core/storage': here('../core/src/storage/types.ts'),
      '@v7-cms/core': here('../core/src/index.ts'),
      '@v7-cms/adapters/memory': here('../adapters/src/memory.ts'),
      '@v7-cms/cms': here('./src/index.tsx'),
    },
  },
});
