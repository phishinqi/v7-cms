/**
 * The field type contract.
 *
 * A field type is the smallest unit of extension: it knows how to read a stored value, how to
 * write it back, and how to validate it. It deliberately says nothing about rendering — that is
 * the widget layer's job (see `packages/cms`), so `core` stays free of DOM and React and can be
 * reused from Node scripts.
 */

/** Where a value lives, for error messages and for fields that need sibling values. */
export interface FieldPath {
  /** Dotted path inside the entry, e.g. `images.0.photo.camera`. */
  readonly path: string;
  /** The entry's raw frontmatter, so a field can consult its siblings. */
  readonly siblings: Readonly<Record<string, unknown>>;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  /** Dotted path of the offending value; defaults to the field's own path. */
  path?: string;
}

/** Options every field shares. Field types extend this with their own. */
export interface CommonFieldOptions {
  name: string;
  label?: string;
  required?: boolean;
  hint?: string;
  /** Shown in list summaries. Falls back to the field's own `summary()`. */
  widget?: string;
}

/**
 * The shape a field type must implement.
 *
 * `TStored` is the value as it appears in the file; `TValue` is the value the editor works with.
 * For most types they are the same and `toValue`/`toStored` can be omitted.
 */
export interface FieldType<TValue = unknown, TStored = TValue> {
  /** Registry name, e.g. `string`, `date`, `image`. */
  readonly name: string;

  /**
   * Whether this value should be omitted from the file entirely. Returning true means "the user
   * has not set this", which is what keeps optional keys out of the output rather than writing
   * them as empty strings — the blog's build treats `''` and a missing key differently.
   */
  isEmpty?(value: TValue): boolean;

  /** File value -> editor value. Omit when the two are identical. */
  toValue?(stored: TStored): TValue;

  /** Editor value -> file value. Omit when the two are identical. */
  toStored?(value: TValue, context: { originalStyle?: ScalarStyle }): TStored;

  /** Validation runs on the editor value. */
  validate?(value: TValue, options: CommonFieldOptions, path: FieldPath): ValidationIssue[];

  /** One-line label for the entry list and for collapsed list items. */
  summary?(value: TValue, options: CommonFieldOptions): string;

  /** A value to use when the user adds a new item. */
  defaultValue?(): TValue;
}

/**
 * How a scalar was written in the source file, so that editing a value does not silently change
 * its style. `'2026-09-12'` and `2026-09-12` mean different things to some consumers, and the
 * blog's content mixes both.
 */
export interface ScalarStyle {
  quote: 'single' | 'double' | false;
}
