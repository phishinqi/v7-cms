// @vitest-environment jsdom
/**
 * Inferring a settings form from the file itself.
 *
 * The fixture is the real `site.config.json` from the theme, because that is the file this has to
 * work on: a mix of plain strings, localized objects, arrays of objects, booleans and numbers. A
 * test against a toy object would pass while the real one rendered nothing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferFields, normalizeInferredValues } from '../src/frame/infer-schema.js';
import type { Field } from '@v7-cms/core';

/** A copy of the theme's settings file, so this test does not reach into another repository. */
const themeSettings = JSON.parse(
  readFileSync('packages/cms/test/fixtures/site.config.json', 'utf8'),
) as Record<string, unknown>;

const byName = (fields: Field[], name: string) => fields.find((field) => field.name === name)!;

describe('inferring a settings form', () => {
  it('reads every top-level key, in the file order', () => {
    const fields = inferFields(themeSettings);
    expect(fields.map((field) => field.name)).toEqual(Object.keys(themeSettings));
  });

  describe('widgets', () => {
    const fields = inferFields(themeSettings);

    it('gives a boolean a checkbox', () => {
      expect(byName(fields, 'startedAt').widget).toBe('datetime');
      expect(byName(fields, 'postsPerPage').widget).toBe('number');
    });

    it('recognises a localized object', () => {
      const description = byName(fields, 'description');
      expect(description.widget).toBe('i18n-string');
      // The locales come from the file, so adding one needs no config change.
      expect((description as { locales?: string[] }).locales).toEqual(['zh-CN', 'en']);
    });

    it('recognises a nested localized object', () => {
      const intro = byName(fields, 'intro');
      expect(intro.widget).toBe('object');
      expect(intro.fields!.find((field) => field.name === 'title')!.widget).toBe('i18n-string');
    });

    it('makes a list of objects a list with its item shape', () => {
      const nav = byName(fields, 'nav');
      expect(nav.widget).toBe('list');
      expect(nav.fields!.map((field) => field.name)).toEqual(['href', 'label']);
      // And the localized label inside it is still recognized.
      expect(nav.fields!.find((field) => field.name === 'label')!.widget).toBe('i18n-string');
    });

    it('makes a list of scalars a list of text', () => {
      const social = byName(fields, 'socialLinks');
      expect(social.widget).toBe('list');
      expect(social.fields!.map((field) => field.name)).toEqual(['label', 'href']);
    });

    it('recognises legacy Markdown social links as link objects', () => {
      const legacy = inferFields({
        socialLinks: [
          '[https://blog.soyonagasaki.com/rss.xml](https://blog.soyonagasaki.com/rss.xml)',
        ],
      });
      expect(byName(legacy, 'socialLinks').fields!.map((field) => field.name)).toEqual([
        'label',
        'href',
      ]);
    });

    it('infers an empty list without failing', () => {
      const fields = inferFields({ tags: [], title: 'x' });
      expect(byName(fields, 'tags').widget).toBe('list');
    });

    it('treats anything it cannot classify as text, which is always editable', () => {
      const fields = inferFields({ siteURL: 'https://example.com', weird: null });
      expect(byName(fields, 'siteURL').widget).toBe('string');
      expect(byName(fields, 'weird').widget).toBe('string');
    });

    it('only treats a real date string as a date', () => {
      const fields = inferFields({ a: '2026-09-28', b: '2026-09-28T09:00:00+08:00', c: 'v7' });
      expect(byName(fields, 'a').widget).toBe('datetime');
      expect(byName(fields, 'b').widget).toBe('datetime');
      expect(byName(fields, 'c').widget).toBe('string');
    });
  });

  describe('overrides', () => {
    it('overrides a widget at a literal path', () => {
      const fields = inferFields(
        { startedAt: 'nonsense' },
        {
          startedAt: { widget: 'datetime', format: 'YYYY-MM-DD' },
        },
      );
      expect(byName(fields, 'startedAt').widget).toBe('datetime');
    });

    it('overrides every item when the path has a wildcard', () => {
      const fields = inferFields(
        { nav: [{ href: '/a/', label: 'A' }] },
        { 'nav.*.label': { widget: 'i18n-string' } },
      );
      const nav = byName(fields, 'nav');
      expect(nav.fields!.find((field) => field.name === 'label')!.widget).toBe('i18n-string');
    });

    it('prefers a literal path over a wildcard one', () => {
      const fields = inferFields(
        { nav: [{ label: 'A', href: '/a/' }] },
        {
          'nav.*.href': { widget: 'text' },
          'nav.*.label': { widget: 'i18n-string' },
        },
      );
      const nav = byName(fields, 'nav');
      expect(nav.fields!.find((field) => field.name === 'href')!.widget).toBe('text');
      expect(nav.fields!.find((field) => field.name === 'label')!.widget).toBe('i18n-string');
    });

    it('ignores an override whose path does not exist', () => {
      const fields = inferFields({ title: 'x' }, { 'missing.path': { widget: 'number' } });
      expect(byName(fields, 'title').widget).toBe('string');
    });

    it('can override a label, so a form can read in the author’s language', () => {
      const fields = inferFields(
        { startedAt: '2026-01-01' },
        {
          startedAt: { label: '开始记录的日期' },
        },
      );
      expect(byName(fields, 'startedAt').label).toBe('开始记录的日期');
    });
  });

  it('never marks an inferred field required, since the file already has a value', () => {
    const fields = inferFields(themeSettings);
    for (const field of fields) expect(field.required).toBe(false);
    const nav = byName(fields, 'nav');
    for (const child of nav.fields!) expect(child.required).toBe(false);
  });

  it('upgrades legacy Markdown social links without touching other settings', () => {
    const normalized = normalizeInferredValues({
      title: 'V7',
      socialLinks: [
        '[https://blog.soyonagasaki.com/rss.xml](https://blog.soyonagasaki.com/rss.xml)',
        '[https://x.com/Ryokoukiryu](https://x.com/Ryokoukiryu)',
        'https://x.com/astraruri',
      ],
    });
    expect(normalized).toEqual({
      title: 'V7',
      socialLinks: [
        { label: 'RSS', href: 'https://blog.soyonagasaki.com/rss.xml' },
        { label: 'Ryokoukiryu', href: 'https://x.com/Ryokoukiryu' },
        { label: 'astraruri', href: 'https://x.com/astraruri' },
      ],
    });
  });
});
