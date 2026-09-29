/**
 * Storage backends all look like this, so the editor never branches on which one it is talking to.
 */
export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface DirEntry {
  name: string;
  type: 'file' | 'dir';
  /** GitHub's blob sha, used for optimistic concurrency on write. */
  sha?: string;
  size?: number;
}

export interface FileContents {
  text: string;
  /** Present on backends that support conflict detection. */
  sha?: string;
}

export interface WriteOptions {
  message: string;
  /** Last-read sha. A mismatch must raise `ConflictError` rather than overwrite. */
  sha?: string;
  branch?: string;
}

export interface WriteResult {
  sha?: string;
  commit?: string;
}

export interface MediaRef {
  /** Path inside the repository, or a key in object storage. */
  path: string;
  /** URL the site can serve, e.g. `/images/uploads/foo.webp`. */
  url: string;
  width?: number;
  height?: number;
  size?: number;
  name?: string;
}

export interface MediaStore {
  upload(
    file: { data: Uint8Array; name: string; type: string },
    options: { folder: string; filename?: string },
  ): Promise<MediaRef>;
  list(folder: string): Promise<MediaRef[]>;
  remove(path: string): Promise<void>;
}

/** Raised when a write would clobber someone else's change. */
export class ConflictError extends Error {
  constructor(message = 'The file changed since it was read.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`Not found: ${path}`);
    this.name = 'NotFoundError';
  }
}

export interface StorageAdapter {
  readonly kind: 'github' | 'fs-access' | 'proxy' | 'memory';
  init(): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<FileContents>;
  readBinary(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  writeFile(
    path: string,
    contents: string | Uint8Array,
    options: WriteOptions,
  ): Promise<WriteResult>;
  deleteFile(path: string, options: WriteOptions): Promise<void>;
  listBranches(): Promise<string[]>;
  createBranch(name: string, from: string): Promise<void>;
  media(): MediaStore;
}
