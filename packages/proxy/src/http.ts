/**
 * The proxy's HTTP host.
 *
 * Bound to loopback only. This process can write files in the repository, so it must never be
 * reachable from the network — that is the whole reason it takes a token and refuses to listen on
 * anything but 127.0.0.1.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { LocalProxy, TOKEN_HEADER } from './server.js';

export interface ProxyServerOptions {
  root: string;
  port?: number;
  host?: string;
  /** Fixed token, for tests. Otherwise one is generated per run. */
  token?: string;
  /** Allows any origin. Off by default: only the configured site may call this. */
  allowedOrigins?: string[];
  mediaFolder?: string;
}

export interface RunningProxy {
  server: Server;
  port: number;
  token: string;
  url: string;
  close(): Promise<void>;
}

export async function startProxy(options: ProxyServerOptions): Promise<RunningProxy> {
  const token = options.token ?? randomBytes(24).toString('hex');
  const host = options.host ?? '127.0.0.1';
  const proxy = new LocalProxy({
    root: options.root,
    token,
    ...(options.mediaFolder ? { mediaFolder: options.mediaFolder } : {}),
  });
  const allowed = new Set(options.allowedOrigins ?? []);

  const server = createServer((request, response) => {
    void handle(request, response, proxy, allowed);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : (options.port ?? 0);

  return {
    server,
    port,
    token,
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  proxy: LocalProxy,
  allowed: Set<string>,
): Promise<void> {
  const origin = request.headers.origin;
  if (origin) {
    // A browser always sends Origin on a cross-origin call. Allow loopback by default, since that
    // is where the editor runs during development.
    const permitted =
      allowed.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
    if (!permitted) {
      response.writeHead(403, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Origin not allowed' }));
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader(
      'Access-Control-Allow-Headers',
      `Content-Type, ${TOKEN_HEADER}, Authorization`,
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  const body = await readBody(request);
  const header = request.headers[TOKEN_HEADER];
  const bearer = request.headers.authorization?.replace(/^Bearer /, '');

  const result = await proxy.handle({
    method: request.method ?? 'GET',
    path: url.pathname,
    query: url.search.replace(/^\?/, ''),
    body,
    ...(typeof header === 'string'
      ? { token: header }
      : typeof bearer === 'string'
        ? { token: bearer }
        : {}),
  });

  response.writeHead(result.status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(result.body ?? null));
}

/** Capped so a runaway request cannot exhaust memory. */
const MAX_BODY = 32 * 1024 * 1024;

function readBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'OPTIONS') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        request.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(undefined);
      }
    });
    request.on('error', () => resolve(undefined));
  });
}
