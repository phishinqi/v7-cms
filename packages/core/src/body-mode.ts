/**
 * Choosing how to edit a body.
 *
 * A rich-text editor normalises Markdown: it re-wraps emphasis, realigns tables, changes list
 * markers and fence styles. That is fine for prose and fatal for MDX, which carries ESM imports
 * and JSX that a Markdown editor does not understand at all. So a body is classified before it is
 * opened, and anything the rich editor would not round-trip is edited as source instead.
 *
 * The bias is deliberate: when in doubt, choose source. A false positive costs the author a nicer
 * editor; a false negative silently corrupts their file.
 */

export type BodyMode = 'rich' | 'source';

/** Fence languages a Markdown editor would rewrite or mangle. */
const STRUCTURED_FENCES = new Set([
  'mermaid',
  'abc',
  'math',
  'katex',
  'plantuml',
  'graphviz',
  'markmap',
  'mindmap',
  'echarts',
  'wavedrom',
]);

export interface BodyModeOptions {
  /** File extension, since MDX is always source-edited. */
  extension?: string;
  /** Set by the config when a field is explicitly source-only. */
  forceSource?: boolean;
  /** Fence languages this consumer treats as structured, added to the built-in set. */
  structuredFences?: string[];
}

export interface BodyModeResult {
  mode: BodyMode;
  /** Why source was chosen, so the UI can explain itself instead of just refusing. */
  reason?:
    | 'mdx'
    | 'imports'
    | 'jsx'
    | 'structured-fence'
    | 'html'
    | 'math'
    | 'indented-code'
    | 'configured';
}

/**
 * Decide how to edit a body.
 *
 * Only clear, unambiguous signals force source mode. A stray `<` in prose, or a `$` in a price,
 * must not send the author to the source editor for no reason.
 */
export function classifyBody(body: string, options: BodyModeOptions = {}): BodyModeResult {
  // The extension is the most specific signal, so it is reported ahead of a blanket config flag:
  // "this is MDX" tells the author more than "this field is source only".
  if (options.extension === 'mdx') return { mode: 'source', reason: 'mdx' };
  if (options.forceSource) return { mode: 'source', reason: 'configured' };

  const structured = options.structuredFences
    ? new Set([...STRUCTURED_FENCES, ...options.structuredFences])
    : STRUCTURED_FENCES;

  const lines = body.split('\n');
  let inFence = false;

  for (const line of lines) {
    const fence = /^\s{0,3}(?:`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (fence) {
      if (!inFence) {
        const language = (fence[1] ?? '').toLowerCase();
        if (language && structured.has(language)) {
          return { mode: 'source', reason: 'structured-fence' };
        }
        inFence = true;
      } else {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    // ESM in MDX, at the start of a line where it is unambiguous.
    if (/^\s*(import|export)\s/.test(line)) return { mode: 'source', reason: 'imports' };

    // JSX or HTML component syntax: a capitalised tag, or an explicit block element. Prose rarely
    // starts a line with one, so requiring line-start keeps false positives down.
    if (/^\s*<\/?[A-Z][A-Za-z0-9.]*[\s/>]/.test(line)) return { mode: 'source', reason: 'jsx' };
    if (/^\s*<(div|span|figure|details|summary|iframe|video|audio|table)\b/i.test(line)) {
      return { mode: 'source', reason: 'html' };
    }

    // Display math. Inline `$…$` is common in prose and round-trips acceptably, but a `$$` block
    // is a block-level construct and is treated as structured.
    if (/^\s*\$\$/.test(line)) return { mode: 'source', reason: 'math' };
  }

  /**
   * Four-space indented code blocks are ambiguous with nested list continuations, which is exactly
   * the kind of thing a rich editor gets wrong. Only the ambiguous case counts: an indented block
   * that follows a blank line at column zero. Indented lines inside a list, or inside a fenced
   * block, are ordinary content.
   */
  function hasIndentedCodeBlock(body: string): boolean {
    const lines = body.split('\n');
    let fenced = false;
    let previousBlank = true;
    for (const line of lines) {
      if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
        fenced = !fenced;
        previousBlank = false;
        continue;
      }
      if (fenced) continue;
      // Inside a list, indentation is a continuation or a nested item, not a code block.
      if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
        previousBlank = false;
        continue;
      }
      if (/^(?: {4}|\t)\S/.test(line)) {
        if (previousBlank) return true;
        previousBlank = false;
        continue;
      }
      previousBlank = line.trim() === '';
    }
    return false;
  }

  if (hasIndentedCodeBlock(body)) return { mode: 'source', reason: 'indented-code' };
  return { mode: 'rich' };
}

/** Convenience for the UI: whether a body may be opened in the rich editor. */
export function canEditAsRichText(body: string, options: BodyModeOptions = {}): boolean {
  return classifyBody(body, options).mode === 'rich';
}
