/**
 * A fake `FileSystemDirectoryHandle`.
 *
 * The real File System Access API cannot be driven in Node, so this implements the parts the
 * adapter uses — nested handles, entries, read/write, delete — over a flat path map, with an
 * explicit clock so a change made outside the editor can be simulated. That is what makes the
 * conflict path testable.
 *
 * Plain fields rather than TypeScript parameter properties: this file is loaded by Node's
 * type-stripping, which does not support them.
 */

interface Entry {
  text: string;
  mtime: number;
  binary?: Uint8Array;
}

/** The backing store, shared by every handle. Paths are repository-relative and flat. */
export class FakeStore {
  private files = new Map<string, Entry>();
  private directories = new Set<string>();
  private clock = 1000;

  constructor(files: Record<string, string> = {}) {
    for (const path of Object.keys(files)) {
      const dir = dirnameOf(path);
      if (dir) this.directories.add(dir);
    }
    for (const [path, text] of Object.entries(files)) {
      this.files.set(path, { text, mtime: this.clock });
    }
  }

  /** A handle rooted at the repository, as the directory picker returns. */
  handle(): FileSystemDirectoryHandle {
    return new FakeDirectoryHandle(this, '', 'repo') as unknown as FileSystemDirectoryHandle;
  }

  /** Write outside the adapter, as another process would. */
  externalEdit(path: string, text: string): void {
    this.clock += 10;
    this.files.set(path, { text, mtime: this.clock });
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].map(([path, file]) => [path, file.text]));
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  read(path: string): Entry | undefined {
    return this.files.get(path);
  }

  write(path: string, text: string): void {
    this.clock += 10;
    this.files.set(path, { text, mtime: this.clock });
    this.remember(path);
  }

  writeBytes(path: string, bytes: Uint8Array): void {
    this.clock += 10;
    this.files.set(path, {
      text: new TextDecoder().decode(bytes),
      mtime: this.clock,
      binary: bytes,
    });
    this.remember(path);
  }

  remove(path: string): boolean {
    return this.files.delete(path);
  }

  /** Immediate children of a prefix: file names, or the first segment of deeper paths. */
  children(prefix: string): string[] {
    const names = new Set<string>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      names.add(slash === -1 ? rest : rest.slice(0, slash));
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  /** Whether a prefix names a folder that exists, because something lives under it. */
  isDirectory(prefix: string): boolean {
    if (prefix === '') return true;
    if (this.directories.has(prefix)) return true;
    for (const path of this.files.keys()) if (path.startsWith(prefix)) return true;
    return false;
  }

  private remember(path: string): void {
    const dir = dirnameOf(path);
    if (dir) this.directories.add(dir);
  }
}

export class FakeDirectoryHandle {
  kind = 'directory' as const;
  name: string;
  private store: FakeStore;
  private prefix: string;

  constructor(store: FakeStore, prefix = '', name = 'repo') {
    this.store = store;
    this.prefix = prefix;
    this.name = name;
  }

  async *entries(): AsyncGenerator<[string, FileSystemHandle]> {
    for (const name of this.store.children(this.prefix)) {
      const path = `${this.prefix}${name}`;
      yield [
        name,
        this.store.isDirectory(`${path}/`)
          ? (new FakeDirectoryHandle(this.store, `${path}/`, name) as unknown as FileSystemHandle)
          : (new FakeFileHandle(this.store, path, name) as unknown as FileSystemHandle),
      ];
    }
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of this.store.children(this.prefix)) yield name;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const path = `${this.prefix}${name}/`;
    if (!this.store.isDirectory(path) && !options.create) {
      throw new DOMException(`Not found: ${name}`, 'NotFoundError');
    }
    return new FakeDirectoryHandle(this.store, path, name) as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const path = `${this.prefix}${name}`;
    if (!this.store.has(path)) {
      if (!options.create) throw new DOMException(`Not found: ${name}`, 'NotFoundError');
      this.store.write(path, '');
    }
    return new FakeFileHandle(this.store, path, name) as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string) {
    const path = `${this.prefix}${name}`;
    if (!this.store.remove(path)) throw new DOMException(`Not found: ${name}`, 'NotFoundError');
  }
}

export class FakeFileHandle {
  kind = 'file' as const;
  name: string;
  private store: FakeStore;
  private path: string;

  constructor(store: FakeStore, path: string, name: string) {
    this.store = store;
    this.path = path;
    this.name = name;
  }

  async getFile(): Promise<File> {
    const entry = this.store.read(this.path);
    if (!entry) throw new DOMException(`Not found: ${this.path}`, 'NotFoundError');
    const file = new File([entry.binary ?? entry.text], this.name);
    Object.defineProperty(file, 'lastModified', { value: entry.mtime });
    return file;
  }

  async createWritable() {
    const store = this.store;
    const path = this.path;
    const chunks: Array<string | Uint8Array> = [];
    return {
      async write(chunk: string | Uint8Array | Blob) {
        if (typeof chunk === 'string') chunks.push(chunk);
        else if (chunk instanceof Uint8Array) chunks.push(chunk);
        else chunks.push(new Uint8Array(await chunk.arrayBuffer()));
      },
      async close() {
        const binary = chunks.find((chunk): chunk is Uint8Array => chunk instanceof Uint8Array);
        if (binary) store.writeBytes(path, binary);
        else {
          store.write(
            path,
            chunks.find((chunk): chunk is string => typeof chunk === 'string') ?? '',
          );
        }
      },
    };
  }
}

/** `content/posts/` for `content/posts/a.md`; empty for a top-level file. */
function dirnameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash + 1);
}
