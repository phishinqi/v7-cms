/**
 * A fake GitHub REST API.
 *
 * The adapter is the one place a mistake costs someone their content, so its tests exercise the
 * real request shapes rather than mocking the adapter's own methods. This speaks enough of the
 * API — trees, contents, refs, branches — to drive every path, and can be told to fail in the
 * ways GitHub actually fails.
 */
import type { TreeEntry } from './types.js';

interface StoredFile {
  text: string;
  sha: string;
  binary?: Uint8Array;
}

export interface FakeGitHubOptions {
  files?: Record<string, string>;
  branch?: string;
  /** Reject every request with this status, to exercise error handling. */
  failWith?: { status: number; message?: string };
  /** Fail only writes, leaving reads working. */
  failWritesWith?: number;
}

let shaCounter = 0;

export class FakeGitHub {
  readonly calls: Array<{ method: string; path: string; body?: unknown }> = [];
  /** Commits made, so tests can assert on messages and ordering. */
  readonly commits: Array<{ message: string; path: string; branch: string }> = [];
  private branches: Map<string, Map<string, StoredFile>>;
  private options: FakeGitHubOptions;
  private defaultBranch: string;

  constructor(options: FakeGitHubOptions = {}) {
    this.options = options;
    this.defaultBranch = options.branch ?? 'main';
    const files = new Map<string, StoredFile>();
    for (const [path, text] of Object.entries(options.files ?? {})) {
      files.set(path, { text, sha: nextSha() });
    }
    this.branches = new Map([[this.defaultBranch, files]]);
  }

  snapshot(branch?: string): Record<string, string> {
    const files = this.branches.get(branch ?? this.defaultBranch) ?? new Map();
    return Object.fromEntries([...files].map(([path, file]) => [path, file.text]));
  }

  shaOf(path: string, branch?: string): string | undefined {
    return this.branches.get(branch ?? this.defaultBranch)?.get(path)?.sha;
  }

  /** Simulates someone else committing, so conflict handling can be tested. */
  externalEdit(path: string, text: string, branch?: string): void {
    const files = this.branches.get(branch ?? this.defaultBranch)!;
    files.set(path, { text, sha: nextSha() });
  }

  branchNames(): string[] {
    return [...this.branches.keys()];
  }

  /** The fetch implementation to hand the adapter. */
  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init.method ?? 'GET';
    const path = decodeURIComponent(url.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, ''));
    let body: unknown;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    this.calls.push({ method, path, ...(body === undefined ? {} : { body }) });

    if (this.options.failWith) {
      return json(
        { message: this.options.failWith.message ?? 'failed' },
        this.options.failWith.status,
      );
    }
    if (method !== 'GET' && this.options.failWritesWith) {
      return json({ message: 'write refused' }, this.options.failWritesWith);
    }

    // GET /repos/:owner/:repo — used by init().
    if (method === 'GET' && path === '') return json({ full_name: 'owner/repo' });

    const tree = /^\/git\/trees\/([^?]+)/.exec(path);
    if (method === 'GET' && tree) {
      const branch = tree[1]!;
      const files = this.branches.get(branch);
      if (!files) return json({ message: 'Not Found' }, 404);
      const entries: TreeEntry[] = [...files].map(([filePath, file]) => ({
        path: filePath,
        type: 'blob',
        sha: file.sha,
        size: file.text.length,
      }));
      return json({ tree: entries, truncated: false });
    }

    const contents = /^\/contents\/(.+)$/.exec(path);
    if (contents && method === 'DELETE') {
      const filePath = contents[1]!;
      const payload = body as { sha?: string; branch?: string };
      const target = payload.branch ?? this.defaultBranch;
      const targetFiles = this.branches.get(target);
      if (!targetFiles) return json({ message: 'Branch not found' }, 422);
      const existing = targetFiles.get(filePath);
      if (!existing) return json({ message: 'Not Found' }, 404);
      if (payload.sha !== undefined && payload.sha !== existing.sha) {
        return json({ message: 'sha does not match' }, 409);
      }
      targetFiles.delete(filePath);
      this.commits.push({ message: 'delete', path: filePath, branch: target });
      return json({ commit: { sha: nextSha() } });
    }

    if (contents) {
      const filePath = contents[1]!;
      const ref = url.searchParams.get('ref') ?? this.defaultBranch;
      const files = this.branches.get(ref) ?? this.branches.get(this.defaultBranch)!;

      if (method === 'GET') {
        const file = files.get(filePath);
        if (!file) return json({ message: 'Not Found' }, 404);
        return json({
          content: base64(file.binary ?? new TextEncoder().encode(file.text)),
          sha: file.sha,
          encoding: 'base64',
          type: 'file',
        });
      }

      const payload = body as { message: string; content: string; sha?: string; branch?: string };
      const target = payload.branch ?? this.defaultBranch;
      const targetFiles = this.branches.get(target);
      if (!targetFiles) return json({ message: 'Branch not found' }, 422);
      const existing = targetFiles.get(filePath);

      // The real API refuses a stale sha; matching that is the point of the fake.
      if (payload.sha !== undefined && existing && existing.sha !== payload.sha) {
        return json({ message: 'sha does not match' }, 409);
      }
      if (payload.sha !== undefined && !existing) {
        return json({ message: 'sha does not match' }, 409);
      }
      if (payload.sha === undefined && existing) {
        // Creating over an existing file without its sha is also a conflict.
        return json({ message: 'sha was not supplied' }, 422);
      }

      const bytes = toBytes(payload.content);
      const sha = nextSha();
      targetFiles.set(filePath, { text: new TextDecoder().decode(bytes), sha, binary: bytes });
      this.commits.push({ message: payload.message, path: filePath, branch: target });
      return json({ content: { sha }, commit: { sha: nextSha() } });
    }

    if (method === 'GET' && path === '/branches') {
      return json([...this.branches.keys()].map((name) => ({ name })));
    }

    const ref = /^\/git\/ref\/heads\/(.+)$/.exec(path);
    if (method === 'GET' && ref) {
      const branch = ref[1]!;
      const files = this.branches.get(branch);
      if (!files) return json({ message: 'Not Found' }, 404);
      return json({ object: { sha: `commit-${branch}` } });
    }

    if (method === 'POST' && path === '/git/refs') {
      const payload = body as { ref: string; sha: string };
      const name = payload.ref.replace('refs/heads/', '');
      if (this.branches.has(name)) return json({ message: 'Reference already exists' }, 422);
      const source = [...this.branches.entries()].find(
        ([, files]) =>
          files.size &&
          `commit-${[...this.branches.keys()].find((b) => this.branches.get(b) === files)}` ===
            payload.sha,
      );
      void source;
      // Branches copy the default branch's contents, which is what the adapter relies on.
      this.branches.set(name, new Map(this.branches.get(this.defaultBranch)!));
      return json({ ref: payload.ref, object: { sha: payload.sha } });
    }

    return json({ message: `Unhandled ${method} ${path}` }, 404);
  };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const nextSha = () => `sha${(shaCounter += 1).toString(16)}`;

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
