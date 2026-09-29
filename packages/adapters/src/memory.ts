/**
 * An in-memory backend. It exists so the editor and its tests can run a complete editing flow
 * without a network or a filesystem, and it doubles as the reference implementation of the
 * storage contract: every other adapter must behave the way this one does.
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

type Files = Map<string, { text: string; sha: string; binary?: Uint8Array }>;

const normalise = (path: string) => path.replace(/^\/+/, '').replace(/\/+$/, '');

/** A stable hash stand-in: conflicts only need equality, not cryptographic strength. */
function hash(text: string): string {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) | 0;
  }
  return `sha-${(value >>> 0).toString(16)}`;
}

export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory' as const;
  private files: Files;
  private branches: Map<string, Files>;
  private current: string;
  private commits: Array<{ message: string; path: string; branch: string }> = [];
  private mediaFiles = new Map<string, { ref: MediaRef; data: Uint8Array }>();

  constructor(initial: Record<string, string> = {}, branch = 'main') {
    this.files = new Map(
      Object.entries(initial).map(([path, text]) => [normalise(path), { text, sha: hash(text) }]),
    );
    this.current = branch;
    this.branches = new Map([[branch, this.files]]);
  }

  async init(): Promise<void> {
    /* Nothing to set up. */
  }

  /** The files this adapter holds, for assertions in tests. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].map(([path, file]) => [path, file.text]));
  }

  /** The commit log, so tests can assert on write messages. */
  log(): Array<{ message: string; path: string; branch: string }> {
    return [...this.commits];
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const prefix = path ? `${normalise(path)}/` : '';
    const seen = new Map<string, DirEntry>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        seen.set(rest, {
          name: rest,
          type: 'file',
          sha: this.files.get(key)!.sha,
        });
      } else {
        const dir = rest.slice(0, slash);
        seen.set(dir, { name: dir, type: 'dir' });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(path: string): Promise<FileContents> {
    const file = this.files.get(normalise(path));
    if (!file) throw new NotFoundError(path);
    return { text: file.text, sha: file.sha };
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const file = this.files.get(normalise(path));
    if (!file) throw new NotFoundError(path);
    return file.binary ?? new TextEncoder().encode(file.text);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(normalise(path));
  }

  async writeFile(
    path: string,
    contents: string | Uint8Array,
    options: WriteOptions,
  ): Promise<WriteResult> {
    const key = normalise(path);
    const existing = this.files.get(key);
    if (options.sha !== undefined && existing && existing.sha !== options.sha) {
      throw new ConflictError(`"${key}" changed since it was read.`);
    }
    if (options.sha !== undefined && !existing) {
      throw new ConflictError(`"${key}" no longer exists.`);
    }
    const text = typeof contents === 'string' ? contents : new TextDecoder().decode(contents);
    const sha = hash(text);
    this.files.set(key, {
      text,
      sha,
      ...(typeof contents === 'string' ? {} : { binary: contents }),
    });
    this.commits.push({
      message: options.message,
      path: key,
      branch: this.current,
    });
    return { sha };
  }

  async deleteFile(path: string, options: WriteOptions): Promise<void> {
    const key = normalise(path);
    if (!this.files.has(key)) throw new NotFoundError(path);
    this.files.delete(key);
    this.commits.push({
      message: options.message,
      path: key,
      branch: this.current,
    });
  }

  async listBranches(): Promise<string[]> {
    return [...this.branches.keys()];
  }

  async createBranch(name: string, from: string): Promise<void> {
    const source = this.branches.get(from);
    if (!source) throw new NotFoundError(from);
    if (this.branches.has(name)) return;
    this.branches.set(name, new Map(source));
  }

  media(): MediaStore {
    return {
      upload: async (file, options) => {
        const name = options.filename ?? file.name;
        const path = `${normalise(options.folder)}/${name}`;
        const ref: MediaRef = {
          path,
          url: `/${path}`,
          size: file.data.byteLength,
          name,
        };
        this.mediaFiles.set(path, { ref, data: file.data });
        return ref;
      },
      list: async (folder) => {
        const prefix = `${normalise(folder)}/`;
        return [...this.mediaFiles.values()]
          .filter((entry) => entry.ref.path.startsWith(prefix))
          .map((entry) => entry.ref);
      },
      remove: async (path) => {
        this.mediaFiles.delete(normalise(path));
      },
    };
  }
}
