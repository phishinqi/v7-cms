import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyBody, canEditAsRichText } from '../src/body-mode.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
    // Only the body matters here; the frontmatter is stripped the same way the store does it.
    .replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');

describe('body mode', () => {
  describe('real content from the blog', () => {
    // These are the files that would be corrupted by a rich-text round trip.
    const cases: Array<[string, string]> = [
      ['posts/small-components.mdx', 'mdx'],
      ['posts/image-and-space.mdx', 'mdx'],
      ['posts/math-and-diagrams.md', 'structured-fence'],
      ['posts/long-lines.md', 'rich'],
      ['posts/reading-notes.md', 'rich'],
      ['posts/start-here.md', 'rich'],
    ];
    for (const [name, reason] of cases) {
      it(`classifies ${name}`, () => {
        const body = fixture(name);
        const extension = name.endsWith('.mdx') ? 'mdx' : 'md';
        const result = classifyBody(body, { extension });
        if (reason === 'rich') {
          expect(result.mode, `${name} should be editable as rich text`).toBe('rich');
        } else {
          expect(result.mode, `${name} must stay in the source editor`).toBe('source');
        }
      });
    }

    it('never allows rich text for any MDX file', () => {
      for (const name of ['posts/small-components.mdx', 'posts/image-and-space.mdx']) {
        expect(canEditAsRichText(fixture(name), { extension: 'mdx' })).toBe(false);
      }
    });
  });

  describe('signals that force source mode', () => {
    const forced: Array<[string, string, string]> = [
      ['an ESM import', "import Note from '@components/Note.astro';\n\nText.\n", 'imports'],
      ['a named export', 'export const meta = {};\n', 'imports'],
      ['a JSX component at line start', '<Note title="x">hi</Note>\n', 'jsx'],
      ['a self-closing JSX component', '<Gallery images={images} />\n', 'jsx'],
      ['a namespaced component', '<Foo.Bar />\n', 'jsx'],
      ['an HTML block element', '<details>\n<summary>x</summary>\n</details>\n', 'html'],
      ['display math', '$$\nL(w,b) = \\frac{1}{n}\n$$\n', 'math'],
      ['a mermaid fence', '```mermaid\nflowchart LR\n  A --> B\n```\n', 'structured-fence'],
      ['an abc fence', '```abc\nX:1\nK:D\n```\n', 'structured-fence'],
      [
        'a tilde fence with a structured language',
        '~~~mermaid\nflowchart LR\n~~~\n',
        'structured-fence',
      ],
      ['a four-space indented block', 'Text.\n\n    const x = 1;\n', 'indented-code'],
      ['a tab indented block', 'Text.\n\n\tconst x = 1;\n', 'indented-code'],
    ];
    for (const [description, body, reason] of forced) {
      it(`keeps ${description} in the source editor`, () => {
        const result = classifyBody(body);
        expect(result.mode).toBe('source');
        expect(result.reason).toBe(reason);
      });
    }

    it('honours an explicit source-only field', () => {
      expect(classifyBody('Just prose.', { forceSource: true })).toEqual({
        mode: 'source',
        reason: 'configured',
      });
    });

    it('reports the extension ahead of a blanket config flag, since it is more specific', () => {
      expect(classifyBody('Just prose.', { forceSource: true, extension: 'mdx' })).toEqual({
        mode: 'source',
        reason: 'mdx',
      });
    });

    it('accepts extra structured fence languages from the config', () => {
      expect(classifyBody('```chart\nx\n```\n').mode).toBe('rich');
      expect(classifyBody('```chart\nx\n```\n', { structuredFences: ['chart'] }).mode).toBe(
        'source',
      );
    });
  });

  describe('prose that must stay in the rich editor', () => {
    const prose: Array<[string, string]> = [
      ['plain paragraphs', 'Hello there.\n\nA second paragraph.\n'],
      ['headings and lists', '# Title\n\n- one\n- two\n\n1. first\n2. second\n'],
      ['emphasis and links', 'Some **bold** and *italic* and a [link](https://example.com).\n'],
      ['inline math, which round-trips well', 'Let $x$ be the input and $y = wx + b$ the model.\n'],
      ['a dollar amount', 'It costs $20 and the other costs $30.\n'],
      ['an ordinary code fence', '```js\nconst x = 1;\n```\n'],
      ['a fence with no language', '```\nplain\n```\n'],
      ['a bash fence', '```bash\npnpm build\n```\n'],
      ['a quote', '> quoted\n'],
      ['a stray less-than in prose', 'Compare a < b, and see 3 < 5 for the general case.\n'],
      ['an autolink', 'See <https://example.com> for more.\n'],
      ['a lowercase html-ish word', 'The element div is used here.\n'],
      ['a horizontal rule', 'Above.\n\n---\n\nBelow.\n'],
      ['an image', '![alt text](/images/a.png)\n'],
      ['nested lists with two-space indent', '- one\n  - nested\n    - deeper\n'],
    ];
    for (const [description, body] of prose) {
      it(`keeps ${description} in the rich editor`, () => {
        expect(classifyBody(body).mode, description).toBe('rich');
      });
    }

    it('is not confused by a fence that only looks structured', () => {
      // A language that merely starts with a structured name is a different language.
      expect(classifyBody('```mermaidish\nx\n```\n').mode).toBe('rich');
      expect(classifyBody('```markdown\n# nested example\n```\n').mode).toBe('rich');
    });

    it('ignores structured-looking text inside a normal fence', () => {
      const body = '```md\nimport x from "y";\n<Note />\n```\n';
      expect(classifyBody(body).mode).toBe('rich');
    });

    it('ignores an import that appears inside a fenced block', () => {
      const body = ['```js', "import x from 'y';", '```', '', 'Prose.'].join('\n');
      expect(classifyBody(body).mode).toBe('rich');
    });

    it('treats an empty body as editable', () => {
      expect(classifyBody('').mode).toBe('rich');
    });
  });
});
