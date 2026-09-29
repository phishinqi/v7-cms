/**
 * The two local backends, driven the way the editor drives them.
 *
 * The proxy adapter is tested against the real proxy over HTTP rather than a mock, so the two
 * halves of the protocol are checked against each other. The File System adapter runs against a
 * fake directory handle, which is as close as a test can get to the real picker.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startProxy, type RunningProxy } from '@v7-cms/proxy/http';
import { ConflictError, NotFoundError } from '@v7-cms/core/storage';
import { ProxyAdapter } from '../src/proxy.js';
import { FileSystemAdapter } from '../src/fs-access.js';
import { FakeStore } from './fake-fs.js';

describe('proxy adapter over a real proxy', () => {
  let root: string;
  let running: RunningProxy;
  let adapter: ProxyAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'v7-adapter-'));
    await mkdir(join(root, 'content/posts'), { recursive: true });
    await writeFile(join(root, 'content/posts/one.md'), '---\ntitle: One\n---\n\nBody.\n');
    running = await startProxy({ root });
    adapter = new ProxyAdapter({ url: running.url, token: running.token });
    await adapter.init();
  });

  afterEach(async () => {
    await running.close();
    await rm(root, { recursive: true, force: true });
  });

  it('reports which folder it serves, so the editor can check it', async () => {
    const info = await adapter.describe();
    expect(info.repo).toBe(root.split(/[\\/]/).pop());
  });

  it('refuses to initialise against a proxy that is not there', async () => {
    const missing = new ProxyAdapter({ url: 'http://127.0.0.1:1', token: 'x' });
    await expect(missing.init()).rejects.toThrow();
  });

  it('refuses to initialise with the wrong token', async () => {
    const wrong = new ProxyAdapter({ url: running.url, token: 'nope' });
    await expect(wrong.init()).rejects.toThrow(/token/i);
  });

  it('lists, reads and writes', async () => {
    expect(await adapter.listDir('content/posts')).toEqual([{ name: 'one.md', type: 'file' }]);
    const file = await adapter.readFile('content/posts/one.md');
    expect(file.text).toContain('title: One');

    await adapter.writeFile('content/posts/two.md', '---\ntitle: Two\n---\n', { message: 'add' });
    expect(await readFile(join(root, 'content/posts/two.md'), 'utf8')).toContain('title: Two');
  });

  it('keeps CJK intact through the round trip', async () => {
    const text = '---\ntitle: 城市边角\n---\n\n正文 🎞\n';
    await adapter.writeFile('content/posts/cjk.md', text, { message: 'add' });
    expect(await readFile(join(root, 'content/posts/cjk.md'), 'utf8')).toBe(text);
    expect((await adapter.readFile('content/posts/cjk.md')).text).toBe(text);
  });

  it('round-trips binary content', async () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => (index * 11) % 256);
    await adapter.writeFile('public/images/a.webp', bytes, { message: 'add' });
    expect(Array.from(await adapter.readBinary('public/images/a.webp'))).toEqual(Array.from(bytes));
    expect(Array.from(await readFile(join(root, 'public/images/a.webp')))).toEqual(
      Array.from(bytes),
    );
  });

  it('reports a missing file as NotFound', async () => {
    await expect(adapter.readFile('content/nope.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(await adapter.exists('content/nope.md')).toBe(false);
  });

  it('deletes a file', async () => {
    await adapter.deleteFile('content/posts/one.md', { message: 'remove' });
    expect(await adapter.exists('content/posts/one.md')).toBe(false);
    await expect(
      adapter.deleteFile('content/posts/one.md', { message: 'again' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('surfaces a refused path traversal as a conflict rather than crashing', async () => {
    await expect(
      adapter.writeFile('../outside.md', 'x', { message: 'escape' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('uploads and lists media', async () => {
    const ref = await adapter
      .media()
      .upload(
        { data: new TextEncoder().encode('bytes'), name: 'photo.webp', type: 'image/webp' },
        { folder: 'public/images/uploads' },
      );
    expect(ref.path).toBe('public/images/uploads/photo.webp');
    expect(await readFile(join(root, 'public/images/uploads/photo.webp'), 'utf8')).toBe('bytes');
    expect(await adapter.media().list('public/images/uploads')).toHaveLength(1);
  });

  it('reports a single implicit branch, since a folder has none', async () => {
    expect(await adapter.listBranches()).toEqual(['local']);
    await expect(adapter.createBranch('x', 'local')).resolves.toBeUndefined();
  });
});

describe('file system access adapter', () => {
  let adapter: FileSystemAdapter;
  let fake: FakeStore;

  beforeEach(async () => {
    fake = new FakeStore({
      'content/posts/one.md': '---\ntitle: One\n---\n\nBody.\n',
      'README.md': '# Readme\n',
    });
    adapter = new FileSystemAdapter(fake.handle());
    await adapter.init();
  });

  it('lists a directory', async () => {
    expect((await adapter.listDir('content/posts')).map((entry) => entry.name)).toEqual(['one.md']);
  });

  it('reads and writes a file', async () => {
    expect((await adapter.readFile('content/posts/one.md')).text).toContain('title: One');
    await adapter.writeFile('content/posts/two.md', '---\ntitle: Two\n---\n', { message: 'add' });
    expect((await adapter.readFile('content/posts/two.md')).text).toContain('title: Two');
  });

  it('keeps CJK intact', async () => {
    const text = '---\ntitle: 纸面练习\n---\n\n正文\n';
    await adapter.writeFile('content/cjk.md', text, { message: 'add' });
    expect((await adapter.readFile('content/cjk.md')).text).toBe(text);
  });

  it('round-trips binary content', async () => {
    const bytes = Uint8Array.from([0, 1, 254, 255]);
    await adapter.writeFile('public/images/a.webp', bytes, { message: 'add' });
    expect(Array.from(await adapter.readBinary('public/images/a.webp'))).toEqual([0, 1, 254, 255]);
  });

  it('reports a missing file', async () => {
    await expect(adapter.readFile('nope.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(await adapter.exists('nope.md')).toBe(false);
  });

  it('deletes a file', async () => {
    await adapter.deleteFile('README.md', { message: 'remove' });
    expect(await adapter.exists('README.md')).toBe(false);
  });

  it('detects a change made outside the editor', async () => {
    const file = await adapter.readFile('content/posts/one.md');
    // Something else writes to the file, moving its mtime forward.
    fake.externalEdit('content/posts/one.md', 'changed elsewhere');
    await expect(
      adapter.writeFile('content/posts/one.md', 'mine', { message: 'edit', sha: file.sha }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await adapter.readFile('content/posts/one.md')).text).toBe('changed elsewhere');
  });

  it('saves when nothing else touched the file', async () => {
    const file = await adapter.readFile('content/posts/one.md');
    await adapter.writeFile('content/posts/one.md', 'mine', { message: 'edit', sha: file.sha });
    expect((await adapter.readFile('content/posts/one.md')).text).toBe('mine');
  });

  it('stores media and lists it', async () => {
    const ref = await adapter
      .media()
      .upload(
        { data: new TextEncoder().encode('x'), name: 'a.webp', type: 'image/webp' },
        { folder: 'public/images/uploads' },
      );
    expect(ref.url).toBe('/public/images/uploads/a.webp');
    expect(await adapter.media().list('public/images/uploads')).toHaveLength(1);
  });

  it('reports a single implicit branch', async () => {
    expect(await adapter.listBranches()).toEqual(['local']);
  });
});
