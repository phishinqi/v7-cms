/**
 * The local proxy.
 *
 * This process can write files in someone's repository, so the tests care most about what it
 * refuses: paths outside the root, paths that escape through a symlink, and calls without the
 * token. The rest covers the operations the editor depends on.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProxy } from '../src/server.js';
import { startProxy, type RunningProxy } from '../src/http.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'v7-proxy-'));
  await mkdir(join(root, 'content/posts'), { recursive: true });
  await writeFile(join(root, 'content/posts/one.md'), '---\ntitle: One\n---\n\nBody.\n');
  await writeFile(join(root, 'README.md'), '# Readme\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const proxy = (options: { token?: string | null } = {}) =>
  new LocalProxy({ root, token: options.token ?? null });

const call = (instance: LocalProxy, body: unknown, token?: string) =>
  instance.handle({ method: 'POST', path: '/api/v1', body, ...(token ? { token } : {}) });

describe('proxy content operations', () => {
  it('reports which repository it serves, which is how the CMS checks it', async () => {
    const response = await call(proxy(), { action: 'info' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ repo: root.split(/[\\/]/).pop() });
  });

  it('lists a directory without dotfiles', async () => {
    await writeFile(join(root, 'content/.hidden'), 'x');
    const response = await call(proxy(), { action: 'listDir', path: 'content' });
    expect(response.body).toEqual({ entries: [{ name: 'posts', type: 'dir' }] });
  });

  it('lists the repository root', async () => {
    const response = await call(proxy(), { action: 'listDir', path: '' });
    const names = (response.body as { entries: Array<{ name: string }> }).entries.map(
      (e) => e.name,
    );
    expect(names.sort()).toEqual(['README.md', 'content']);
  });

  it('reads a text file', async () => {
    const response = await call(proxy(), { action: 'readFile', path: 'content/posts/one.md' });
    expect((response.body as { file: { text: string } }).file.text).toContain('title: One');
  });

  it('reads a binary file as base64', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await writeFile(join(root, 'image.png'), bytes);
    const response = await call(proxy(), { action: 'readFile', path: 'image.png' });
    const file = (response.body as { file: { base64: string; text?: string } }).file;
    expect(file.text).toBeUndefined();
    expect(Buffer.from(file.base64, 'base64')).toEqual(bytes);
  });

  it('reports a missing file rather than throwing', async () => {
    const response = await call(proxy(), { action: 'readFile', path: 'nope.md' });
    expect(response.status).toBe(500);
    expect((response.body as { error: string }).error).toMatch(/Not found/);
  });

  it('answers whether a file exists', async () => {
    expect((await call(proxy(), { action: 'exists', path: 'README.md' })).body).toEqual({
      exists: true,
    });
    expect((await call(proxy(), { action: 'exists', path: 'nope.md' })).body).toEqual({
      exists: false,
    });
  });

  it('writes a file, creating parent directories', async () => {
    const response = await call(proxy(), {
      action: 'writeFile',
      path: 'content/posts/deep/new.md',
      text: '---\ntitle: New\n---\n',
    });
    expect(response.status).toBe(200);
    expect(await readFile(join(root, 'content/posts/deep/new.md'), 'utf8')).toContain('title: New');
  });

  it('writes binary content unchanged', async () => {
    const bytes = Buffer.from([0x00, 0x01, 0xfe, 0xff]);
    await call(proxy(), {
      action: 'writeFile',
      path: 'public/images/a.webp',
      base64: bytes.toString('base64'),
    });
    expect(await readFile(join(root, 'public/images/a.webp'))).toEqual(bytes);
  });

  it('preserves non-ASCII exactly', async () => {
    const text = '---\ntitle: 城市边角\n---\n\n正文 🎞\n';
    await call(proxy(), { action: 'writeFile', path: 'content/posts/cjk.md', text });
    expect(await readFile(join(root, 'content/posts/cjk.md'), 'utf8')).toBe(text);
  });

  it('deletes a file', async () => {
    await call(proxy(), { action: 'deleteFile', path: 'README.md' });
    expect((await call(proxy(), { action: 'exists', path: 'README.md' })).body).toEqual({
      exists: false,
    });
  });

  it('rejects an unknown action instead of guessing', async () => {
    const response = await call(proxy(), { action: 'runShell', command: 'rm -rf /' });
    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toMatch(/Unknown action/);
  });
});

describe('the proxy refuses to leave the repository', () => {
  it.each([
    '../outside.md',
    '../../etc/passwd',
    'content/../../outside.md',
    '/etc/passwd',
    'content/posts/../../../secret',
  ])('refuses to read %s', async (path) => {
    const response = await call(proxy(), { action: 'readFile', path });
    expect(response.status).toBe(403);
  });

  it.each(['../outside.md', 'content/../../outside.md', '/tmp/evil.md'])(
    'refuses to write %s',
    async (path) => {
      const response = await call(proxy(), { action: 'writeFile', path, text: 'x' });
      expect(response.status).toBe(403);
    },
  );

  it('refuses to delete outside the repository', async () => {
    const response = await call(proxy(), { action: 'deleteFile', path: '../outside.md' });
    expect(response.status).toBe(403);
  });

  it('refuses a path that escapes through a symlink', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'v7-outside-'));
    await writeFile(join(outside, 'secret.md'), 'do not read me');
    try {
      await symlink(outside, join(root, 'link'), 'junction').catch(() =>
        symlink(outside, join(root, 'link')),
      );
      const response = await call(proxy(), { action: 'readFile', path: 'link/secret.md' });
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('do not read me');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('the proxy requires its token', () => {
  it('rejects a call with no token', async () => {
    const instance = proxy({ token: 'secret' });
    const response = await call(instance, { action: 'info' });
    expect(response.status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const instance = proxy({ token: 'secret' });
    expect((await call(instance, { action: 'info' }, 'wrong')).status).toBe(401);
  });

  it('accepts the right token', async () => {
    const instance = proxy({ token: 'secret' });
    expect((await call(instance, { action: 'info' }, 'secret')).status).toBe(200);
  });

  it('checks the token before touching the filesystem', async () => {
    const instance = proxy({ token: 'secret' });
    // Even a well-formed write is refused without the token, so no file is created.
    const response = await call(instance, {
      action: 'writeFile',
      path: 'pwned.md',
      text: 'x',
    });
    expect(response.status).toBe(401);
    expect((await call(instance, { action: 'exists', path: 'pwned.md' }, 'secret')).body).toEqual({
      exists: false,
    });
  });
});

describe('the HTTP host', () => {
  let started: RunningProxy | undefined;
  afterEach(async () => {
    await started?.close();
    started = undefined;
  });

  const post = (server: RunningProxy, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${server.url}/api/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-v7-cms-token': server.token, ...headers },
      body: JSON.stringify(body),
    });

  it('serves the content API over HTTP', async () => {
    started = await startProxy({ root });
    const response = await post(started, { action: 'info' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ repo: expect.any(String) });
  });

  it('binds the requested port on loopback', async () => {
    started = await startProxy({ root, port: 0 });
    expect(started.url.startsWith('http://127.0.0.1:')).toBe(true);
    expect(started.port).toBeGreaterThan(0);
  });

  it('answers a health check without a token, so a wrong token is diagnosable', async () => {
    started = await startProxy({ root });
    const response = await fetch(`${started.url}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { repo: string };
    expect(body.repo).toBe(root.split(/[\\/]/).pop());
    // It must not leak anything beyond which folder is being served.
    expect(Object.keys(body).sort()).toEqual(['repo', 'version']);
  });

  it('rejects a request with no token', async () => {
    started = await startProxy({ root });
    const response = await fetch(`${started.url}/api/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'info' }),
    });
    expect(response.status).toBe(401);
  });

  it('allows a loopback origin and refuses another', async () => {
    started = await startProxy({ root });
    const allowed = await post(started, { action: 'info' }, { Origin: 'http://localhost:4321' });
    expect(allowed.status).toBe(200);

    const refused = await post(started, { action: 'info' }, { Origin: 'https://evil.example' });
    expect(refused.status).toBe(403);
  });

  it('serves the media listing', async () => {
    await mkdir(join(root, 'public/images/uploads'), { recursive: true });
    await writeFile(join(root, 'public/images/uploads/a.webp'), 'x');
    started = await startProxy({ root });
    const response = await fetch(`${started.url}/api/media`, {
      headers: { 'x-v7-cms-token': started.token },
    });
    expect(await response.json()).toMatchObject({ assets: [{ name: 'a.webp' }] });
  });

  it('uploads media through the media endpoint', async () => {
    started = await startProxy({ root });
    const response = await post(started, {
      action: 'ignore',
      name: 'photo.webp',
      base64: Buffer.from('bytes').toString('base64'),
    });
    void response;
    const upload = await fetch(`${started.url}/api/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-v7-cms-token': started.token },
      body: JSON.stringify({ name: 'photo.webp', base64: Buffer.from('bytes').toString('base64') }),
    });
    expect(upload.status).toBe(201);
    expect(await readFile(join(root, 'public/images/uploads/photo.webp'), 'utf8')).toBe('bytes');
  });

  it('refuses a media name containing a path separator', async () => {
    started = await startProxy({ root });
    const upload = await fetch(`${started.url}/api/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-v7-cms-token': started.token },
      body: JSON.stringify({ name: '../escape.webp', base64: 'eA==' }),
    });
    expect(upload.status).toBe(400);
  });

  it('returns 404 for an unknown path', async () => {
    started = await startProxy({ root });
    const response = await fetch(`${started.url}/api/nope`, {
      headers: { 'x-v7-cms-token': started.token },
    });
    expect(response.status).toBe(404);
  });
});
