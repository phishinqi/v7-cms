import { describe, expect, it, beforeEach } from 'vitest';
import {
  builtInFields,
  fieldTypeNames,
  getFieldType,
  registerFieldType,
  runFieldValidation,
} from '../src/fields-builtin.js';
import type { ValidationIssue } from '../src/fields.js';

const validate = (field: Record<string, unknown>, value: unknown) =>
  runFieldValidation(field as never, value, 'x', {});

const messages = (issues: ValidationIssue[]) => issues.map((issue) => issue.message).join(' | ');

describe('built-in field types', () => {
  it('exposes every type the example config uses', () => {
    for (const name of [
      'string',
      'text',
      'number',
      'boolean',
      'select',
      'datetime',
      'list',
      'object',
      'relation',
      'i18n-string',
    ]) {
      expect(fieldTypeNames()).toContain(name);
    }
  });

  it('keeps the registry ordered so the type list is stable', () => {
    expect(builtInFields.length).toBe(fieldTypeNames().length);
  });

  describe('blank means unset', () => {
    it('treats an empty string, null and undefined as unset', () => {
      const type = getFieldType('string')!;
      expect(type.isEmpty!('')).toBe(true);
      expect(type.isEmpty!('   ')).toBe(true);
      expect(type.isEmpty!(null as never)).toBe(true);
      expect(type.isEmpty!(undefined as never)).toBe(true);
      expect(type.isEmpty!('x')).toBe(false);
    });

    it('does not treat false as unset, because a flag set to false is meaningful', () => {
      expect(getFieldType('boolean')!.isEmpty!(false)).toBe(false);
    });

    it('treats an empty array as unset but a populated one as set', () => {
      const type = getFieldType('list')!;
      expect(type.isEmpty!([])).toBe(true);
      expect(type.isEmpty!(['a'])).toBe(false);
    });

    it('collapses an object only when asked, and only when every child is blank', () => {
      const plain = getFieldType('object')!;
      const collapsing = { ...plain, isEmpty: plain.isEmpty!.bind(null) };
      expect(collapsing.isEmpty!({}, { name: 'o', collapseEmpty: true })).toBe(true);
      expect(collapsing.isEmpty!({ a: '' }, { name: 'o', collapseEmpty: true })).toBe(true);
      expect(collapsing.isEmpty!({ a: 'x' }, { name: 'o', collapseEmpty: true })).toBe(false);
      // Without collapseEmpty an empty object is still written.
      expect(plain.isEmpty!({}, { name: 'o' })).toBe(true);
      expect(plain.isEmpty!({ a: '' }, { name: 'o' })).toBe(false);
    });

    it('treats an i18n object as unset when every locale is blank', () => {
      const type = getFieldType('i18n-string')!;
      expect(type.isEmpty!({ 'zh-CN': '', en: '  ' })).toBe(true);
      expect(type.isEmpty!({ 'zh-CN': '中文', en: '' })).toBe(false);
    });
  });

  describe('required', () => {
    it('reports a missing required scalar using the label', () => {
      expect(
        messages(validate({ name: 'title', label: '标题', widget: 'string', required: true }, '')),
      ).toBe('标题 is required.');
    });

    it('says nothing when the field is optional', () => {
      expect(validate({ name: 'caption', widget: 'string' }, '')).toEqual([]);
    });

    it('reports an empty required list', () => {
      expect(messages(validate({ name: 'tags', widget: 'list', required: true }, []))).toContain(
        'required',
      );
    });
  });

  describe('select', () => {
    it('accepts only declared options', () => {
      expect(validate({ name: 'lang', widget: 'select', options: ['zh-CN', 'en'] }, 'en')).toEqual(
        [],
      );
      expect(
        messages(validate({ name: 'lang', widget: 'select', options: ['zh-CN', 'en'] }, 'fr')),
      ).toContain('must be one of');
    });

    it('accepts labelled options', () => {
      const field = {
        name: 'kind',
        widget: 'select',
        options: [
          { label: '照片', value: 'photo' },
          { label: '创作', value: 'artwork' },
        ],
      };
      expect(validate(field, 'photo')).toEqual([]);
    });
  });

  describe('datetime', () => {
    it('accepts the date-only and timestamp forms the blog uses', () => {
      expect(validate({ name: 'date', widget: 'datetime' }, '2026-09-12')).toEqual([]);
      expect(
        validate({ name: 'pubDate', widget: 'datetime' }, '2026-09-21T09:00:00+08:00'),
      ).toEqual([]);
    });

    it('rejects an unparseable value', () => {
      expect(messages(validate({ name: 'date', widget: 'datetime' }, 'whenever'))).toContain(
        'valid date',
      );
    });
  });

  describe('pattern', () => {
    it('uses the configured message for a slug', () => {
      const field = {
        name: 'slug',
        widget: 'string',
        pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', '使用小写英文、数字和连字符。'],
      };
      expect(validate(field, 'my-post')).toEqual([]);
      expect(messages(validate(field, 'My Post'))).toBe('使用小写英文、数字和连字符。');
    });
  });

  describe('nested validation', () => {
    it('reports the path of a bad list item, not the list', () => {
      const field = {
        name: 'images',
        widget: 'list',
        fields: [
          { name: 'src', widget: 'string', required: true },
          { name: 'alt', widget: 'string', required: true },
        ],
      };
      const issues = runFieldValidation(
        field as never,
        [
          { src: 'a.png', alt: 'ok' },
          { src: 'b.png', alt: '' },
        ],
        'images',
        {},
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]!.path).toBe('images.1.alt');
    });

    it('validates nested objects inside list items', () => {
      const field = {
        name: 'images',
        widget: 'list',
        fields: [
          {
            name: 'photo',
            widget: 'object',
            fields: [{ name: 'camera', widget: 'string', required: true }],
          },
        ],
      };
      const issues = runFieldValidation(field as never, [{ photo: { camera: '' } }], 'images', {});
      expect(issues.map((issue) => issue.path)).toContain('images.0.photo.camera');
    });
  });

  describe('extension', () => {
    beforeEach(() => {
      registerFieldType({ name: 'test-only', isEmpty: (value) => value === '' } as never);
    });

    it('lets a consumer add a field type', () => {
      expect(fieldTypeNames()).toContain('test-only');
    });

    it('falls back to no validation for an unknown widget', () => {
      expect(validate({ name: 'mystery', widget: 'not-registered' }, 'anything')).toEqual([]);
    });
  });
});
