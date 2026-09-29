import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.scratch/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Source, tests and scripts run in a browser or Node, and both sets of globals are harmless.
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
