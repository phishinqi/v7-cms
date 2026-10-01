import type { MediaConfig } from '@v7-cms/core';
import type { StorageAdapter } from '@v7-cms/core/storage';
import { GitHubAdapter } from '@v7-cms/adapters';
import type { PreparedImage } from './image-pipeline.js';

export type MediaTarget = Partial<MediaConfig> & { slug?: string; collection?: string };

export interface UploadedImage {
  src: string;
  width: number;
  height: number;
  srcset?: string;
  color?: string;
  name: string;
  id: string;
}

/** Expand paths before writing; never allow a slug to escape the configured folder. */
export function mediaPaths(
  media: Partial<MediaConfig>,
  slug: string,
  collection: string,
): Partial<MediaConfig> {
  const expand = (path: string) =>
    path.replace(/\{\{(slug|collection)\}\}/g, (_, key: string) => {
      const value = key === 'slug' ? slug : collection;
      if (!value || /[/\\]/.test(value) || value === '.' || value === '..')
        throw new Error('Set a slug without path separators before uploading.');
      return value;
    });
  return {
    ...media,
    ...(media.repoPath !== undefined ? { repoPath: expand(media.repoPath) } : {}),
    ...(media.publicPath !== undefined ? { publicPath: expand(media.publicPath) } : {}),
  };
}

export async function uploadPreparedImage(
  prepared: PreparedImage,
  name: string,
  media: Partial<MediaConfig>,
  storage: StorageAdapter,
  options: { token?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<UploadedImage> {
  const provider = media.provider ?? 'repo';
  const image = prepared.variants.at(-1);
  if (!image) throw new Error('No image was generated.');
  const common = {
    name,
    id: name.replace(/\.webp$/, ''),
    width: image.width,
    height: image.height,
    color: prepared.color,
  };
  if (provider === 'r2') {
    if (!options.token) throw new Error('Sign in with GitHub before uploading to R2.');
    if (!media.endpoint || !/^(\/(?!\/)|https:\/\/)/.test(media.endpoint))
      throw new Error('Configure a same-origin path or HTTPS media endpoint.');
    const form = new FormData();
    form.append(
      'metadata',
      JSON.stringify({
        name,
        color: prepared.color,
        sizes: prepared.variants.map((v) => ({
          width: v.width,
          height: v.height,
          field: `file-${v.width}`,
        })),
      }),
    );
    for (const variant of prepared.variants)
      form.append(`file-${variant.width}`, variant.blob, name);
    const response = await (options.fetch ?? globalThis.fetch.bind(globalThis))(media.endpoint, {
      method: 'POST',
      body: form,
      headers: { Authorization: `Bearer ${options.token}` },
      redirect: 'error',
    });
    const result = (await response.json()) as {
      src?: string;
      width?: number;
      height?: number;
      srcset?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(result.error ?? `Media upload failed (${response.status}).`);
    if (
      !result.src?.startsWith('https://') ||
      !Number.isInteger(result.width) ||
      !Number.isInteger(result.height) ||
      result.width! <= 0 ||
      result.height! <= 0
    )
      throw new Error('The media endpoint returned an invalid image.');
    return {
      ...common,
      src: result.src,
      width: result.width!,
      height: result.height!,
      ...(result.srcset ? { srcset: result.srcset } : {}),
    };
  }
  if (provider !== 'repo' && provider !== 'github')
    throw new Error('Unsupported media provider. Use repo, github or r2.');
  let destination = storage;
  if (provider === 'github') {
    if (!options.token)
      throw new Error('Sign in with GitHub before uploading to a media repository.');
    if (!media.repo || !/^[\w.-]+\/[\w.-]+$/.test(media.repo))
      throw new Error('Configure the media repository as owner/repo.');
    if (!media.publicPath?.startsWith('https://'))
      throw new Error('Configure the media repository public HTTPS URL.');
    const [owner, repo] = media.repo.split('/') as [string, string];
    destination = new GitHubAdapter({
      owner,
      repo,
      branch: media.branch ?? 'main',
      token: options.token,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }
  const folder = (media.repoPath ?? 'public/images/uploads').replace(/\/+$/, '');
  if (
    folder.startsWith('/') ||
    /\\/.test(folder) ||
    folder.split('/').some((p) => p === '.' || p === '..') ||
    /\{\{/.test(folder)
  )
    throw new Error('Media folder must be a resolved repository-relative path.');
  if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === '.' || name === '..')
    throw new Error('Invalid media filename.');
  await destination.writeFile(
    `${folder ? `${folder}/` : ''}${name}`,
    new Uint8Array(await image.blob.arrayBuffer()),
    { message: `Upload ${name}` },
  );
  return {
    ...common,
    src: `${(media.publicPath ?? '/images/uploads').replace(/\/$/, '')}/${encodeURIComponent(name)}`,
  };
}

/** Keep dimensions and responsive URLs beside a nested src field when the schema exposes them. */
export function withImageFields(
  value: Record<string, unknown>,
  fields: { name: string }[],
  image?: UploadedImage,
): Record<string, unknown> {
  if (!image) return value;
  const next = { ...value };
  for (const key of ['width', 'height', 'srcset', 'color'] as const) {
    if (fields.some((f) => f.name === key)) {
      if (image[key] !== undefined) next[key] = image[key];
      else delete next[key];
    }
  }
  if (fields.some((f) => f.name === 'id') && !next.id) next.id = image.id;
  return next;
}
