// Bundles the proxy into a single runnable file.
//
// Node cannot execute these TypeScript sources directly — its type stripping does not resolve
// `.js` specifiers that point at `.ts` files — so the published CLI is built rather than run from
// source. The bundle has no dependencies, which is what lets `npx @v7-cms/proxy` work.
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'dist/cli.mjs';

await build({
  entryPoints: ['src/cli.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  logLevel: 'info',
});

// The shebang has to be the first line, so it is written here rather than as an esbuild banner:
// esbuild emits its own banner above it, which makes the file unparseable.
const code = (await readFile(outfile, 'utf8')).replace(/^#![^\n]*\n/, '');
await writeFile(outfile, '#!/usr/bin/env node\n' + code);
await chmod(outfile, 0o755);
