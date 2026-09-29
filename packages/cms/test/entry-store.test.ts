/**
 * The editing model, exercised against the in-memory backend. These are the behaviours the UI
 * depends on: listing entries, loading one, saving without disturbing what was not edited, and
 * keeping unset keys out of the file.
 */
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@v7-cms/adapters/memory';
import { loadConfig } from '@v7-cms/core';
import { EntryStore } from '../src/entry-store.js';

const config = {
  backend: { name: 'local' as const, local: { kind: 'memory' as const } },
  collections: [
    {
      kind: 'fields' as const,
      name: 'albums',
      label: '相册',
      folder: 'content/albums',
      extension: 'md' as const,
      format: 'frontmatter' as const,
      identifierField: 'slug',
      contentField: 'body',
      nested: true,
      fields: [
        { name: 'title', widget: 'string', label: '标题', required: true },
        { name: 'slug', widget: 'string', label: 'slug' },
        { name: 'date', widget: 'datetime', label: '日期' },
        { name: 'draft', widget: 'boolean', label: '草稿' },
        { name: 'cover', widget: 'string', label: '封面', required: false },
        {
          name: 'images',
          widget: 'list',
          label: '图片',
          fields: [
            { name: 'src', widget: 'string', required: true },
            { name: 'alt', widget: 'string', required: true },
            {
              name: 'photo',
              widget: 'object',
              collapseEmpty: true,
              fields: [{ name: 'camera', widget: 'string', required: false }],
            },
          ],
        },
        { name: 'body', widget: 'markdown', label: '正文' },
      ],
    },
  ],
};

const ALBUM = `---
title: 纸面练习
slug: paper
date: '2026-09-01'
draft: false
tags: [paper, sketch]
images:
  - src: /images/one.jpg
    alt: 第一张
    photo: { camera: Demo X1 }
  - src: /images/two.jpg
    alt: 第二张
---

一个相册示例。
`;

async function store(files: Record<string, string> = { 'content/albums/paper.md': ALBUM }) {
  const adapter = new MemoryAdapter(files);
  const { config: parsed, issues } = loadConfig(config);
  expect(issues).toEqual([]);
  const entries = new EntryStore(adapter, parsed.collections);
  return { adapter, entries };
}

describe('entry store', () => {
  it('lists entries with a readable label', async () => {
    const { entries } = await store();
    expect(await entries.list('albums')).toEqual([
      { path: 'content/albums/paper.md', id: 'paper', label: '纸面练习' },
    ]);
  });

  it('finds entries in subfolders when the collection allows nesting', async () => {
    const { entries } = await store({
      'content/albums/paper.md': ALBUM,
      'content/albums/2026/trip.md': '---\ntitle: 旅行\nslug: trip\n---\n\n正文\n',
    });
    expect((await entries.list('albums')).map((entry) => entry.id).sort()).toEqual([
      'paper',
      'trip',
    ]);
  });

  it('loads values, body and the concurrency handle', async () => {
    const { entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    expect(entry.values['title']).toBe('纸面练习');
    expect(entry.values['tags']).toEqual(['paper', 'sketch']);
    expect(entry.body).toBe('\n一个相册示例。\n');
    expect(entry.sha).toBeTruthy();
    expect(entry.isNew).toBe(false);
  });

  it('saving without changes leaves the file identical', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    await entries.save(entry);
    expect(adapter.snapshot()['content/albums/paper.md']).toBe(ALBUM);
  });

  it('saving one field changes only that line', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    entry.values['title'] = '纸面练习 II';
    await entries.save(entry);
    const saved = adapter.snapshot()['content/albums/paper.md']!;
    const before = ALBUM.split('\n');
    const after = saved.split('\n');
    const differing = before
      .map((line, index) => (line === after[index] ? null : index))
      .filter((index) => index !== null);
    expect(differing).toHaveLength(1);
    expect(after[differing[0]!]).toBe('title: 纸面练习 II');
  });

  it('removes a key when its value is cleared, rather than writing a blank', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    entry.values['cover'] = '';
    await entries.save(entry);
    const saved = adapter.snapshot()['content/albums/paper.md']!;
    expect(saved).not.toContain('cover:');
    expect(saved).toContain('images:');
  });

  it('keeps an untouched list item intact when a sibling item is edited', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    const images = entry.values['images'] as Array<Record<string, unknown>>;
    images[1]!['alt'] = '第二张（改过）';
    await entries.save(entry);
    const saved = adapter.snapshot()['content/albums/paper.md']!;
    expect(saved).toContain('alt: 第二张（改过）');
    // The untouched item keeps its content, including the nested photo block.
    expect(saved).toContain('alt: 第一张');
    expect(saved).toContain('camera: Demo X1');
  });

  it('writes a body change only when asked', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    entry.body = '\n新的说明。\n';
    await entries.save(entry);
    const saved = adapter.snapshot()['content/albums/paper.md']!;
    expect(saved).toContain('新的说明。');
    expect(saved).not.toContain('一个相册示例。');
    expect(saved).toContain("date: '2026-09-01'");
  });

  it('creates a new entry with defaults filled in', async () => {
    const { adapter, entries } = await store({});
    const blank = entries.blank('albums', 'content/albums/new-one.md', {
      title: '新相册',
      slug: 'new-one',
    });
    expect(blank.isNew).toBe(true);
    await entries.save(blank);
    const saved = adapter.snapshot()['content/albums/new-one.md']!;
    expect(saved).toContain('title: 新相册');
    expect(saved).toContain('slug: new-one');
    // Optional blanks stay out of a brand new file too.
    expect(saved).not.toContain('cover:');
  });

  it('refuses to save over a change made elsewhere', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    await adapter.writeFile('content/albums/paper.md', ALBUM.replace('纸面练习', '别人的改动'), {
      message: 'their edit',
      sha: entry.sha,
    });
    entry.values['title'] = '我的改动';
    await expect(entries.save(entry)).rejects.toThrow(/changed since it was read/);
  });

  it('validates against the collection schema and reports the path', async () => {
    const { entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    entry.values['title'] = '';
    (entry.values['images'] as Array<Record<string, unknown>>)[1]!['alt'] = '';
    const issues = entries.validate(entry);
    expect(issues.map((issue) => issue.path).sort()).toEqual(['images.1.alt', 'title']);
  });

  it('does not reject frontmatter it does not describe', async () => {
    const { entries } = await store({
      'content/albums/extra.md': '---\ntitle: 额外\nslug: extra\nsomeFutureKey: 1\n---\n\n正文\n',
    });
    const entry = await entries.load('albums', 'content/albums/extra.md');
    expect(entries.validate(entry)).toEqual([]);
    await entries.save(entry);
    // An unknown key survives a round trip untouched.
    expect(entry.parsed.raw).toContain('someFutureKey: 1');
  });

  it('deletes an entry', async () => {
    const { adapter, entries } = await store();
    const entry = await entries.load('albums', 'content/albums/paper.md');
    await entries.remove(entry);
    expect(adapter.snapshot()['content/albums/paper.md']).toBeUndefined();
  });
});
