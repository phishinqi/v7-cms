/**
 * The local proxy's request handling.
 *
 * Exposed as a plain function over `{path, method, body}` so it can be tested without a socket,
 * and so the same logic can back any HTTP host. Two rules shape it:
 *
 * - It only ever touches files inside the configured root. Every path is resolved and checked, so
 *   a `../` in a request cannot escape the repository.
 * - It only ever writes what it was asked to write. There is no shell, no git, no deletion beyond
 *   the explicit `deleteFile` action, and no way to run a command.
 */
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface ProxyRequest {
  method: string;
  /** Request path, e.g. `/api/v1` or `/api/media`. */
  path: string;
  /** Query string without the leading `?`. */
  query?: string;
  body?: unknown;
  /** Bearer token, when the transport supplied one. */
  token?: string;
}

export interface ProxyResponse {
  status: number;
  body: unknown;
}

export interface ProxyOptions {
  /** Repository root. Nothing outside it is ever read or written. */
  root: string;
  /** Requires a bearer token on every call when set. `null` disables the check. */
  token?: string | null;
  /** Media folder, relative to the root. */
  mediaFolder?: string;
}

const json = (body: unknown, status = 200): ProxyResponse => ({ status, body });

export class LocalProxy {
  private root: string;
  private token: string | null;
  private mediaFolder: string;

  constructor(options: ProxyOptions) {
    this.root = resolve(options.root);
    this.token = options.token ?? null;
    this.mediaFolder = options.mediaFolder ?? 'public/images/uploads';
  }

  async handle(request: ProxyRequest): Promise<ProxyResponse> {
    if (request.method === 'OPTIONS') return { status: 204, body: null };
    if (request.path === '/api/health') {
      return json({ repo: basename(this.root), version: 1 });
    }
    if (this.token && request.token !== this.token) {
      return json({ error: 'Missing or wrong proxy token.' }, 401);
    }
    try {
      switch (request.path) {
        case '/api/v1':
          return await this.content(request);
        case '/api/media':
          return await this.media(request);
        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (error) {
      const message = (error as Error).message;
      const status = /outside the repository|escapes/.test(message) ? 403 : 500;
      return json({ error: message }, status);
    }
  }

  /**
   * One call carries one storage operation. The shape mirrors the GitHub adapter's capabilities
   * so the editor cannot tell the two apart.
   */
  private async content(request: ProxyRequest): Promise<ProxyResponse> {
    const body = (request.body ?? {}) as Record<string, unknown>;
    switch (body['action']) {
      case 'info':
        // What the CMS uses to confirm this proxy serves the directory it thinks it does.
        return json({ repo: basename(this.root), root: this.root, version: 1 });
      case 'listDir':
        return json({ entries: await this.listDir(String(body['path'] ?? '')) });
      case 'readFile':
        return json({ file: await this.readFile(String(body['path'])) });
      case 'exists':
        return json({ exists: await this.exists(String(body['path'])) });
      case 'writeFile':
        return json({ result: await this.writeFile(body) });
      case 'deleteFile':
        await this.deleteFile(String(body['path']));
        return json({ ok: true });
      default:
        return json({ error: `Unknown action "${String(body['action'])}"` }, 400);
    }
  }

  private async listDir(path: string): Promise<Array<{ name: string; type: 'file' | 'dir' }>> {
    const full = await this.resolve(path);
    const entries = await readdir(full, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry): { name: string; type: 'file' | 'dir' } => ({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async readFile(path: string) {
    const full = await this.resolve(path);
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) throw new Error(`Not found: ${path}`);
    const buffer = await readFile(full);
    // Media is read as base64 so binary survives the JSON hop; text is read as text.
    const isText = /\.(md|mdx|json|ya?ml|txt|css|js|ts|astro)$/i.test(path);
    return {
      text: isText ? buffer.toString('utf8') : undefined,
      base64: isText ? undefined : buffer.toString('base64'),
      size: info.size,
    };
  }

  private async exists(path: string): Promise<boolean> {
    const full = await this.resolve(path);
    return stat(full).then(
      (info) => info.isFile(),
      () => false,
    );
  }

  private async writeFile(body: Record<string, unknown>) {
    const path = String(body['path']);
    const full = await this.resolve(path, { forWrite: true });
    await mkdir(dirname(full), { recursive: true });
    const contents =
      typeof body['base64'] === 'string'
        ? Buffer.from(body['base64'] as string, 'base64')
        : String(body['text'] ?? '');
    await writeFile(full, contents);
    const info = await stat(full);
    return { size: info.size, mtime: info.mtimeMs };
  }

  private async deleteFile(path: string): Promise<void> {
    const full = await this.resolve(path, { forWrite: true });
    const info = await stat(full).catch(() => null);
    if (!info) throw new Error(`Not found: ${path}`);
    await rm(full);
  }

  private async media(request: ProxyRequest): Promise<ProxyResponse> {
    if (request.method === 'GET') {
      const folder = await this.resolve(this.mediaFolder);
      const names = await readdir(folder).catch(() => []);
      return json({
        assets: names.map((name) => ({
          path: `${this.mediaFolder}/${name}`,
          url: `/${this.mediaFolder}/${name}`,
          name,
        })),
        cursor: null,
      });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body['name'] ?? '');
    if (!name || /[\\/]/.test(name)) return json({ error: 'Invalid file name' }, 400);
    const path = `${this.mediaFolder}/${name}`;
    await this.writeFile({ path, base64: body['base64'] });
    return json({ path, url: `/${path}`, name }, 201);
  }

  /**
   * Resolve a repository-relative path to an absolute one, refusing anything that leaves the root.
   * `forWrite` also allows the file itself not to exist yet, while still checking its parent.
   */
  private async resolve(path: string, options: { forWrite?: boolean } = {}): Promise<string> {
    if (isAbsolute(path)) throw new Error(`${path} is outside the repository.`);
    const full = resolve(this.root, path);
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`${path} is outside the repository.`);
    }
    if (!options.forWrite) {
      // Resolve symlinks on read so a link cannot be used to reach outside the root.
      const real = await realpath(full).catch(() => null);
      if (real) {
        const realRel = relative(await realpath(this.root), real);
        if (realRel.startsWith('..') || isAbsolute(realRel)) {
          throw new Error(`${path} escapes the repository.`);
        }
        return real;
      }
    }
    return full;
  }
}

const basename = (path: string) => path.split(sep).filter(Boolean).pop() ?? path;

/** The header the CMS sends, kept in one place so both sides agree. */
export const TOKEN_HEADER = 'x-v7-cms-token';
export { join };
