/**
 * The built-in field types.
 *
 * These are value-level only: how to read the stored form, how to write it back, and what counts
 * as empty. The visual controls live in `@v7-cms/cms`, which is what keeps this package usable
 * from a Node script.
 */
import type { FieldPath, FieldSpec, FieldType, ValidationIssue } from './fields.js';

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Shared validation for the `required` flag, so every type reports it the same way. */
function requiredIssue(value: unknown, options: FieldSpec, path: FieldPath): ValidationIssue[] {
  if (options.required !== true) return [];
  if (Array.isArray(value) ? value.length === 0 : isBlank(value)) {
    return [
      { level: 'error', message: `${options.label ?? options.name} is required.`, path: path.path },
    ];
  }
  return [];
}

function checkPattern(value: unknown, options: FieldSpec, path: FieldPath): ValidationIssue[] {
  if (typeof value !== 'string' || !options.pattern) return [];
  const [source, message] = options.pattern;
  if (new RegExp(source).test(value)) return [];
  return [{ level: 'error', message: message || `Does not match ${source}.`, path: path.path }];
}

const string: FieldType<string> = {
  name: 'string',
  isEmpty: isBlank,
  validate: (value, options, path) => [
    ...requiredIssue(value, options, path),
    ...checkPattern(value, options, path),
  ],
  summary: (value) => value,
  defaultValue: () => '',
};

const text: FieldType<string> = {
  ...string,
  name: 'text',
};

/** Numbers may arrive as strings from YAML, so they are coerced on read and written as numbers. */
const number: FieldType<number, number | string> = {
  name: 'number',
  isEmpty: (value) => value === undefined || value === null || Number.isNaN(value),
  toValue: (stored) => {
    if (typeof stored !== 'string') return stored;
    const parsed = Number(stored.trim());
    return stored.trim() === '' || Number.isNaN(parsed) ? 0 : parsed;
  },
  toStored: (value) => value,
  validate: (value, options, path) => {
    const issues = requiredIssue(value, options, path);
    if (value !== undefined && value !== null && typeof value === 'number' && Number.isNaN(value)) {
      issues.push({
        level: 'error',
        message: `${options.label ?? options.name} must be a number.`,
        path: path.path,
      });
    }
    return issues;
  },
  summary: (value) => String(value),
  defaultValue: () => 0,
};

const boolean: FieldType<boolean> = {
  name: 'boolean',
  // `false` is a real value, not an absence — writing it is meaningful for a flag like `draft`.
  isEmpty: (value) => value === undefined || value === null,
  validate: () => [],
  summary: (value) => (value ? 'true' : 'false'),
  defaultValue: () => false,
};

const select: FieldType<string> = {
  name: 'select',
  isEmpty: isBlank,
  validate: (value, options: FieldSpec, path) => {
    const issues = requiredIssue(value, options, path);
    if (isBlank(value)) return issues;
    const allowed = (options.options ?? []).map((option: string | { value: string }) =>
      typeof option === 'string' ? option : option.value,
    );
    if (allowed.length && !allowed.includes(value as string)) {
      issues.push({
        level: 'error',
        message: `${options.label ?? options.name} must be one of: ${allowed.join(', ')}.`,
        path: path.path,
      });
    }
    return issues;
  },
  summary: (value) => value,
  defaultValue: () => '',
};

/**
 * Dates keep the value the file used. The blog's frontmatter writes `'2026-09-12'` as a quoted
 * string and full timestamps elsewhere, and both must survive, so this type does not normalise
 * to a `Date`.
 */
const datetime: FieldType<string> = {
  name: 'datetime',
  isEmpty: isBlank,
  validate: (value, options, path) => {
    const issues = requiredIssue(value, options, path);
    if (isBlank(value)) return issues;
    if (Number.isNaN(new Date(String(value)).getTime())) {
      issues.push({
        level: 'error',
        message: `${options.label ?? options.name} must be a valid date.`,
        path: path.path,
      });
    }
    return issues;
  },
  summary: (value) => value,
  defaultValue: () => '',
};

/**
 * A list. Two shapes, matching how the configs are written: `field` for a list of scalars
 * (`tags: ['a', 'b']`), and `fields` for a list of objects (`images: [{ src, alt, … }]`).
 * Both validate their items and report the offending item's path.
 */
const list: FieldType<unknown[]> = {
  name: 'list',
  isEmpty: (value) => !Array.isArray(value) || value.length === 0,
  validate: (value, options: FieldSpec, path) => {
    const issues = requiredIssue(value, options, path);
    if (!Array.isArray(value)) return issues;
    const itemFields = options.fields ?? (options.field ? [options.field] : []);
    if (itemFields.length === 0) return issues;
    value.forEach((item, index) => {
      const itemPath = `${path.path}.${index}`;
      // A list of objects validates each declared field against the item's own keys.
      const targets = options.fields
        ? itemFields.map((field) => ({
            field,
            value: (item as Record<string, unknown> | null)?.[field.name],
            at: `${itemPath}.${field.name}`,
          }))
        : [{ field: itemFields[0]!, value: item, at: itemPath }];
      for (const target of targets) {
        issues.push(...runFieldValidation(target.field, target.value, target.at, path.siblings));
      }
    });
    return issues;
  },
  summary: (value) => `${value.length} item${value.length === 1 ? '' : 's'}`,
  defaultValue: () => [],
};

/**
 * A nested object. `collapseEmpty` is what keeps an all-blank sub-object out of the file —
 * the browser CMS wrote `cover:` with nothing under it, which the site's schema rejects.
 */
const object: FieldType<Record<string, unknown>> = {
  name: 'object',
  isEmpty: (value: Record<string, unknown>, options?: FieldSpec) => {
    if (!value || typeof value !== 'object') return true;
    const entries = Object.entries(value);
    if (entries.length === 0) return true;
    if (options?.collapseEmpty !== true) return false;
    return entries.every(([, item]) => isBlank(item) || (Array.isArray(item) && item.length === 0));
  },
  validate: (value, options: FieldSpec, path) => {
    const issues: ValidationIssue[] = [];
    if (!value || typeof value !== 'object') return issues;
    for (const field of options.fields ?? []) {
      issues.push(
        ...runFieldValidation(
          field,
          (value as Record<string, unknown>)[field.name],
          `${path.path}.${field.name}`,
          path.siblings,
        ),
      );
    }
    return issues;
  },
  summary: (value) => Object.keys(value).join(', '),
  defaultValue: () => ({}),
};

/** A stored reference, validated only for presence; the consumer decides what values are legal. */
const relation: FieldType<string> = {
  name: 'relation',
  isEmpty: isBlank,
  validate: (value, options: FieldSpec, path) => requiredIssue(value, options, path),
  summary: (value) => value,
  defaultValue: () => '',
};

/** An object of `{ locale: string }` pairs, e.g. `{ "zh-CN": "…", en: "…" }`. */
const i18nString: FieldType<Record<string, string>> = {
  name: 'i18n-string',
  isEmpty: (value) =>
    !value || typeof value !== 'object' || Object.values(value).every((item) => isBlank(item)),
  validate: (value, options: FieldSpec, path) => {
    const issues: ValidationIssue[] = [];
    if (options.required !== true) return issues;
    const locales = options.locales ?? ['zh-CN', 'en'];
    for (const locale of locales) {
      if (isBlank(value?.[locale])) {
        issues.push({
          level: 'error',
          message: `${options.label ?? options.name} needs a value for ${locale}.`,
          path: `${path.path}.${locale}`,
        });
      }
    }
    return issues;
  },
  summary: (value) => Object.values(value ?? {}).find((item) => !isBlank(item)) ?? '',
  defaultValue: () => ({}),
};

/** Registered by name so configs can refer to a type the CMS knows about. */
export const builtInFields: FieldType<never>[] = [
  string as FieldType<never>,
  text as FieldType<never>,
  number as FieldType<never>,
  boolean as FieldType<never>,
  select as FieldType<never>,
  datetime as FieldType<never>,
  list as FieldType<never>,
  object as FieldType<never>,
  relation as FieldType<never>,
  i18nString as FieldType<never>,
];

const registry = new Map(builtInFields.map((field) => [field.name, field]));

/** Add a field type. Consumers call this to extend the CMS with their own. */
export function registerFieldType(field: FieldType<never>): void {
  registry.set(field.name, field);
}

export function getFieldType(name: string): FieldType<never> | undefined {
  return registry.get(name);
}

export function fieldTypeNames(): string[] {
  return [...registry.keys()].sort();
}

/**
 * Validate one value against one field's spec. Used by the field types above for nested values,
 * and by the editor for top-level ones, so a `required` inside a list item behaves exactly like
 * one at the top level.
 */
export function runFieldValidation(
  field: FieldSpec,
  value: unknown,
  path: string,
  siblings: Readonly<Record<string, unknown>>,
): ValidationIssue[] {
  const type = getFieldType(field.widget ?? 'string');
  if (!type?.validate) return [];
  return type.validate(value as never, field, { path, siblings });
}
