/**
 * Local editing through the browser's File System Access API.
 *
 * The author picks their repository folder once, and the editor reads and writes it directly: no
 * server, no token, no commit until they choose to push. This is the nicest local mode and also
 * the least portable — only Chromium browsers implement the API — which is why the proxy exists
 * as well.
 *
 * The handle is kept in IndexedDB because it cannot be serialised anywhere else, and permission is
 * re-requested on each visit rather than assumed.
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

export interface DirectoryPickerWindow {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite';
  }): Promise<FileSystemDirectoryHandle>;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export class FileSystemAdapter implements StorageAdapter {
  readonly kind = 'fs-access' as const;
  private root: FileSystemDirectoryHandle;
  /** Media folder inside the picked directory. */
  private mediaFolder: string;
  /** Content of the last read, so a write can detect an outside change. */
  private seen = new Map<string, string>();

  constructor(root: FileSystemDirectoryHandle, options: { mediaFolder?: string } = {}) {
    this.root = root;
    this.mediaFolder = options.mediaFolder ?? 'public/images/uploads';
  }

  async init(): Promise<void> {
    // Reading the root is the cheapest way to confirm permission is still granted.
    await this.root.keys().next();
  }

  private parts(path: string): string[] {
    return path.split('/').filter(Boolean);
  }

  private async directoryFor(parts: string[], create = false): Promise<FileSystemDirectoryHandle> {
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const parts = this.parts(path);
    const name = parts.pop();
    if (!name) throw new NotFoundError(path);
    const directory = await this.directoryFor(parts, create);
    return directory.getFileHandle(name, { create });
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const directory = await this.directoryFor(this.parts(path)).catch(() => null);
    if (!directory) return [];
    const entries: DirEntry[] = [];
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith('.')) continue;
      entries.push({ name, type: handle.kind === 'directory' ? 'dir' : 'file' });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<FileContents> {
    const handle = await this.fileHandle(path).catch(() => null);
    if (!handle) throw new NotFoundError(path);
    const file = await handle.getFile();
    const text = await file.text();
    // The mtime doubles as the revision: it is what a later write checks against.
    const sha = String(file.lastModified);
    this.seen.set(path, sha);
    return { text, sha };
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const handle = await this.fileHandle(path).catch(() => null);
    if (!handle) throw new NotFoundError(path);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }

  async writeFile(
    path: string,
    contents: string | Uint8Array,
    options: WriteOptions,
  ): Promise<WriteResult> {
    // If the file changed on disk since it was read, refuse rather than clobber. This is the only
    // conflict signal the filesystem offers, and it is worth honouring: an editor that silently
    // overwrites what another process wrote is worse than one that asks.
    if (options.sha !== undefined) {
      const handle = await this.fileHandle(path).catch(() => null);
      if (handle) {
        const current = String((await handle.getFile()).lastModified);
        const original = this.seen.get(path);
        if (original !== undefined && current !== original) {
          throw new ConflictError(`"${path}" changed since it was read.`);
        }
      }
    }

    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    await writable.write(
      typeof contents === 'string' ? contents : new Blob([contents as BlobPart]),
    );
    await writable.close();

    const written = String((await handle.getFile()).lastModified);
    this.seen.set(path, written);
    return { sha: written };
  }

  async deleteFile(path: string, _options: WriteOptions): Promise<void> {
    void _options;
    const parts = this.parts(path);
    const name = parts.pop();
    if (!name) throw new NotFoundError(path);
    const directory = await this.directoryFor(parts).catch(() => null);
    if (!directory) throw new NotFoundError(path);
    await directory.removeEntry(name);
    this.seen.delete(path);
  }

  /**
   * There is no branch concept on a plain folder. Editorial workflow keeps its state in a file
   * inside the repository instead, so this reports a single implicit branch.
   */
  async listBranches(): Promise<string[]> {
    return ['local'];
  }

  async createBranch(): Promise<void> {
    /* Nothing to create: the working copy is the branch. */
  }

  media(): MediaStore {
    return {
      upload: async (file, options) => {
        const name = options.filename ?? file.name;
        const path = `${options.folder.replace(/\/+$/, '')}/${name}`;
        const result = await this.writeFile(path, file.data, { message: `Upload ${name}` });
        return {
          path,
          url: `/${path}`,
          size: file.data.byteLength,
          name,
          ...(result.sha ? { sha: result.sha } : {}),
        } as MediaRef;
      },
      list: async (folder) => {
        const entries = await this.listDir(folder);
        return entries
          .filter((entry) => entry.type === 'file')
          .map((entry) => ({
            path: `${folder}/${entry.name}`,
            url: `/${folder}/${entry.name}`,
            name: entry.name,
          }));
      },
      remove: async (path) => {
        await this.deleteFile(path, { message: `Delete ${path}` });
      },
    };
  }
}

/** Ask the author for their repository folder. Must be called from a user gesture. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open a local folder. Use the proxy instead.');
  return picker({ mode: 'readwrite' });
}

const DB_NAME = 'v7-cms';
const STORE = 'handles';

/**
 * Remember the picked folder between visits. Only the handle is stored, and the browser still
 * asks for permission again — the API requires a gesture, and it keeps the grant honest.
 */
export const handleStore = {
  async save(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, 'root');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not remember the folder.'));
    });
    db.close();
  },
  async load(): Promise<FileSystemDirectoryHandle | undefined> {
    try {
      const db = await open();
      const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get('root');
        request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
        request.onerror = () => reject(request.error ?? new Error('unavailable'));
      });
      db.close();
      return handle;
    } catch {
      return undefined;
    }
  },
  async clear(): Promise<void> {
    try {
      const db = await open();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete('root');
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    } catch {
      /* Nothing to clear. */
    }
  },
};

/** Whether the stored handle is still usable without prompting. */
export async function hasPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const query = (
    handle as unknown as {
      queryPermission?: (options: { mode: string }) => Promise<PermissionState>;
    }
  ).queryPermission;
  if (!query) return true;
  return (await query.call(handle, { mode })) === 'granted';
}

/** Ask for permission again, which needs a user gesture. */
export async function requestPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const request = (
    handle as unknown as {
      requestPermission?: (options: { mode: string }) => Promise<PermissionState>;
    }
  ).requestPermission;
  if (!request) return true;
  return (await request.call(handle, { mode })) === 'granted';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}
