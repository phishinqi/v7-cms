/**
 * Format checks an author can act on before they hit Save.
 *
 * These are not style opinions. Prettier owns style, and it runs in CI; what this module catches is
 * the much smaller set of shapes that break something — a file whose body will be written back as
 * frontmatter, a line ending the byte-faithful writer cannot round-trip in one piece. Every check
 * here has a known failure behind it, and none of them needs a Node process, so the editor can run
 * them on every keystroke.
 *
 * The rules are deliberately narrow. A CMS that refuses to save because it dislikes the formatting
 * is worse than one that saves, and reporting a "problem" that the author cannot see in the file is
 * how people learn to ignore the warnings entirely.
 */
import { isMap } from 'yaml';
import { parseEntry, type ParsedEntry } from './serialize/entry.js';

/** What kind of shape the check objected to, so the interface can group or filter them. */
export type FormatIssueKind = 'frontmatter' | 'newline';

export interface FormatIssue {
  /** Dotted path of the offending field, or `''` for the file as a whole. */
  path: string;
  /** What is wrong, in the author's terms. */
  message: string;
  kind: FormatIssueKind;
  /** One of the reason codes below, so tests and translations do not match on prose. */
  code: FormatIssueCode;
}

export type FormatIssueCode =
  | 'missing-frontmatter'
  | 'scalar-frontmatter'
  | 'body-looks-like-frontmatter'
  | 'mixed-line-endings'
  | 'no-trailing-newline';

export interface FormatCheckOptions {
  /** File extension, used to decide whether frontmatter is expected at all. */
  extension?: string;
  /**
   * Whether the collection declares a `contentField`. When it does, the author is shown a separate
   * body control, and a file with no frontmatter would put the whole document in that one box.
   */
  expectsBody?: boolean;
}

/**
 * Check one parsed entry.
 *
 * Returns an empty array for the ordinary file, which is what almost every entry is — the checks
 * only speak up when the file's shape disagrees with how the collection is configured.
 */
export function checkEntryFormat(
  entry: ParsedEntry,
  options: FormatCheckOptions = {},
): FormatIssue[] {
  return [
    ...checkFrontmatter(entry, options),
    ...checkLineEndings(entry.raw),
    ...checkTrailingNewline(entry.raw),
  ];
}

/**
 * Check a file that is edited as one block of source rather than parsed into fields.
 *
 * Only the line-ending checks apply: with no parsing there is no frontmatter to be wrong about, and
 * a whole-file editor will not mistake prose for metadata. What still matters is that the bytes go
 * back out the way they came in.
 */
export function checkEntryFormatForSource(raw: string, file?: string): FormatIssue[] {
  const extension = file?.split('.').pop();
  return [
    ...checkLineEndings(raw),
    ...checkTrailingNewline(raw),
    ...(isMarkdown(extension) ? checkEntryFormatForBody(stripFrontmatter(raw)) : []),
  ];
}

/** The body of a Markdown document, so a body-only check is not fooled by real frontmatter. */
function stripFrontmatter(raw: string): string {
  const entry = parseEntry(raw);
  return entry.hasFrontmatter ? entry.bodyRaw : raw;
}

function checkFrontmatter(entry: ParsedEntry, options: FormatCheckOptions): FormatIssue[] {
  // A JSON or YAML collection has no frontmatter to be missing; only Markdown does.
  if (!isMarkdown(options.extension)) return [];
  const issues: FormatIssue[] = [];

  if (!entry.hasFrontmatter) {
    // Not a defect on its own — content/pages/*.mdx is legitimately a whole document. It only
    // matters when the collection models the file as fields with a separate body, because then the
    // editor shows one giant body box and none of the declared fields.
    if (options.expectsBody) {
      issues.push({
        path: '',
        kind: 'frontmatter',
        code: 'missing-frontmatter',
        message:
          "This file has no frontmatter, so the whole document is treated as the body and the collection's fields cannot be filled in. Add a `---` block, or model the file as a `file` collection.",
      });
    }
    return issues;
  }

  const contents = entry.document.contents;
  if (contents !== null && !isMap(contents)) {
    issues.push({
      path: '',
      kind: 'frontmatter',
      code: 'scalar-frontmatter',
      message:
        'The frontmatter is not a set of keys. Writing a field will turn it into one and keep the old text as a comment.',
    });
  }

  return issues;
}

/**
 * A body that begins with `---` is the shape that used to be read as frontmatter. It is safe now,
 * but it is worth saying out loud: the author is one bad edit away from a file whose body and
 * metadata are not where they think.
 */
export function checkEntryFormatForBody(body: string): FormatIssue[] {
  if (!/^---[ \t]*\r?\n/.test(body)) return [];
  return [
    {
      path: '',
      kind: 'frontmatter',
      code: 'body-looks-like-frontmatter',
      message:
        'The body starts with `---`, which some tools read as the start of a frontmatter block.',
    },
  ];
}

/**
 * A file that mixes CRLF and LF cannot round-trip byte for byte: the writer preserves the body
 * verbatim but re-emits frontmatter with one ending, so a mixed file changes on save.
 */
function checkLineEndings(raw: string): FormatIssue[] {
  const hasCrlf = raw.includes('\r\n');
  if (!hasCrlf) return [];
  // Lone LF next to CRLF, i.e. at least one line ends the other way.
  const loneLf = raw.replace(/\r\n/g, '').includes('\n');
  if (!loneLf) return [];
  return [
    {
      path: '',
      kind: 'newline',
      code: 'mixed-line-endings',
      message:
        'This file mixes CRLF and LF line endings, so saving it changes lines you did not edit.',
    },
  ];
}

/** Prettier, git and most Markdown tooling all want a file to end with exactly one newline. */
function checkTrailingNewline(raw: string): FormatIssue[] {
  if (raw === '' || raw.endsWith('\n')) return [];
  return [
    {
      path: '',
      kind: 'newline',
      code: 'no-trailing-newline',
      message: 'The file does not end with a newline.',
    },
  ];
}

function isMarkdown(extension: string | undefined): boolean {
  return extension === undefined || extension === 'md' || extension === 'mdx';
}
