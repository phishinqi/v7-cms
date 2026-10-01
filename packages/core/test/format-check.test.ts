/**
 * Format checks: the small set of shapes that break something, not style.
 *
 * Each case here is a real failure — the About page that could not be edited, the file that changed
 * on save. If a check cannot point at a failure like that, it does not belong in this module.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEntry } from '../src/serialize/entry.js';
import { checkEntryFormat, checkEntryFormatForBody } from '../src/format-check.js';

const fixtures = join(import.meta.dirname, 'fixtures');

const codes = (raw: string, options?: Parameters<typeof checkEntryFormat>[1]) =>
  checkEntryFormat(parseEntry(raw), options).map((issue) => issue.code);

describe('a collection that expects a body', () => {
  it('reports a document with no frontmatter, which is the About page case', () => {
    const raw = readFileSync(join(fixtures, 'posts/start-here.md'), 'utf8');
    const bodyOnly = raw.replace(/^---[\s\S]*?---\n/, '');
    expect(bodyOnly.startsWith('---')).toBe(false);

    expect(codes(bodyOnly, { extension: 'mdx', expectsBody: true })).toContain(
      'missing-frontmatter',
    );
  });

  it('stays quiet when the collection has no body field', () => {
    // A whole-document file is legitimate; without `contentField` nothing is being mis-modelled.
    expect(codes('# About\n\nProse.\n', { extension: 'mdx', expectsBody: false })).toEqual([]);
  });

  it('stays quiet for a normal entry', () => {
    const raw = readFileSync(join(fixtures, 'albums/paper.md'), 'utf8');
    expect(codes(raw, { extension: 'md', expectsBody: true })).toEqual([]);
  });

  it('ignores frontmatter for a JSON collection', () => {
    expect(codes('{\n  "a": 1\n}\n', { extension: 'json', expectsBody: true })).toEqual([]);
  });
});

describe('frontmatter that is not a mapping', () => {
  it('reports a scalar root, which a field write would displace', () => {
    expect(codes('---\nlegacy\n---\n\n正文。\n', { extension: 'md' })).toContain(
      'scalar-frontmatter',
    );
  });
});

describe('line endings', () => {
  it('reports a file that mixes CRLF and LF', () => {
    expect(codes('---\r\ntitle: x\r\n---\n\nbody\n')).toContain('mixed-line-endings');
  });

  it('accepts a file that is consistently CRLF', () => {
    expect(codes('---\r\ntitle: x\r\n---\r\n\r\nbody\r\n')).not.toContain('mixed-line-endings');
  });

  it('accepts a file that is consistently LF', () => {
    expect(codes('---\ntitle: x\n---\n\nbody\n')).not.toContain('mixed-line-endings');
  });
});

describe('the trailing newline', () => {
  it('reports a file that does not end with one', () => {
    expect(codes('---\ntitle: x\n---\n\nbody')).toContain('no-trailing-newline');
  });

  it('accepts a file that ends with one', () => {
    expect(codes('---\ntitle: x\n---\n\nbody\n')).not.toContain('no-trailing-newline');
  });
});

describe('a body that opens with a rule', () => {
  it('is flagged, because it is one bad edit from being misread', () => {
    expect(checkEntryFormatForBody('---\n\nprose\n').map((issue) => issue.code)).toEqual([
      'body-looks-like-frontmatter',
    ]);
  });

  it('does not fire for ordinary prose', () => {
    expect(checkEntryFormatForBody('# Heading\n\nprose\n')).toEqual([]);
  });
});

describe('every issue is actionable', () => {
  it('carries a code, a kind and a message an author can read', () => {
    const issues = checkEntryFormat(parseEntry('---\nlegacy\n---\n\nbody'), {
      extension: 'md',
      expectsBody: true,
    });
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.code).toBeTruthy();
      expect(['frontmatter', 'newline']).toContain(issue.kind);
      // No code identifiers leaking into the prose the author sees.
      expect(issue.message).not.toMatch(/undefined|null/);
      expect(issue.message.length).toBeGreaterThan(10);
    }
  });
});
