/**
 * The config a consumer writes. Everything the CMS does is derived from this object; the CMS
 * itself never mentions a specific collection or field name.
 */
import type { CommonFieldOptions } from './fields.js';

export interface LocalizedString {
  [locale: string]: string;
}

export interface BackendConfig {
  /** `github` talks to the REST API. `local` uses a browser directory or the local proxy. */
  name: 'github' | 'local';
  /** `owner/repo`, required for the github backend. */
  repo?: string;
  branch?: string;
  /** Base of the OAuth relay, e.g. `https://example.com`. Omit to use a personal access token. */
  authBase?: string;
  /**
   * Path of the relay's endpoint on that base. Defaults to `auth`. A relay mounted under a prefix
   * — `/api/auth`, say — needs this, and without it the sign-in popup is a 404.
   */
  authEndpoint?: string;
  /** Where the local backend reads and writes. */
  local?: {
    /** `memory` backs the tests, demos and previews; the others are real file access. */
    kind: 'fs-access' | 'proxy' | 'memory';
    url?: string;
    /** Seed files for the memory backend, keyed by repository path. */
    files?: Record<string, string>;
  };
}

export type MediaProvider = 'repo' | 's3';

export interface MediaConfig {
  provider: MediaProvider;
  /** Path inside the repository, supports `{{slug}}` and `{{collection}}`. */
  repoPath?: string;
  /** Public URL prefix for the same files, e.g. `/images/albums/{{slug}}`. */
  publicPath?: string;
  /** Longest edge in pixels for uploaded images. */
  maxEdge?: number;
  /** Read EXIF from uploads to prefill photographic fields. */
  exif?: boolean;
  /** Object storage settings, used when `provider` is `s3`. */
  s3?: {
    endpoint: string;
    bucket: string;
    publicBase: string;
  };
}

/** A field in a collection's schema. `widget` selects the field type. */
export interface Field extends CommonFieldOptions {
  /** Nested fields for `object` and for the item shape of `list`. */
  fields?: Field[];
  /** Item field for a scalar `list`, e.g. a list of strings. */
  field?: Field;
  options?: Array<string | { label: string; value: string }>;
  /** Default value written when a new entry or list item is created. */
  default?: unknown;
  /** For `object`: omit the whole object when every child is empty. */
  collapseEmpty?: boolean;
  /** For `relation`: which collection to draw values from. */
  collection?: string;
  valueField?: string;
  displayFields?: string[];
  /** For `date`: output format. */
  format?: string;
  /** Regex the value must match, plus the message to show when it does not. */
  pattern?: [string, string];
  /** Singular label for a list's add button, e.g. "Add 图片". */
  labelSingular?: string;
  /** Free-form options passed through to the field type. */
  [key: string]: unknown;
}

export interface CollectionBase {
  name: string;
  label: string;
  labelSingular?: string;
  /** Directory the entries live in, relative to the repository root. */
  folder: string;
  /** Which file extension new entries get. */
  extension: 'md' | 'mdx' | 'json' | 'yaml';
  format: 'frontmatter' | 'json';
  /** Field whose value names an entry, used in URLs and in the entry list. */
  identifierField?: string;
  /** Field holding the body; omit for data-only collections. */
  contentField?: string;
  /** Allow entries in subdirectories of `folder`. */
  nested?: boolean;
  media?: Partial<MediaConfig>;
  fields: Field[];
}

export interface FieldsCollection extends CollectionBase {
  kind: 'fields';
  create?: boolean;
}

export interface FileEntry {
  name: string;
  label: string;
  /** Single file this entry edits, relative to the repository root. */
  file: string;
  fields?: Field[];
  /** Derive the field list from the file's current contents instead of declaring it. */
  inferSchema?: boolean;
  /**
   * Edit the file as one block of source text rather than as a form of fields.
   *
   * Files that are not data need this: an MDX page is a document, and its content is the whole
   * file, so a form cannot describe it and parsing it into keys would be wrong. The editor shows a
   * source editor and writes the text back unchanged, which is the same guarantee a body field
   * makes. `inferSchema` and `fields` are ignored when this is set.
   */
  source?: boolean;
  /** Override inferred fields by path, with `*` matching one segment. */
  fieldOverrides?: Record<string, Partial<Field>>;
}

export interface FileCollection {
  kind: 'file';
  name: string;
  label: string;
  format?: 'yaml' | 'json';
  files: FileEntry[];
}

export type Collection = FieldsCollection | FileCollection;
export type FieldsCollectionItem = FieldsCollection;
export type FileCollectionItem = FileCollection;

export interface PreviewConfig {
  /** Dev server to embed, e.g. `http://localhost:4321`. */
  devServerURL?: string;
  /** URL of an entry inside that server, with `{{slug}}` and `{{collection}}` placeholders. */
  pathTemplate?: string;
  /**
   * In-context editing: the attribute the site marks editable nodes with.
   *
   * A theme opts in by rendering `data-v7-field="title"` on the element that shows that field — the
   * value is the dotted frontmatter path. The editor then outlines those nodes in the embedded
   * page, and clicking one focuses the matching control.
   *
   * Off unless a site asks for it, because it can only work when the site cooperates: an editor
   * that guessed which node showed which field would be wrong often enough to be worse than none.
   */
  editAttribute?: string;
}

export interface CMSConfig {
  backend: BackendConfig;
  media?: MediaConfig;
  collections: Collection[];
  /** UI language. Built in: `en`, `zh-CN`. */
  locale?: string;
  /** Turn on draft branches and review status. */
  editorialWorkflow?: boolean;
  preview?: PreviewConfig;
  /** Consumer plugins: custom field types, preview renderers, UI slots. */
  plugins?: unknown[];
}
