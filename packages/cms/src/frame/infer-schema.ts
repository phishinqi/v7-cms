/**
 * Deriving a form from a file's current contents.
 *
 * A site's settings file changes shape as the site grows, and writing a field definition for every
 * key is busywork that goes stale. So the editor reads the file and infers a form: objects recurse,
 * arrays take their item shape from the first element, and a couple of conventions are recognised
 * (`{ "zh-CN": …, "en": … }` is a localized string).
 *
 * The inference is deliberately conservative. Anything it cannot classify becomes a text field,
 * which is always editable, and the original value is never discarded — a consumer can refine the
 * result with `fieldOverrides` rather than being stuck with a guess.
 */
import type { Field } from '@v7-cms/core';

/** A value that is a `{ locale: string }` object, which is how this project localizes text. */
function isLocalized(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length < 2) return false;
  return entries.every(
    ([key, item]) => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(key) && typeof item === 'string',
  );
}

/** A value that is an array of objects sharing a shape, which is how lists are usually written. */
function isObjectArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
  );
}

const READABLE = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());

/**
 * Infer a field for one value. `path` is the dotted path from the file's root, used only to look
 * up an override.
 */
export function inferField(
  name: string,
  value: unknown,
  path: string,
  overrides: Record<string, Partial<Field>>,
): Field {
  const base: Field = { name, label: READABLE(name), widget: 'string' };
  const inferred = inferWidget(name, value, path, overrides);
  const override = findOverride(path, overrides);
  // An override wins, including over an inferred nested shape, so a consumer can force a widget
  // anywhere without the inference having to anticipate it.
  return { ...base, ...inferred, ...override } as Field;
}

function inferWidget(
  name: string,
  value: unknown,
  path: string,
  overrides: Record<string, Partial<Field>>,
): Partial<Field> {
  if (isLocalized(value)) {
    return {
      widget: 'i18n-string',
      required: false,
      locales: Object.keys(value),
    } as Partial<Field>;
  }

  if (Array.isArray(value)) {
    if (isObjectArray(value)) {
      const [first] = value;
      return {
        widget: 'list',
        required: false,
        // Items are addressed by `*`, since the path describes the shape rather than one entry.
        fields: Object.entries(first ?? {}).map(([key, item]) =>
          inferField(key, item, `${path}.*.${key}`, overrides),
        ),
        labelSingular: READABLE(singular(name)),
      } as Partial<Field>;
    }
    // A list of scalars and an empty list are both edited as a list of text.
    return {
      widget: 'list',
      required: false,
      field: { name: 'item', label: READABLE(singular(name)), widget: 'string', required: false },
      labelSingular: READABLE(singular(name)),
    } as Partial<Field>;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      widget: 'object',
      required: false,
      collapsed: entries.length > 4,
      fields: entries.map(([key, item]) => inferField(key, item, `${path}.${key}`, overrides)),
    } as Partial<Field>;
  }

  if (typeof value === 'boolean') return { widget: 'boolean', required: false, default: value };
  if (typeof value === 'number') return { widget: 'number', required: false };
  if (typeof value === 'string' && looksLikeDate(value)) {
    return { widget: 'datetime', required: false, format: 'YYYY-MM-DD' } as Partial<Field>;
  }
  return { widget: 'string', required: false };
}

/** `2026-09-28` or a full timestamp with a zone. Anything else stays a string. */
function looksLikeDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value);
}

/** `nav` -> `nav`, `entries` -> `entry`: only used for a list's singular label. */
function singular(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

/**
 * Find an override for a path. `*` matches one segment, so `nav.*.label` covers every item of
 * `nav`. A literal path wins over a wildcard one, so a specific rule can refine a general one.
 */
function findOverride(
  path: string,
  overrides: Record<string, Partial<Field>>,
): Partial<Field> | undefined {
  if (Object.keys(overrides).length === 0) return undefined;
  const segments = path.split('.');
  let wildcard: Partial<Field> | undefined;
  for (const [pattern, override] of Object.entries(overrides)) {
    const parts = pattern.split('.');
    if (parts.length !== segments.length) continue;
    const matches = parts.every((part, index) => part === '*' || part === segments[index]);
    if (!matches) continue;
    if (!parts.includes('*')) return override;
    wildcard = override;
  }
  return wildcard;
}

/**
 * Infer every top-level field of a settings file. Keys are taken in their existing order, so the
 * form matches the file a reader would see.
 */
export function inferFields(
  contents: Record<string, unknown>,
  overrides: Record<string, Partial<Field>> = {},
): Field[] {
  return Object.entries(contents).map(([name, value]) => inferField(name, value, name, overrides));
}
