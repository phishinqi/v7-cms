/**
 * The proxy backend, from the editor's side.
 *
 * Speaks to `@v7-cms/proxy` over HTTP. It exists for browsers without the File System Access API —
 * Firefox and Safari — where the author runs a small local process instead of picking a folder.
 */
import {
  ConflictError,
  NotFoundError,
  type DirEntry,
  type FileContents,
  type MediaRef,
  type MediaStore,
  type StorageAdapter,
  type WriteOptions,
  type WriteResult,
} from '@v7-cms/core/storage';

export interface ProxyAdapterOptions {
  /** Base URL of the proxy, e.g. `http://127.0.0.1:5177`. */
  url: string;
  /** Token the proxy printed when it started. */
  token: string;
  fetch?: typeof globalThis.fetch;
}

interface FilePayload {
  text?: string;
  base64?: string;
  size?: number;
}

export class ProxyAdapter implements StorageAdapter {
  readonly kind = 'proxy' as const;
  private url: string;
  private token: string;
  private request: typeof globalThis.fetch;
  /** Content revision per path, so a write can detect an outside change. */
  private seen = new Map<string, number>();

  constructor(options: ProxyAdapterOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
    // Detached `fetch` loses its receiver and the browser rejects it as an illegal invocation.
    const base = options.fetch ?? globalThis.fetch;
    this.request = base === globalThis.fetch ? base.bind(globalThis) : base;
  }

  async init(): Promise<void> {
    // `/api/health` is deliberately token-free so a wrong token stays diagnosable, which means it
    // cannot be what verifies the token. A real call does: it fails now rather than on first save.
    const response = await this.call('/api/v1', {
      method: 'POST',
      body: JSON.stringify({ action: 'info' }),
    });
    if (response.status === 401) throw new Error('The proxy rejected the token.');
    if (!response.ok) throw new Error(`The proxy at ${this.url} did not answer.`);
  }

  /** Which folder the proxy is serving, so the editor can check it is the right one. */
  async describe(): Promise<{ repo: string }> {
    const response = await this.call('/api/health');
    if (!response.ok) throw new Error(`The proxy at ${this.url} did not answer.`);
    return (await response.json()) as { repo: string };
  }

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(`${this.url}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-v7-cms-token': this.token,
        ...init.headers,
      },
    });
  }

  private async action<T>(body: Record<string, unknown>): Promise<T> {
    const response = await this.call('/api/v1', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload['error'] ?? 'The proxy refused the request.'));
    return payload as T;
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const result = await this.action<{ entries: DirEntry[] }>({ action: 'listDir', path });
    return result.entries;
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.action<{ exists: boolean }>({ action: 'exists', path });
    return result.exists;
  }

  async readFile(path: string): Promise<FileContents> {
    const result = await this.action<{ file: FilePayload }>({ action: 'readFile', path }).catch(
      (error: Error) => {
        throw /Not found/.test(error.message) ? new NotFoundError(path) : error;
      },
    );
    const size = result.file.size ?? 0;
    this.seen.set(path, size);
    return { text: result.file.text ?? '', sha: String(size) };
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const result = await this.action<{ file: FilePayload }>({ action: 'readFile', path }).catch(
      (error: Error) => {
        throw /Not found/.test(error.message) ? new NotFoundError(path) : error;
      },
    );
    if (result.file.base64 === undefined) {
      return new TextEncoder().encode(result.file.text ?? '');
    }
    const binary = atob(result.file.base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async writeFile(
    path: string,
    contents: string | Uint8Array,
    _options: WriteOptions,
  ): Promise<WriteResult> {
    // The proxy has no revision to check against; conflicts surface as a refused path instead.
    const payload: Record<string, unknown> = { action: 'writeFile', path };
    if (typeof contents === 'string') payload['text'] = contents;
    else payload['base64'] = base64FromBytes(contents);

    try {
      const result = await this.action<{ result: { size: number } }>(payload);
      this.seen.set(path, result.result.size);
      return { sha: String(result.result.size) };
    } catch (error) {
      const message = (error as Error).message;
      // A permission failure is a conflict the author can act on, not a crash.
      if (/outside the repository|escapes/.test(message)) throw new ConflictError(message);
      throw error;
    }
  }

  async deleteFile(path: string, _options: WriteOptions): Promise<void> {
    void _options;
    await this.action({ action: 'deleteFile', path }).catch((error: Error) => {
      throw /Not found/.test(error.message) ? new NotFoundError(path) : error;
    });
    this.seen.delete(path);
  }

  /** A plain folder has no branches; the proxy reports one implicit branch. */
  async listBranches(): Promise<string[]> {
    return ['local'];
  }

  async createBranch(): Promise<void> {
    /* Nothing to create. */
  }

  media(): MediaStore {
    return {
      upload: async (file, options) => {
        const name = options.filename ?? file.name;
        const response = await this.call('/api/media', {
          method: 'POST',
          body: JSON.stringify({ name, base64: base64FromBytes(file.data) }),
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(String(payload['error'] ?? 'Upload refused.'));
        const path = String(payload['path']);
        return {
          path,
          url: `/${path}`,
          name,
          size: file.data.byteLength,
        } satisfies MediaRef;
      },
      list: async (folder) => {
        const response = await this.call(`/api/media?folder=${encodeURIComponent(folder)}`);
        const payload = (await response.json()) as { assets?: MediaRef[] };
        return payload.assets ?? [];
      },
      remove: async (path) => {
        await this.deleteFile(path, { message: `Delete ${path}` });
      },
    };
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
