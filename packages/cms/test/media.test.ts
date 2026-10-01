import { describe, it, expect, vi } from 'vitest';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import { mediaPaths, uploadPreparedImage, withImageFields } from '../src/upload/media.js';

const prepared = {
  exif: {},
  color: '#123456',
  variants: [
    { width: 480, height: 320, blob: new Blob(['RIFF0000WEBPdata'], { type: 'image/webp' }) },
  ],
};

describe('media destinations', () => {
  it('writes actual image bytes into the content backend at the chosen folder', async () => {
    const storage = new MemoryAdapter();
    const result = await uploadPreparedImage(
      prepared,
      'a.webp',
      { repoPath: 'public/photos', publicPath: '/photos' },
      storage,
    );
    expect(new TextDecoder().decode(await storage.readBinary('public/photos/a.webp'))).toBe(
      'RIFF0000WEBPdata',
    );
    expect(result.src).toBe('/photos/a.webp');
  });
  it('writes only to the independent repository and selected branch', async () => {
    const storage = new MemoryAdapter();
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ content: { sha: 'new' } }));
    const result = await uploadPreparedImage(
      prepared,
      'a.webp',
      {
        provider: 'github',
        repo: 'owner/media',
        branch: 'assets',
        repoPath: 'photos',
        publicPath: 'https://img.example/photos',
      },
      storage,
      { token: 'test', fetch: request },
    );
    expect(request.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/repos/owner/media/contents/photos/a.webp',
    );
    const init = request.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toMatchObject({
      branch: 'assets',
      content: btoa('RIFF0000WEBPdata'),
    });
    expect(await storage.exists('photos/a.webp')).toBe(false);
    expect(result.src).toBe('https://img.example/photos/a.webp');
  });
  it('posts WebP multipart data to R2 and preserves the server URL and srcset', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          src: 'https://img.example/images/id/480.webp',
          width: 480,
          height: 320,
          srcset: 'https://img.example/images/id/480.webp 480w',
        },
        { status: 201 },
      ),
    );
    const result = await uploadPreparedImage(
      prepared,
      'a.webp',
      { provider: 'r2', endpoint: '/api/media' },
      new MemoryAdapter(),
      { token: 'test', fetch: request },
    );
    const init = request.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test');
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
    const form = init.body as FormData;
    expect(JSON.parse(form.get('metadata') as string).sizes).toEqual([
      { width: 480, height: 320, field: 'file-480' },
    ]);
    expect(await (form.get('file-480') as Blob).text()).toBe('RIFF0000WEBPdata');
    expect(result.srcset).toContain('480w');
    expect(result.src).toBe('https://img.example/images/id/480.webp');
  });
  it('propagates denied writes and rejects unauthenticated remote uploads', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ error: 'Repository write access required' }, { status: 403 }),
      );
    const config = { provider: 'r2' as const, endpoint: '/api/media' };
    await expect(
      uploadPreparedImage(prepared, 'a.webp', config, new MemoryAdapter(), {
        token: 'test',
        fetch: request,
      }),
    ).rejects.toThrow('write access');
    request.mockClear();
    await expect(
      uploadPreparedImage(prepared, 'a.webp', config, new MemoryAdapter(), { fetch: request }),
    ).rejects.toThrow('Sign in');
    expect(request).not.toHaveBeenCalled();
  });
  it('expands collection folders and rejects traversal before a write', async () => {
    expect(
      mediaPaths({ repoPath: 'public/{{collection}}/{{slug}}' }, 'trip', 'albums').repoPath,
    ).toBe('public/albums/trip');
    expect(() => mediaPaths({ repoPath: 'public/{{slug}}' }, '../outside', 'albums')).toThrow();
    await expect(
      uploadPreparedImage(prepared, 'a.webp', { repoPath: '../outside' }, new MemoryAdapter()),
    ).rejects.toThrow('repository-relative');
  });
  it('updates nested dimensions and clears obsolete responsive URLs without losing captions or ids', () => {
    expect(
      withImageFields(
        { id: 'stable', caption: 'Keep', srcset: 'old' },
        ['id', 'width', 'height', 'srcset'].map((name) => ({ name })),
        { id: 'new', name: 'a.webp', src: '/a.webp', width: 480, height: 320 },
      ),
    ).toEqual({ id: 'stable', caption: 'Keep', width: 480, height: 320 });
  });
});

it('prefills declared EXIF fields without overwriting authored metadata', () => {
  const fields = [
    { name: 'date' },
    { name: 'photo', fields: [{ name: 'camera' }, { name: 'iso' }] },
  ];
  const image = {
    id: 'a',
    name: 'a.webp',
    src: '/a.webp',
    width: 8,
    height: 6,
    exif: { camera: 'Camera X', iso: 400, lens: 'Ignored', date: '2026-10-01' },
  };
  expect(withImageFields({ photo: { camera: 'Manual' }, date: '' }, fields, image)).toEqual({
    date: '2026-10-01',
    photo: { camera: 'Manual', iso: 400 },
  });
  expect(withImageFields({ kind: 'artwork' }, fields, image).photo).toBeUndefined();
  expect(withImageFields({ photo: {} }, fields, { ...image, exif: {} })).toEqual({ photo: {} });
});
