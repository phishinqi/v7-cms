/**
 * Translation lookup and the React binding.
 *
 * `t()` is deliberately not a hook: the connect screen renders before a backend exists, and the
 * field controls are pure presentational components. Both take a translator through context and
 * fall back to English, so a component used outside the provider still renders words rather than
 * blank space.
 */
import { createContext, useContext, useMemo } from 'react';
import { en, locales, type Dictionary, type TranslationKey } from './locales.js';
import type { Locale } from './dictionary.js';

export type { Dictionary, Locale, TranslationKey };
export { en, locales };

/** A lookup function. Missing keys are a type error, so this never returns undefined in practice. */
export type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};

/** Narrow an arbitrary config value to a locale the editor ships. Unknown values fall back. */
export function resolveLocale(value: unknown): Locale {
  return typeof value === 'string' && value in locales ? (value as Locale) : 'en';
}

/**
 * Build a translator for a locale.
 *
 * `values` interpolates `{name}` placeholders, which is what keeps plural-ish strings and counts
 * out of string concatenation in the components.
 */
export function createTranslate(locale: Locale): Translate {
  const dictionary: Dictionary = locales[locale] ?? en;
  return (key, values) => {
    const template = dictionary[key] ?? en[key] ?? key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

const TranslateContext = createContext<Translate>(createTranslate('en'));

export const TranslateProvider = TranslateContext.Provider;

export function useTranslate(): Translate {
  return useContext(TranslateContext);
}

/** A translator plus the locale it came from, memoised so a re-render does not rebuild it. */
export function useTranslator(locale: Locale): Translate {
  return useMemo(() => createTranslate(locale), [locale]);
}

export { TranslateContext };
