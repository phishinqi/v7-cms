import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config-load.js';

const minimal = {
  backend: { name: 'github', repo: 'owner/repo', branch: 'main' },
  collections: [
    {
      kind: 'fields',
      name: 'posts',
      label: 'Posts',
      folder: 'content/posts',
      extension: 'md',
      format: 'frontmatter',
      contentField: 'body',
      fields: [
        { name: 'title', widget: 'string' },
        { name: 'body', widget: 'markdown' },
      ],
    },
  ],
};

describe('config loading', () => {
  it('accepts a minimal config', () => {
    const { issues } = loadConfig(minimal);
    expect(issues).toEqual([]);
  });

  it('reports the github backend needing a repo', () => {
    const { issues } = loadConfig({ ...minimal, backend: { name: 'github' } });
    expect(issues.map((i) => i.path)).toContain('backend.repo');
  });

  it('rejects duplicate collection names', () => {
    const { issues } = loadConfig({
      ...minimal,
      collections: [minimal.collections[0], { ...minimal.collections[0]! }],
    });
    expect(issues.some((i) => /Duplicate collection/.test(i.message))).toBe(true);
  });

  it('rejects duplicate field names inside one object', () => {
    const { issues } = loadConfig({
      ...minimal,
      collections: [
        {
          ...minimal.collections[0]!,
          fields: [
            { name: 'title', widget: 'string' },
            { name: 'title', widget: 'text' },
          ],
        },
      ],
    });
    expect(issues.some((i) => /Duplicate field/.test(i.message))).toBe(true);
  });

  it('rejects an object field with no children and a list with no item shape', () => {
    const { issues } = loadConfig({
      ...minimal,
      collections: [
        {
          ...minimal.collections[0]!,
          contentField: undefined,
          fields: [
            { name: 'body', widget: 'markdown' },
            { name: 'meta', widget: 'object' },
            { name: 'tags', widget: 'list' },
          ],
        },
      ],
    });
    const messages = issues.map((i) => `${i.path}: ${i.message}`);
    expect(messages).toContain('posts.meta: An object field needs nested fields.');
    expect(messages).toContain('posts.tags: A list field needs either `fields` or `field`.');
  });

  it('rejects a contentField that is not declared', () => {
    const { issues } = loadConfig({
      ...minimal,
      collections: [{ ...minimal.collections[0]!, contentField: 'missing' }],
    });
    expect(issues.some((i) => /No field named "missing"/.test(i.message))).toBe(true);
  });

  it('reports every problem at once rather than only the first', () => {
    const { issues } = loadConfig({
      backend: { name: 'github' },
      collections: [minimal.collections[0], { ...minimal.collections[0]!, name: 'other' }],
    });
    // Missing repo, and the copied collection's dangling contentField is fine — but the
    // duplicate-name case plus the missing repo must both surface.
    expect(issues.map((i) => i.path)).toContain('backend.repo');
    expect(issues.some((i) => i.path.startsWith('collections.'))).toBe(false);
  });

  it('accepts the album shape the blog actually uses', () => {
    // A nested list of objects with mixed optional sub-objects — the case that defeated the
    // other CMSs. It must be expressible, and the optional sub-objects must collapse when empty.
    const { issues } = loadConfig({
      backend: { name: 'github', repo: 'owner/repo' },
      collections: [
        {
          kind: 'fields',
          name: 'albums',
          label: 'Albums',
          folder: 'content/albums',
          extension: 'md',
          format: 'frontmatter',
          fields: [
            { name: 'title', widget: 'string' },
            {
              name: 'images',
              widget: 'list',
              fields: [
                { name: 'src', widget: 'image', required: true },
                { name: 'alt', widget: 'string', required: true },
                {
                  name: 'photo',
                  widget: 'object',
                  collapseEmpty: true,
                  fields: [
                    { name: 'camera', widget: 'string' },
                    { name: 'iso', widget: 'number', required: false },
                  ],
                },
                {
                  name: 'artwork',
                  widget: 'object',
                  collapseEmpty: true,
                  fields: [{ name: 'device', widget: 'string' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('loads the blog config example if present', () => {
    // Guard against the example drifting away from what the loader accepts.
    const path = new URL('../../../examples/v7-blog/cms.config.json', import.meta.url);
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const { config, issues } = loadConfig(raw);
      expect(issues).toEqual([]);
      expect(config.collections.length).toBeGreaterThan(0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  });
});

describe('the published JSON schema', () => {
  it('exists, because a consumer config points at it', async () => {
    // `$schema` in a cms.config.json resolves to this file. It was referenced for a while without
    // ever being generated, so an author copying the example got a dangling path.
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const text = await readFile(resolve(import.meta.dirname, '../schema/config.json'), 'utf8');
    const schema = JSON.parse(text) as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema.required).toEqual(expect.arrayContaining(['backend', 'collections']));
    expect(schema.properties).toHaveProperty('backend');
    expect(schema.properties).toHaveProperty('collections');
  });

  it('accepts the example config an author would copy', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const { loadConfig } = await import('../src/config-load.js');
    const example = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, '../../../examples/v7-blog/cms.config.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    delete example['$schema'];
    // If the shipped example did not load, every author who copied it would start from a broken
    // config and see the editor's error screen instead of their content.
    expect(loadConfig(example).issues).toEqual([]);
  });
});

describe('media configuration', () => {
  it('requires a repository and public URL for independent media', () => {
    const { issues } = loadConfig({ ...minimal, media: { provider: 'github' } });
    expect(issues.map((i) => i.path)).toContain('media.repo');
    expect(issues.map((i) => i.path)).toContain('media.publicPath');
    expect(
      loadConfig({
        ...minimal,
        media: {
          provider: 'github',
          repo: 'owner/media',
          publicPath: 'https://img.example/images',
        },
      }).issues,
    ).toEqual([]);
  });
  it('validates R2 endpoint and effective collection overrides', () => {
    expect(
      loadConfig({ ...minimal, media: { provider: 'r2', endpoint: '/api/media' } }).issues,
    ).toEqual([]);
    expect(
      loadConfig({ ...minimal, media: { provider: 'r2', endpoint: 'javascript:bad' } }).issues
        .length,
    ).toBeGreaterThan(0);
    const { issues } = loadConfig({
      ...minimal,
      collections: [{ ...minimal.collections[0], media: { provider: 'github' } }],
    });
    expect(issues.map((i) => i.path)).toContain('collections.posts.media.repo');
  });
});
