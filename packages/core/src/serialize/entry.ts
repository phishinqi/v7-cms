/**
 * Reading and writing entry files without disturbing what was not edited.
 *
 * The rule that makes this work: the file's text is the source of truth. Parsing keeps the
 * original strings, and saving only touches the nodes whose values actually changed. Nothing is
 * ever re-serialised from a plain object, because that would normalise quoting, flow style,
 * key order and comments away — and the blog's build treats `'2026-09-12'` and a bare date, or a
 * missing key and an empty one, as different things.
 */
import { parseDocument, stringify, isScalar, isSeq, isMap, type Document } from 'yaml';

export interface ParsedEntry {
  /** The file exactly as it was read. */
  raw: string;
  /** Frontmatter including the `---` fences, or '' when the file has none. */
  frontmatterRaw: string;
  /** Everything after the frontmatter, byte for byte. */
  bodyRaw: string;
  /** The frontmatter as a mutable YAML document. */
  document: Document.Parsed;
  /** Whether the original file had frontmatter at all. */
  hasFrontmatter: boolean;
  /** Flow collections written as `{ a: 1 }`, which the writer would otherwise emit as `{a: 1}`. */
  paddedFlows: FlowPadding[];
  /**
   * Text of a scalar frontmatter root, kept so it survives the promotion to a mapping. Undefined
   * for the ordinary case, where the frontmatter already is a mapping.
   */
  orphanRoot?: string | undefined;
  /** Set once `orphanRoot` has been written out, so repeated saves do not stack the comment. */
  orphanRootRestored?: boolean;
}

/**
 * A flow collection whose original text had a space just inside its brackets. Real files mix the
 * two styles — `[a, b]` in one line and `{ a: b }` in the next — and the YAML writer has a single
 * global setting, so these are recorded on parse and repaired after writing.
 */
interface FlowPadding {
  /** Dotted path of the collection, as used by `getIn`/`setIn`. */
  path: string[];
  /** Whether the source text had a space after the opening bracket. */
  leading: boolean;
}

// The frontmatter block may be empty, which is what a brand new entry starts as, so the inner
// group is optional rather than `[\s\S]*?` between two newlines.
const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(\r?\n|$)/;

/**
 * Whether a `---`-fenced block at the top of a file is really frontmatter.
 *
 * Two dashes on line 1 are also how a Markdown document opens with a thematic break, and prose that
 * later contains another `---` would then be swallowed as YAML: everything between the two lines
 * becomes frontmatter, the rest becomes the body, and saving writes the prose out as keys. So the
 * block only counts when it parses as YAML at all, and what it parses to is one of the shapes a
 * frontmatter block actually has — a mapping, nothing, or a single bare scalar (`---\nlegacy\n---`,
 * a shape real pages have).
 *
 * The scalar case is limited to one line on purpose. Prose between two rules also parses as a
 * scalar, so anything multi-line, or blank at either end, is body text with a thematic break in it
 * rather than frontmatter. Getting this wrong is asymmetric: reading real frontmatter as body
 * leaves the file untouched, while reading prose as frontmatter rewrites it.
 */
function isFrontmatter(yamlText: string): boolean {
  const document = parseDocument(yamlText);
  if (document.errors.length > 0 || document.warnings.length > 0) return false;
  const contents = document.contents;
  // Blank and comment-only blocks parse to null, which is a legitimate empty frontmatter.
  if (contents === null || isMap(contents)) return true;
  // A lone scalar only, with no surrounding blank line: `legacy`, not a paragraph of prose.
  return isScalar(contents) && yamlText.trim() === yamlText && !yamlText.trim().includes('\n');
}

export function parseEntry(raw: string): ParsedEntry {
  const match = FRONTMATTER.exec(raw);
  if (!match || !isFrontmatter(match[1] ?? '')) {
    return {
      raw,
      frontmatterRaw: '',
      bodyRaw: raw,
      document: parseDocument(''),
      hasFrontmatter: false,
      paddedFlows: [],
      orphanRoot: undefined,
    };
  }
  const frontmatterRaw = match[0];
  const yamlText = match[1] ?? '';
  const document = parseDocument(yamlText);
  return {
    raw,
    frontmatterRaw,
    bodyRaw: raw.slice(frontmatterRaw.length),
    document,
    hasFrontmatter: true,
    // Node ranges are offsets into the YAML text that was parsed, not into the whole file.
    paddedFlows: collectPadding(document, yamlText),
    orphanRoot: rootScalarText(document),
  };
}

/**
 * The text of a scalar frontmatter root, kept so promoting the document to a mapping does not
 * destroy it. `---\nlegacy\n---` is a shape real pages have, and YAML's `setIn` needs a collection
 * at the root — so the first field written would otherwise replace that text with an empty map.
 */
function rootScalarText(document: Document.Parsed): string | undefined {
  const contents = document.contents;
  if (contents === null || isMap(contents)) return undefined;
  const text = stringify(contents, { lineWidth: 0 });
  return typeof text === 'string' ? text.replace(/\n+$/, '') : undefined;
}

function collectPadding(document: Document.Parsed, yamlText: string): FlowPadding[] {
  const found: FlowPadding[] = [];
  const visit = (node: unknown, path: string[]): void => {
    if (!isMap(node) && !isSeq(node)) return;
    const range = node.range;
    if (node.flow && range) {
      const text = yamlText.slice(range[0], range[0] + 2);
      found.push({ path: [...path], leading: /^[[{] /.test(text) });
    }
    if (isMap(node)) {
      for (const item of node.items) {
        const key = isScalar(item.key) ? String(item.key.value) : undefined;
        if (key !== undefined) visit(item.value, [...path, key]);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) => visit(item, [...path, String(index)]));
    }
  };
  visit(document.contents, []);
  return found;
}

/** The frontmatter as plain data. For reading and comparing only — never for writing. */
export function readData(entry: ParsedEntry): Record<string, unknown> {
  const value = entry.document.toJS({});
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Set a value at a dotted path, touching only that node, so every other node keeps its original
 * style: quoting, flow vs block sequences, key order and comments all survive.
 */
export function setValue(entry: ParsedEntry, path: string, value: unknown): void {
  // A page can contain scalar or empty frontmatter. YAML's setIn only accepts a collection as
  // its root, so promote that legacy shape before the editor writes a structured field. The old
  // root is not thrown away: `orphanRoot` keeps its text and `serializeEntry` writes it back as a
  // comment, so a page reading `---\nlegacy\n---` loses nothing when a field is added.
  if (!isMap(entry.document.contents)) {
    entry.document.contents = entry.document.createNode(
      {},
    ) as unknown as typeof entry.document.contents;
  }
  entry.document.setIn(path.split('.'), value);
}

/** Remove a key entirely, which is how optional fields stay absent rather than blank. */
export function deleteValue(entry: ParsedEntry, path: string): void {
  entry.document.deleteIn(path.split('.'));
}

/** Read a value at a dotted path, as plain data. */
export function getValue(entry: ParsedEntry, path: string): unknown {
  const node = entry.document.getIn(path.split('.'), true);
  if (node === undefined) return undefined;
  if (isScalar(node)) return node.value;
  return (node as { toJS?: (options?: unknown) => unknown }).toJS?.({}) ?? undefined;
}

/** Whether the node at `path` exists at all. */
export function hasValue(entry: ParsedEntry, path: string): boolean {
  return entry.document.hasIn(path.split('.'));
}

/**
 * The quoting of the node currently at `path`, so a rewrite can match its neighbourhood rather
 * than falling back to the YAML default. Dates in the blog are single-quoted strings; dropping
 * the quotes would turn them into date objects downstream.
 */
export function scalarStyleAt(
  entry: ParsedEntry,
  path: string,
): { quote: 'single' | 'double' | false } | undefined {
  const node = entry.document.getIn(path.split('.'), true);
  if (!isScalar(node)) return undefined;
  const type = node.type as string | undefined;
  return {
    quote: type === 'QUOTE_SINGLE' ? 'single' : type === 'QUOTE_DOUBLE' ? 'double' : false,
  };
}

/**
 * The file text for the current document state. `bodyRaw` goes back out untouched unless the
 * caller passes a new body, which is what makes "parse then save" a no-op for untouched content.
 */
export function serializeEntry(entry: ParsedEntry, body?: string): string {
  if (!entry.hasFrontmatter) return body ?? entry.bodyRaw;
  // `lineWidth: 0` stops the writer folding long lines, which would reflow existing text.
  let yamlText = entry.document
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/\n+$/, '\n');
  yamlText = restoreFlowPadding(entry, yamlText);
  yamlText = restoreOrphanRoot(entry, yamlText);
  return `---\n${yamlText}---\n${body ?? entry.bodyRaw}`;
}

/**
 * Put back a scalar root that `setValue` had to displace.
 *
 * The text is re-emitted as a comment on the line that replaced it, because the frontmatter is now
 * a mapping and YAML has no way to express "a mapping and also a scalar". Keeping it as a comment
 * means the author can still see what was there and move it into a key, which is strictly better
 * than the alternative the promotion used to have — dropping it silently.
 */
function restoreOrphanRoot(entry: ParsedEntry, yamlText: string): string {
  const orphan = entry.orphanRoot;
  if (orphan === undefined || entry.orphanRootRestored) return yamlText;
  entry.orphanRootRestored = true;
  const commented = orphan
    .split('\n')
    .map((line) => `# ${line}`.trimEnd())
    .join('\n');
  return `${commented}\n${yamlText}`;
}

/**
 * Put back the inner spaces that `flowCollectionPadding: false` removed, but only for the
 * collections that had them. Real files mix `[a, b]` and `{ a: b }`, sometimes on adjacent lines,
 * and the writer has one global setting — so the source style is recorded on parse and repaired
 * here, matching on each collection's own inline text rather than on its position.
 */
function restoreFlowPadding(entry: ParsedEntry, yamlText: string): string {
  const wanted = entry.paddedFlows.filter((flow) => flow.leading);
  if (wanted.length === 0) return yamlText;
  let result = yamlText;
  for (const flow of wanted) {
    const node = entry.document.getIn(flow.path, true);
    if (!node || !(isMap(node) || isSeq(node)) || !node.flow) continue;
    const compact = stringify(node, {
      lineWidth: 0,
      flowCollectionPadding: false,
    });
    const padded = stringify(node, {
      lineWidth: 0,
      flowCollectionPadding: true,
    });
    if (typeof compact !== 'string' || typeof padded !== 'string') continue;
    result = result.replace(compact.trim(), padded.trim());
  }
  return result;
}
