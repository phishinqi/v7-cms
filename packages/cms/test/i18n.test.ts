/**
 * The editor's own language.
 *
 * These tests exist because `config.locale` was previously inert: the field was accepted, stored
 * and never read, so a Chinese site got an English editor and nothing failed. The contract now is
 * that every locale covers every key, and that an unknown locale degrades instead of blanking the
 * interface.
 */
import { describe, expect, it } from 'vitest';
import {
  createTranslate,
  LOCALE_NAMES,
  locales,
  resolveLocale,
  type TranslationKey,
} from '../src/i18n/index.js';

const keysOf = (dictionary: Record<string, string>) => Object.keys(dictionary).sort();

describe('dictionaries', () => {
  it('covers exactly the same keys in every locale', () => {
    const english = keysOf(locales.en);
    for (const [locale, dictionary] of Object.entries(locales)) {
      expect(keysOf(dictionary), `${locale} key set differs from en`).toEqual(english);
    }
  });

  it('has no empty translations', () => {
    for (const [locale, dictionary] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${locale} → ${key} is empty`).not.toBe('');
      }
    }
  });

  it('actually translates: zh-CN differs from en on the interface strings', () => {
    // A dictionary that merely copied English would satisfy the key check and still be useless.
    const differing = keysOf(locales.en).filter(
      (key) => locales['zh-CN'][key as TranslationKey] !== locales.en[key as TranslationKey],
    );
    // A brand, a product name and a file format are the same word in every language.
    const allowedSame = new Set(['nav.brand', 'preview.rendered']);
    const untranslated = keysOf(locales.en).filter((key) => !differing.includes(key));
    for (const key of untranslated) {
      expect(allowedSame.has(key), `${key} was not translated into zh-CN`).toBe(true);
    }
  });

  it('names every locale for a switcher', () => {
    for (const locale of Object.keys(locales)) {
      expect(LOCALE_NAMES[locale as keyof typeof LOCALE_NAMES]).toBeTruthy();
    }
  });
});

describe('resolveLocale', () => {
  it('accepts a shipped locale', () => {
    expect(resolveLocale('zh-CN')).toBe('zh-CN');
    expect(resolveLocale('en')).toBe('en');
  });

  it('falls back to English for anything else, rather than rendering nothing', () => {
    for (const value of [undefined, null, '', 'fr', 'zh-TW', 42, {}]) {
      expect(resolveLocale(value)).toBe('en');
    }
  });
});

describe('createTranslate', () => {
  it('returns the requested language', () => {
    expect(createTranslate('zh-CN')('action.save')).toBe('保存');
    expect(createTranslate('en')('action.save')).toBe('Save');
  });

  it('interpolates values without touching unknown placeholders', () => {
    const t = createTranslate('zh-CN');
    expect(t('connect.openRepo', { repo: 'owner/name' })).toBe('打开 owner/name');
    // A placeholder with no matching value is left as-is, so the string stays diagnosable.
    expect(t('connect.openRepo')).toContain('{repo}');
  });

  it('never returns an empty string for a known key', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      const t = createTranslate(locale);
      for (const key of keysOf(locales.en) as TranslationKey[]) {
        expect(t(key).trim(), `${locale} → ${key}`).not.toBe('');
      }
    }
  });
});
