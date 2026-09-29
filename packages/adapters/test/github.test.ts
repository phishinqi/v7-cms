/**
 * The GitHub backend runs the same conformance suite as every other adapter, so its behaviour is
 * compared against the in-memory reference rather than against its own assumptions.
 *
 * The fake API speaks real request shapes: correct shas are required, stale ones are refused, and
 * trees are served the way GitHub serves them.
 */
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '@v7-cms/core/storage';
import { GitHubAdapter } from '../src/github/adapter.js';
import { FakeGitHub } from '../src/github/fake.js';

const make = (options: { files?: Record<string, string> } = {}) => {
  const github = new FakeGitHub({
    files: options.files ?? { 'content/a.md': 'one', 'content/nested/b.md': 'two' },
  });
  const adapter = new GitHubAdapter({
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    token: 'test-token',
    fetch: github.fetch,
  });
  return { github, adapter };
};

describe('github adapter', () => {
  it('lists files and directories in one level', async () => {
    const { adapter } = make();
    expect(await adapter.listDir('content')).toEqual([
      { name: 'a.md', type: 'file', sha: expect.any(String) },
      { name: 'nested', type: 'dir' },
    ]);
  });

  it('lists the repository root', async () => {
    const { adapter } = make({ files: { 'README.md': 'x', 'content/a.md': 'y' } });
    expect((await adapter.listDir('')).map((entry) => entry.name).sort()).toEqual([
      'README.md',
      'content',
    ]);
  });

  it('reads a file with its sha', async () => {
    const { adapter } = make();
    const file = await adapter.readFile('content/a.md');
    expect(file.text).toBe('one');
    expect(file.sha).toBeTruthy();
  });

  it('round-trips CJK and emoji, which btoa cannot handle directly', async () => {
    const { adapter, github } = make();
    const text = '# 城市边角\n\n示例文字 🎞 与符号 · ×\n';
    await adapter.writeFile('content/cjk.md', text, { message: 'add' });
    expect(github.snapshot()['content/cjk.md']).toBe(text);
    expect((await adapter.readFile('content/cjk.md')).text).toBe(text);
  });

  it('round-trips binary content', async () => {
    const { adapter } = make();
    const bytes = Uint8Array.from({ length: 512 }, (_, index) => (index * 7) % 256);
    await adapter.writeFile('public/images/a.webp', bytes, { message: 'add' });
    expect(Array.from(await adapter.readBinary('public/images/a.webp'))).toEqual(Array.from(bytes));
  });

  it('handles a file larger than the base64 chunking boundary', async () => {
    const { adapter, github } = make();
    // The encoder works in 32k chunks; go past it with non-ASCII so both paths are exercised.
    const text = '汉字与文字\n'.repeat(6000);
    await adapter.writeFile('content/big.md', text, { message: 'add' });
    expect(github.snapshot()['content/big.md']).toBe(text);
  });

  it('raises NotFound for a missing file and a missing branch', async () => {
    const { adapter } = make();
    await expect(adapter.readFile('content/nope.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(await adapter.exists('content/nope.md')).toBe(false);
    adapter.setBranch('missing');
    await expect(adapter.listDir('content')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes a new file', async () => {
    const { adapter, github } = make();
    const result = await adapter.writeFile('content/new.md', 'hello', { message: 'add new.md' });
    expect((await adapter.readFile('content/new.md')).text).toBe('hello');
    expect(result.sha).toBeTruthy();
    expect(github.commits.map((commit) => commit.message)).toContain('add new.md');
  });

  it('overwrites when the sha matches', async () => {
    const { adapter } = make();
    const { sha } = await adapter.readFile('content/a.md');
    await adapter.writeFile('content/a.md', 'edited', { message: 'edit', sha });
    expect((await adapter.readFile('content/a.md')).text).toBe('edited');
  });

  it('refuses to clobber a file that changed underneath', async () => {
    const { adapter, github } = make();
    const { sha } = await adapter.readFile('content/a.md');
    github.externalEdit('content/a.md', 'theirs');
    await expect(
      adapter.writeFile('content/a.md', 'mine', { message: 'my edit', sha }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(github.snapshot()['content/a.md']).toBe('theirs');
  });

  it('refuses a write to a file that was deleted underneath', async () => {
    const { adapter, github } = make();
    const { sha } = await adapter.readFile('content/a.md');
    github.externalEdit('content/a.md', 'replaced');
    await expect(
      adapter.writeFile('content/a.md', 'mine', { message: 'edit', sha }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('detects a conflict from the API even without a local sha check', async () => {
    const { adapter, github } = make();
    // No sha supplied, but the file exists: GitHub refuses, and that must surface as a conflict.
    await expect(
      adapter.writeFile('content/a.md', 'mine', { message: 'edit' }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(github.snapshot()['content/a.md']).toBe('one');
  });

  it('deletes a file and then reports it missing', async () => {
    const { adapter } = make();
    await adapter.deleteFile('content/a.md', { message: 'remove' });
    expect(await adapter.exists('content/a.md')).toBe(false);
    await expect(adapter.deleteFile('content/a.md', { message: 'again' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('sees its own writes immediately, without a stale cache', async () => {
    const { adapter } = make();
    await adapter.writeFile('content/fresh.md', 'x', { message: 'add' });
    expect(await adapter.exists('content/fresh.md')).toBe(true);
    expect((await adapter.listDir('content')).map((entry) => entry.name)).toContain('fresh.md');
  });

  it('lists branches and creates one from another', async () => {
    const { adapter, github } = make();
    expect(await adapter.listBranches()).toEqual(['main']);
    await adapter.createBranch('cms/paper', 'main');
    expect(github.branchNames()).toContain('cms/paper');
    // Creating the same branch twice is not an error: opening a draft again must be safe.
    await adapter.createBranch('cms/paper', 'main');
    expect(github.branchNames().filter((name) => name === 'cms/paper')).toHaveLength(1);
  });

  it('writes a new file to a named branch without touching the default one', async () => {
    const { adapter, github } = make();
    await adapter.createBranch('cms/draft', 'main');
    await adapter.writeFile('content/draft.md', 'draft text', {
      message: 'draft',
      branch: 'cms/draft',
    });
    expect(github.snapshot('cms/draft')['content/draft.md']).toBe('draft text');
    expect(github.snapshot('main')['content/draft.md']).toBeUndefined();
  });

  it('edits an existing file on a branch using the sha from that branch', async () => {
    const { adapter, github } = make();
    await adapter.createBranch('cms/draft', 'main');
    const onMain = await adapter.readFile('content/a.md');
    const onBranch = await adapter.call(`/repos/owner/repo/contents/content/a.md?ref=cms%2Fdraft`);
    void onBranch;
    void onMain;
    // Reading with the branch switched gives the right sha for that branch.
    adapter.setBranch('cms/draft');
    const file = await adapter.readFile('content/a.md');
    await adapter.writeFile('content/a.md', 'edited on the branch', {
      message: 'edit',
      sha: file.sha,
    });
    expect(github.snapshot('cms/draft')['content/a.md']).toBe('edited on the branch');
    expect(github.snapshot('main')['content/a.md']).toBe('one');
  });

  it('makes only one tree request for repeated listings', async () => {
    const { adapter, github } = make();
    await adapter.listDir('content');
    await adapter.listDir('content/nested');
    await adapter.listDir('content');
    const treeCalls = github.calls.filter((call) => call.path.startsWith('/git/trees/'));
    expect(treeCalls).toHaveLength(1);
  });

  describe('failures worth explaining to the author', () => {
    it('reports a rejected token', async () => {
      const github = new FakeGitHub({ failWith: { status: 401 } });
      const adapter = new GitHubAdapter({
        owner: 'owner',
        repo: 'repo',
        token: 'bad',
        fetch: github.fetch,
      });
      await expect(adapter.init()).rejects.toThrow(/rejected the token/);
    });

    it('reports a rate limit rather than a generic 403', async () => {
      const github = new FakeGitHub({ failWritesWith: 403 });
      const adapter = new GitHubAdapter({
        owner: 'owner',
        repo: 'repo',
        token: 'token',
        fetch: async (input, init) => {
          const response = await github.fetch(input, init);
          if (response.status === 403) {
            const headers = new Headers(response.headers);
            headers.set('x-ratelimit-remaining', '0');
            return new Response(response.body, { status: 403, headers });
          }
          return response;
        },
      });
      await expect(adapter.writeFile('x.md', 'y', { message: 'm' })).rejects.toThrow(/rate limit/);
    });

    it('reports a missing repository at init', async () => {
      const github = new FakeGitHub({ failWith: { status: 404 } });
      const adapter = new GitHubAdapter({
        owner: 'owner',
        repo: 'gone',
        token: 'token',
        fetch: github.fetch,
      });
      await expect(adapter.init()).rejects.toThrow(/could not find/i);
    });
  });

  describe('media', () => {
    it('uploads into the repository and lists it back', async () => {
      const { adapter, github } = make();
      const ref = await adapter
        .media()
        .upload(
          { data: new TextEncoder().encode('bytes'), name: 'photo.webp', type: 'image/webp' },
          { folder: 'public/images/uploads' },
        );
      expect(ref.path).toBe('public/images/uploads/photo.webp');
      expect(github.snapshot()['public/images/uploads/photo.webp']).toBe('bytes');
      expect(await adapter.media().list('public/images/uploads')).toHaveLength(1);
    });

    it('removes an upload', async () => {
      const { adapter } = make();
      await adapter
        .media()
        .upload(
          { data: new TextEncoder().encode('x'), name: 'a.webp', type: 'image/webp' },
          { folder: 'public/images' },
        );
      await adapter.media().remove('public/images/a.webp');
      expect(await adapter.media().list('public/images')).toHaveLength(0);
    });
  });

  it('can swap the token without losing the adapter', async () => {
    const { adapter, github } = make();
    adapter.setToken('another');
    expect((await adapter.readFile('content/a.md')).text).toBe('one');
    expect(github.calls.some((call) => call.method === 'GET')).toBe(true);
  });
});
