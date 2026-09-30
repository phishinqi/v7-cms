/**
 * The GitHub backend.
 *
 * Reads and writes repository contents through the REST API. Two things shape the design:
 *
 * - Every write carries the sha it was based on, so a change made elsewhere in the meantime is
 *   refused rather than silently overwritten. `ConflictError` is what the editor reacts to.
 * - Listing uses the trees API once per directory tree and caches it, instead of one request per
 *   file, because a content folder with a few hundred entries would otherwise cost a few hundred
 *   requests against a rate limit.
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
import type { TreeEntry } from './types.js';

export interface GitHubAdapterOptions {
  owner: string;
  repo: string;
  branch?: string;
  token: string;
  /** Override for GitHub Enterprise. */
  apiRoot?: string;
  /** Injected in tests so the network can be faked. */
  fetch?: typeof globalThis.fetch;
  /** Commit author. GitHub attributes the commit to the token's user without this. */
  author?: { name: string; email: string };
}

const enc = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export class GitHubAdapter implements StorageAdapter {
  readonly kind = 'github' as const;
  private readonly owner: string;
  private readonly repo: string;
  private readonly apiRoot: string;
  private readonly request: typeof globalThis.fetch;
  private token: string;
  private branch: string;
  private author?: { name: string; email: string };
  /** Path -> blob sha, filled from one tree request per branch. */
  private tree: Map<string, string> | null = null;
  private dirCache = new Map<string, DirEntry[]>();

  constructor(options: GitHubAdapterOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.branch = options.branch ?? 'main';
    this.token = options.token;
    this.apiRoot = (options.apiRoot ?? 'https://api.github.com').replace(/\/$/, '');
    // `fetch` must keep its receiver. Reading it off `globalThis` and calling it later as a bare
    // function loses the binding, and the browser throws "Illegal invocation" — which is what
    // happens the moment a real page (rather than a test with an injected stub) lists a directory.
    const base = options.fetch ?? globalThis.fetch;
    this.request = base === globalThis.fetch ? base.bind(globalThis) : base;
    this.author = options.author;
  }

  async init(): Promise<void> {
    // Fail early and clearly rather than on the first write.
    const response = await this.call(`/repos/${this.owner}/${this.repo}`);
    if (!response.ok) throw new Error(await describe(response, 'open the repository'));
  }

  /** Swap the token after a sign-in, so the same adapter can outlive a session change. */
  setToken(token: string): void {
    this.token = token;
    this.tree = null;
    this.dirCache.clear();
  }

  setBranch(branch: string): void {
    this.branch = branch;
    this.tree = null;
    this.dirCache.clear();
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(`${this.apiRoot}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  }

  /**
   * One request for the whole branch, then everything is served from it. Cleared on every write,
   * so a stale listing is never shown after a change.
   */
  private async loadTree(): Promise<Map<string, string>> {
    if (this.tree) return this.tree;
    const response = await this.call(
      `/repos/${this.owner}/${this.repo}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`,
    );
    if (response.status === 404) throw new NotFoundError(`branch ${this.branch}`);
    if (!response.ok) throw new Error(await describe(response, 'list the repository'));
    const body = (await response.json()) as { tree?: TreeEntry[] };
    const map = new Map<string, string>();
    for (const entry of body.tree ?? []) if (entry.type === 'blob') map.set(entry.path, entry.sha);
    this.tree = map;
    return map;
  }

  private forget(): void {
    this.tree = null;
    this.dirCache.clear();
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const cached = this.dirCache.get(path);
    if (cached) return cached;
    const tree = await this.loadTree();
    const prefix = path ? `${path.replace(/\/+$/, '')}/` : '';
    const seen = new Map<string, DirEntry>();
    for (const [filePath, sha] of tree) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) seen.set(rest, { name: rest, type: 'file', sha });
      else {
        const dir = rest.slice(0, slash);
        if (!seen.has(dir)) seen.set(dir, { name: dir, type: 'dir' });
      }
    }
    const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    this.dirCache.set(path, entries);
    return entries;
  }

  async exists(path: string): Promise<boolean> {
    return (await this.loadTree()).has(path);
  }

  async readFile(path: string): Promise<FileContents> {
    const response = await this.call(
      `/repos/${this.owner}/${this.repo}/contents/${enc(path)}?ref=${encodeURIComponent(this.branch)}`,
    );
    if (response.status === 404) throw new NotFoundError(path);
    if (!response.ok) throw new Error(await describe(response, `read ${path}`));
    const body = (await response.json()) as { content?: string; sha: string; encoding?: string };
    if (body.encoding !== 'base64' || typeof body.content !== 'string') {
      throw new Error(`${path} is not a file this editor can read.`);
    }
    return { text: decodeBase64(body.content), sha: body.sha };
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const response = await this.call(
      `/repos/${this.owner}/${this.repo}/contents/${enc(path)}?ref=${encodeURIComponent(this.branch)}`,
    );
    if (response.status === 404) throw new NotFoundError(path);
    if (!response.ok) throw new Error(await describe(response, `read ${path}`));
    const body = (await response.json()) as { content?: string };
    // Straight from base64 to bytes. Going via a string would corrupt every byte above 0x7F.
    return toBytes(body.content ?? '');
  }

  async writeFile(
    path: string,
    contents: string | Uint8Array,
    options: WriteOptions,
  ): Promise<WriteResult> {
    const branch = options.branch ?? this.branch;
    const message = options.message;

    // If the caller told us which revision it read, check it before writing. GitHub would also
    // refuse a stale sha, but checking here produces a clearer error and avoids a wasted request.
    if (options.sha !== undefined) {
      const current = await this.currentSha(path, branch);
      if (current !== options.sha) {
        throw new ConflictError(`"${path}" changed since it was read.`);
      }
    }

    const body: Record<string, unknown> = {
      message,
      branch,
      content: typeof contents === 'string' ? encodeBase64(contents) : encodeBase64Bytes(contents),
      ...(options.sha === undefined ? {} : { sha: options.sha }),
      ...(this.author ? { author: this.author, committer: this.author } : {}),
    };

    const response = await this.call(`/repos/${this.owner}/${this.repo}/contents/${enc(path)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (response.status === 409 || response.status === 422) {
      throw new ConflictError(`"${path}" changed since it was read.`);
    }
    if (!response.ok) throw new Error(await describe(response, `save ${path}`));

    const result = (await response.json()) as {
      content?: { sha?: string };
      commit?: { sha?: string };
    };
    this.forget();
    return {
      ...(result.content?.sha ? { sha: result.content.sha } : {}),
      ...(result.commit?.sha ? { commit: result.commit.sha } : {}),
    };
  }

  private async currentSha(path: string, branch: string): Promise<string | undefined> {
    if (branch === this.branch) {
      const tree = await this.loadTree();
      return tree.get(path);
    }
    const response = await this.call(
      `/repos/${this.owner}/${this.repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`,
    );
    if (response.status === 404) return undefined;
    if (!response.ok) return undefined;
    return ((await response.json()) as { sha?: string }).sha;
  }

  async deleteFile(path: string, options: WriteOptions): Promise<void> {
    const sha = options.sha ?? (await this.currentSha(path, options.branch ?? this.branch));
    if (!sha) throw new NotFoundError(path);
    const response = await this.call(`/repos/${this.owner}/${this.repo}/contents/${enc(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message: options.message,
        sha,
        branch: options.branch ?? this.branch,
        ...(this.author ? { author: this.author, committer: this.author } : {}),
      }),
    });
    if (response.status === 404) throw new NotFoundError(path);
    if (response.status === 409 || response.status === 422) {
      throw new ConflictError(`"${path}" changed since it was read.`);
    }
    if (!response.ok) throw new Error(await describe(response, `delete ${path}`));
    this.forget();
  }

  async listBranches(): Promise<string[]> {
    const response = await this.call(`/repos/${this.owner}/${this.repo}/branches?per_page=100`);
    if (!response.ok) throw new Error(await describe(response, 'list branches'));
    return ((await response.json()) as Array<{ name: string }>).map((branch) => branch.name);
  }

  async createBranch(name: string, from: string): Promise<void> {
    const ref = await this.call(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(from)}`,
    );
    if (!ref.ok) throw new Error(await describe(ref, `find branch ${from}`));
    const { object } = (await ref.json()) as { object: { sha: string } };
    const created = await this.call(`/repos/${this.owner}/${this.repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha: object.sha }),
    });
    // Already there is not a failure: creating a draft branch twice should be idempotent.
    if (!created.ok && created.status !== 422) {
      throw new Error(await describe(created, `create branch ${name}`));
    }
  }

  /** Media lives in the repository for this backend, so it reuses the same writes. */
  media(): MediaStore {
    return {
      upload: async (file, options) => {
        const path = `${options.folder.replace(/\/+$/, '')}/${options.filename ?? file.name}`;
        const result = await this.writeFile(path, file.data, { message: `Upload ${file.name}` });
        return {
          path,
          url: `/${path}`,
          size: file.data.byteLength,
          name: file.name,
          ...(result.sha ? { sha: result.sha } : {}),
        } as MediaRef & { sha?: string };
      },
      list: async (folder) =>
        (await this.listDir(folder))
          .filter((entry) => entry.type === 'file')
          .map((entry) => ({
            path: `${folder}/${entry.name}`,
            url: `/${folder}/${entry.name}`,
            name: entry.name,
          })),
      remove: async (path) => {
        await this.deleteFile(path, { message: `Delete ${path}` });
      },
    };
  }
}

/** GitHub returns contents base64-encoded with newlines; atob needs them gone, and UTF-8 decoded. */
function decodeBase64(value: string): string {
  return new TextDecoder().decode(toBytes(value));
}

function toBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** UTF-8 safe: btoa fails on any code point above U+00FF, which includes every CJK character. */
function encodeBase64(value: string): string {
  return encodeBase64Bytes(new TextEncoder().encode(value));
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Turn an API error into something worth showing, including GitHub's own message. */
async function describe(response: Response, action: string): Promise<string> {
  if (response.status === 401) return `GitHub rejected the token while trying to ${action}.`;
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    return remaining === '0'
      ? `The GitHub rate limit was reached while trying to ${action}. Try again later.`
      : `The token is not allowed to ${action}.`;
  }
  if (response.status === 404) return `GitHub could not find what was needed to ${action}.`;
  let detail = '';
  try {
    detail = ((await response.json()) as { message?: string }).message ?? '';
  } catch {
    /* A body is not guaranteed. */
  }
  return `Could not ${action}: GitHub returned ${response.status}${detail ? ` (${detail})` : ''}.`;
}
