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

/**
 * Who the backend is acting as, when it has a notion of that.
 *
 * Optional because it is not universal: a folder on disk has no account, and neither does the
 * in-memory backend. The editor shows an account panel only when this is present, so a local author
 * never sees a sign-out button that would do nothing.
 */
export interface AccountInfo {
  /** Login name, when the backend can report one. */
  login?: string;
  /** Display name, if it differs from the login. */
  name?: string;
  /** Avatar URL, already absolute. */
  avatar?: string;
  /** How the session was obtained, so the panel can explain what signing out drops. */
  via: 'oauth' | 'token';
  /** Repository being edited, for a backend that is bound to one. */
  repo?: RepoRef;
}

/** One file Prettier would rewrite, and where it first disagrees with the file on disk. */
export interface FormatFinding {
  path: string;
  /** 1-based line number of the first difference. */
  firstDiffLine: number;
}

export interface FormatReport {
  /** Set when the backend cannot run Prettier, so the editor can stay quiet about it. */
  unavailable?: boolean;
  findings: FormatFinding[];
}

export interface StorageAdapter {
  readonly kind: 'github' | 'fs-access' | 'proxy' | 'memory';
  init(): Promise<void>;
  /**
   * The signed-in account, or undefined when the backend has none. Called once the backend is
   * ready; a failure here must not stop the editor from opening.
   */
  account?(): Promise<AccountInfo | undefined>;
  /**
   * Whether these files match the repository's Prettier config.
   *
   * Optional, and absent from most backends: a config is a file that can import plugins, so only a
   * process with a filesystem can evaluate it. GitHub and browser-folder backends leave this off,
   * and the editor shows no formatting advice rather than inventing it.
   */
  checkFormat?(paths: string[]): Promise<FormatReport>;
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
