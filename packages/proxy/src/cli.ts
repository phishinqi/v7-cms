#!/usr/bin/env node
/**
 * Starts the local proxy and prints what the editor needs to connect to it.
 *
 *   v7-cms-proxy --root . --port 5177
 *
 * The token is printed so it can be pasted into the editor once, and is per-run: restarting the
 * proxy invalidates it, which is the right default for something that can write files.
 */
import { resolve } from 'node:path';
import { startProxy } from './http.js';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(token, next);
      index += 1;
    } else {
      args.set(token, true);
    }
  }

  if (args.has('--help') || args.has('-h')) {
    process.stdout.write(
      [
        'v7-cms local proxy',
        '',
        'Usage: v7-cms-proxy [--root <dir>] [--port <n>] [--host <addr>] [--token <token>]',
        '',
        '  --root   Repository root the editor may read and write. Default: the current directory.',
        '  --port   Port to listen on. Default: 5177.',
        '  --host   Interface to bind. Default: 127.0.0.1. Do not expose this to a network.',
        '  --token  Fixed token. Default: a new one each run.',
        '',
      ].join('\n'),
    );
    return;
  }

  const root = resolve(
    typeof args.get('--root') === 'string' ? (args.get('--root') as string) : '.',
  );
  const port = Number(typeof args.get('--port') === 'string' ? args.get('--port') : 5177);
  const host =
    typeof args.get('--host') === 'string' ? (args.get('--host') as string) : '127.0.0.1';
  const token =
    typeof args.get('--token') === 'string' ? (args.get('--token') as string) : undefined;

  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    process.stderr.write(
      `Refusing to bind ${host}: this proxy can write files and must stay on loopback.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const proxy = await startProxy({ root, port, host, ...(token ? { token } : {}) });
  process.stdout.write(
    [
      '',
      `v7-cms local proxy listening on ${proxy.url}`,
      `  root:  ${root}`,
      `  token: ${proxy.token}`,
      '',
      'Paste the URL and token into the editor. Press Ctrl+C to stop.',
      '',
    ].join('\n'),
  );

  const stop = () => {
    void proxy.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Only run when invoked directly, so tests can import `main` without starting a server.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)
) {
  await main();
}
