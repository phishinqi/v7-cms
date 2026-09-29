/**
 * The behaviour every storage backend must share. Each adapter runs this same suite, so a new
 * backend is only correct once it passes the same tests as the in-memory reference.
 */
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '@v7-cms/core/storage';
import type { StorageAdapter } from '@v7-cms/core/storage';
import { MemoryAdapter } from '../src/memory.js';

export function describeStorageAdapter(name: string, create: () => Promise<StorageAdapter>) {
  describe(`${name} adapter`, () => {
    const withFiles = async (
      files: Record<string, string> = {
        'content/a.md': 'one',
        'content/nested/b.md': 'two',
      },
    ) => {
      if (create instanceof Function && name === 'memory') {
        return new MemoryAdapter(files);
      }
      const adapter = await create();
      for (const [path, text] of Object.entries(files)) {
        await adapter.writeFile(path, text, { message: 'seed' });
      }
      return adapter;
    };

    it('lists files and directories in one level', async () => {
      const adapter = await withFiles();
      const entries = await adapter.listDir('content');
      expect(entries).toEqual([
        { name: 'a.md', type: 'file', sha: expect.any(String) },
        { name: 'nested', type: 'dir' },
      ]);
    });

    it('reads a file with its sha', async () => {
      const adapter = await withFiles();
      const file = await adapter.readFile('content/a.md');
      expect(file.text).toBe('one');
      expect(file.sha).toBeTruthy();
    });

    it('raises NotFound for a missing file', async () => {
      const adapter = await withFiles();
      await expect(adapter.readFile('content/nope.md')).rejects.toBeInstanceOf(NotFoundError);
      expect(await adapter.exists('content/nope.md')).toBe(false);
    });

    it('writes a new file', async () => {
      const adapter = await withFiles();
      await adapter.writeFile('content/new.md', 'hello', { message: 'add' });
      expect((await adapter.readFile('content/new.md')).text).toBe('hello');
    });

    it('overwrites when the sha matches', async () => {
      const adapter = await withFiles();
      const { sha } = await adapter.readFile('content/a.md');
      await adapter.writeFile('content/a.md', 'edited', {
        message: 'edit',
        sha,
      });
      expect((await adapter.readFile('content/a.md')).text).toBe('edited');
    });

    it('refuses to clobber a file that changed underneath', async () => {
      const adapter = await withFiles();
      const { sha } = await adapter.readFile('content/a.md');
      // Someone else saves first.
      await adapter.writeFile('content/a.md', 'theirs', {
        message: 'their edit',
        sha,
      });
      await expect(
        adapter.writeFile('content/a.md', 'mine', { message: 'my edit', sha }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await adapter.readFile('content/a.md')).text).toBe('theirs');
    });

    it('deletes a file and then reports it missing', async () => {
      const adapter = await withFiles();
      await adapter.deleteFile('content/a.md', { message: 'remove' });
      expect(await adapter.exists('content/a.md')).toBe(false);
      await expect(adapter.deleteFile('content/a.md', { message: 'again' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('creates a branch that starts from the source branch', async () => {
      const adapter = await withFiles();
      await adapter.createBranch('cms/draft', 'main');
      expect(await adapter.listBranches()).toContain('cms/draft');
      expect((await adapter.readFile('content/a.md')).text).toBe('one');
    });

    it('stores and lists uploads', async () => {
      const adapter = await withFiles();
      const ref = await adapter.media().upload(
        {
          data: new Uint8Array([1, 2, 3]),
          name: 'photo.webp',
          type: 'image/webp',
        },
        { folder: 'public/images' },
      );
      expect(ref.url).toBe('/public/images/photo.webp');
      expect(await adapter.media().list('public/images')).toHaveLength(1);
      await adapter.media().remove(ref.path);
      expect(await adapter.media().list('public/images')).toHaveLength(0);
    });
  });
}

describeStorageAdapter('memory', async () => new MemoryAdapter());
