/**
 * The contract this package exists to keep: opening a file and saving it without editing
 * anything must produce the identical bytes.
 *
 * Every fixture under `test/fixtures` is real content from the blog, chosen because it exercises
 * something the naive approach (parse to an object, stringify back) would destroy: flow
 * sequences, single-quoted dates, block sequences of nested maps, mixed optional sub-objects,
 * CJK and spaces in values, MDX imports in the body, and files with no frontmatter at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEntry,
  readData,
  serializeEntry,
  setValue,
  deleteValue,
} from '../src/serialize/index.js';

const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(fixtures).filter((path) => /\.(md|mdx)$/.test(path));

describe('round trip', () => {
  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const relative = file.slice(fixtures.length + 1);
    it(`preserves ${relative} byte for byte`, () => {
      const raw = readFileSync(file, 'utf8');
      const entry = parseEntry(raw);
      expect(serializeEntry(entry)).toBe(raw);
    });
  }

  it('keeps the body untouched when no body is passed', () => {
    const raw = readFileSync(join(fixtures, 'posts/small-components.mdx'), 'utf8');
    const entry = parseEntry(raw);
    // The MDX import must survive; nothing may normalise it.
    expect(serializeEntry(entry)).toContain("import Note from '@components/Note.astro';");
  });

  it('handles a file with no frontmatter', () => {
    const raw = '# Just a body\n\nNo frontmatter here.\n';
    const entry = parseEntry(raw);
    expect(entry.hasFrontmatter).toBe(false);
    expect(serializeEntry(entry)).toBe(raw);
  });
});

describe('editing one value', () => {
  it('changes only the edited line', () => {
    const raw = readFileSync(join(fixtures, 'posts/a-smaller-web.md'), 'utf8');
    const entry = parseEntry(raw);
    setValue(entry, 'title', 'A different title');
    const after = serializeEntry(entry);
    const before = raw.split('\n');
    const now = after.split('\n');
    const changed = before
      .map((line, index) => (line === now[index] ? null : index))
      .filter((index): index is number => index !== null);
    expect(changed).toHaveLength(1);
    expect(now[changed[0]!]).toContain('A different title');
  });

  it('leaves sibling styling alone', () => {
    const raw = readFileSync(join(fixtures, 'albums/city-corners.md'), 'utf8');
    const entry = parseEntry(raw);
    setValue(entry, 'title', '城市角落');
    const after = serializeEntry(entry);
    expect(after).toContain("date: '2026-09-02'"); // per-photo quoted dates survive
    expect(after).toContain('tags: [street, architecture]'); // flow style survives
    expect(after).toMatch(/^images:\n {2}- src: /m); // block sequence survives
  });

  it('writes a new key without disturbing the rest', () => {
    const raw = readFileSync(join(fixtures, 'posts/keep-a-question.md'), 'utf8');
    const entry = parseEntry(raw);
    setValue(entry, 'featured', true);
    const after = serializeEntry(entry);
    expect(after).toContain('featured: true');
    // Every other line survives verbatim: same content, same order, same styling.
    const untouched = raw
      .trimEnd()
      .split('\n')
      .filter((line) => line !== '---' && !line.startsWith('featured:'));
    for (const line of untouched) expect(after).toContain(line);
    expect(after).toContain("pubDate: '2026-05-10'");
    expect(after).toContain("tags: ['随笔']");
    expect(after.indexOf('featured: true')).toBeGreaterThan(after.indexOf("tags: ['随笔']"));
  });

  it('can edit a field when the existing frontmatter is a scalar', () => {
    const entry = parseEntry('---\nlegacy\n---\n\n关于页正文。\n');
    setValue(entry, 'title', '关于');
    // The scalar root becomes a mapping, because YAML has nowhere to put a key beside it — but its
    // text is kept as a comment rather than dropped, so nothing the author wrote disappears.
    expect(serializeEntry(entry)).toBe('---\n# legacy\ntitle: 关于\n---\n\n关于页正文。\n');
  });

  it('treats prose between two rules as body, not as frontmatter', () => {
    // A Markdown file may open with a thematic break. Reading that as frontmatter would put the
    // prose inside the YAML block and write it back out as keys.
    const raw = '---\n\n标题\n\n---\n\n正文。\n';
    const entry = parseEntry(raw);
    expect(entry.hasFrontmatter).toBe(false);
    expect(entry.bodyRaw).toBe(raw);
    setValue(entry, 'title', 'x');
    expect(serializeEntry(entry)).toBe(raw);
  });

  it('removes a key rather than blanking it, so optional fields stay absent', () => {
    const raw = readFileSync(join(fixtures, 'albums/paper.md'), 'utf8');
    const entry = parseEntry(raw);
    deleteValue(entry, 'cover');
    const after = serializeEntry(entry);
    expect(after).not.toContain('cover:');
    expect(after).toContain('images:');
  });
});

describe('reading', () => {
  it('returns frontmatter as plain data', () => {
    const raw = readFileSync(join(fixtures, 'albums/city-corners.md'), 'utf8');
    const data = readData(parseEntry(raw));
    expect(data['slug']).toBe('city-corners');
    expect(data['tags']).toEqual(['street', 'architecture']);
    const images = data['images'] as Array<Record<string, unknown>>;
    expect(images).toHaveLength(8);
    expect(images[0]).toMatchObject({
      width: 1200,
      height: 1600,
      title: '亮着的一扇窗',
    });
    expect((images[0]!['photo'] as Record<string, unknown>)['camera']).toBe('Demo Camera X1');
  });
});
