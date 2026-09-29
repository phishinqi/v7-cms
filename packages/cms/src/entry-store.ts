/**
 * Entries: the bridge between a config, a storage backend and the serialised file.
 *
 * Everything here is backend-agnostic and DOM-free, so the same code drives the browser editor,
 * the tests and (later) any Node tooling. The rule it exists to protect: reading an entry and
 * writing it back without edits must not change the file.
 */
import {
  deleteValue,
  parseEntry,
  readData,
  serializeEntry,
  setValue,
  type ParsedEntry,
} from '@v7-cms/core/serialize';
import { getFieldType, runFieldValidation } from '@v7-cms/core';
import type { Collection, FieldsCollection, Field } from '@v7-cms/core';
import { NotFoundError, type StorageAdapter } from '@v7-cms/core/storage';

export interface EntrySummary {
  /** Repository path, which is also the entry's identity on disk. */
  path: string;
  /** Value of the collection's identifier field, or the file name when it has none. */
  id: string;
  /** Best available human label, from the first text-ish field that has a value. */
  label: string;
}

export interface LoadedEntry {
  collection: FieldsCollection;
  path: string;
  id: string;
  /** The parsed file, kept so writing can preserve everything not edited. */
  parsed: ParsedEntry;
  /** The current frontmatter values, including keys the config does not describe. */
  values: Record<string, unknown>;
  /** Raw body text (everything after the frontmatter). */
  body: string;
  /** Backend handle for optimistic concurrency. */
  sha?: string;
  /** True when this path did not exist before, so saving creates it. */
  isNew: boolean;
  /** Set when the file's frontmatter could not be parsed. */
  error?: string;
}

export class EntryStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly collections: Collection[],
  ) {}

  fieldsCollections(): FieldsCollection[] {
    return this.collections.filter(
      (collection): collection is FieldsCollection => collection.kind === 'fields',
    );
  }

  collection(name: string): FieldsCollection | undefined {
    return this.fieldsCollections().find((collection) => collection.name === name);
  }

  /** Every entry in a collection, newest first when a date-ish field exists. */
  async list(collectionName: string): Promise<EntrySummary[]> {
    const collection = this.collection(collectionName);
    if (!collection) throw new Error(`Unknown collection "${collectionName}".`);
    const paths = await this.walk(collection.folder);
    const summaries: EntrySummary[] = [];
    for (const path of paths) {
      if (extensionOf(path) !== collection.extension) continue;
      // A collection that does not allow nesting only owns the files directly in its folder.
      if (!collection.nested && path.slice(collection.folder.length + 1).includes('/')) continue;
      summaries.push(await this.summarise(collection, path));
    }
    return summaries;
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await this.storage.listDir(dir).catch(() => []);
    const paths: string[] = [];
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.type === 'dir') paths.push(...(await this.walk(path)));
      else paths.push(path);
    }
    return paths;
  }

  private async summarise(collection: FieldsCollection, path: string): Promise<EntrySummary> {
    const fallback =
      path
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? path;
    try {
      const file = await this.storage.readFile(path);
      const values = readData(parseEntry(file.text));
      return {
        path,
        id: identifierOf(collection, values, fallback),
        label: labelOf(values, fallback),
      };
    } catch {
      return { path, id: fallback, label: fallback };
    }
  }

  async load(collectionName: string, path: string): Promise<LoadedEntry> {
    const collection = this.collection(collectionName);
    if (!collection) throw new Error(`Unknown collection "${collectionName}".`);
    const file = await this.storage.readFile(path);
    const parsed = parseEntry(file.text);
    return {
      collection,
      path,
      id: identifierOf(collection, readData(parsed), baseName(path)),
      parsed,
      values: readData(parsed),
      body: parsed.bodyRaw,
      ...(file.sha === undefined ? {} : { sha: file.sha }),
      isNew: false,
    };
  }

  /** A blank entry for a path that does not exist yet. */
  blank(collectionName: string, path: string, values: Record<string, unknown> = {}): LoadedEntry {
    const collection = this.collection(collectionName);
    if (!collection) throw new Error(`Unknown collection "${collectionName}".`);
    // Only real defaults are seeded. A field with no default stays absent, so a new entry does
    // not carry a row of empty keys the user never filled in.
    const seed: Record<string, unknown> = {};
    for (const field of collection.fields) {
      if (field.default !== undefined) seed[field.name] = field.default;
    }
    const merged = { ...seed, ...values };
    const text = serializeValues(collection, merged, '');
    const parsed = parseEntry(text);
    return {
      collection,
      path,
      id: identifierOf(collection, merged, baseName(path)),
      parsed,
      values: merged,
      body: '',
      isNew: true,
    };
  }

  /**
   * Persist an entry.
   *
   * Only fields whose value actually differs from what was loaded are written back. That matters
   * more than it looks: assigning a whole list rebuilds it, and rebuilding turns an inline
   * `photo: { camera: X }` into a block map — a formatting change the user never asked for. Fields
   * that are now unset are removed rather than blanked, which is what stops an empty `cover:`
   * appearing with nothing under it.
   */
  async save(entry: LoadedEntry, options: { message?: string } = {}): Promise<LoadedEntry> {
    // A new entry starts from an empty document: `entry.parsed` was seeded with the same values
    // the caller is about to write, so writing from it would look like a no-op and save nothing.
    const target = entry.isNew ? parseEntry('---\n---\n') : entry.parsed;
    const original = entry.isNew ? {} : readData(entry.parsed);
    for (const field of entry.collection.fields) {
      const value = entry.values[field.name];
      const type = getFieldType(field.widget ?? 'string');
      if (type?.isEmpty?.(value as never) ?? value === undefined) {
        deleteValue(target, field.name);
        continue;
      }
      if (!entry.isNew && sameValue(value, original[field.name])) continue;
      setValue(target, field.name, value);
    }
    const text = serializeEntry(target, entry.body);
    const result = await this.storage.writeFile(entry.path, text, {
      message: options.message ?? `Update ${baseName(entry.path)}`,
      ...(entry.sha === undefined ? {} : { sha: entry.sha }),
    });
    const reparsed = parseEntry(text);
    return {
      ...entry,
      parsed: reparsed,
      values: readData(reparsed),
      ...(result.sha === undefined ? {} : { sha: result.sha }),
      isNew: false,
    };
  }

  async remove(entry: LoadedEntry): Promise<void> {
    if (entry.isNew) return;
    await this.storage.deleteFile(entry.path, {
      message: `Delete ${baseName(entry.path)}`,
      ...(entry.sha === undefined ? {} : { sha: entry.sha }),
    });
  }

  /**
   * Validate an entry against its collection. Unknown keys are ignored on purpose: a CMS that
   * rejects frontmatter it does not describe cannot edit a repository it did not create.
   */
  validate(entry: LoadedEntry): Array<{ path: string; message: string }> {
    const issues: Array<{ path: string; message: string }> = [];
    for (const field of entry.collection.fields) {
      issues.push(
        ...runFieldValidation(
          field as Field & Record<string, unknown>,
          entry.values[field.name],
          field.name,
          entry.values,
        ).map((issue) => ({ path: issue.path ?? field.name, message: issue.message })),
      );
    }
    return issues;
  }
}

export function extensionOf(path: string): string {
  return path.split('.').pop() ?? '';
}

export function baseName(path: string): string {
  return (
    path
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? path
  );
}

function identifierOf(
  collection: FieldsCollection,
  values: Record<string, unknown>,
  fallback: string,
): string {
  const field = collection.identifierField ?? 'slug';
  const value = values[field];
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * A readable label for lists and headings: the identifier when it is set, otherwise the first
 * populated text field. Avoids showing a file path where a title exists.
 */
function labelOf(values: Record<string, unknown>, fallback: string): string {
  for (const key of ['title', 'name', 'label', 'slug']) {
    const value = values[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return fallback;
}

/** Render values into a fresh file body, used for new entries and for previews. */
function serializeValues(
  collection: FieldsCollection,
  values: Record<string, unknown>,
  body: string,
): string {
  const parsed = parseEntry('---\n---\n');
  for (const field of collection.fields) {
    const value = values[field.name];
    const type = getFieldType(field.widget ?? 'string');
    if (type?.isEmpty?.(value as never) ?? value === undefined) continue;
    setValue(parsed, field.name, value);
  }
  void collection;
  return serializeEntry(parsed, body);
}

/** Re-export so callers do not need to reach into core for the common case. */
export { NotFoundError };

/** Structural equality for frontmatter values, used to skip fields the user did not touch. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      // A key present on one side only is a real difference, unless both are blank.
      if (!sameValue(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}
