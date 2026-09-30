/**
 * What the rich editor does to Markdown, measured in a browser.
 *
 * Tiptap needs a DOM, so this runs against the harness rather than in Node. These tests do not
 * claim the rich editor preserves formatting — no Markdown editor does. They record exactly where
 * it rewrites, which is what justifies the two-track rule: a body is only opened as rich text when
 * the rewrite is harmless.
 */
import { test, expect } from '@playwright/test';

// These tests assert behaviour, not language, so they pin the harness to English. The
// editor's own translations are covered in i18n.spec.ts.

// The harness exposes the same serialiser the editor uses.
const roundTrip = (page: import('@playwright/test').Page, markdown: string) =>
  page.evaluate(
    (value) =>
      (
        window as unknown as {
          __cms: { richRoundTrip(markdown: string): string };
        }
      ).__cms.richRoundTrip(value),
    markdown,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/?locale=en');
});

test('preserves headings, emphasis, links and lists', async ({ page }) => {
  const markdown =
    '## A heading\n\nSome **bold** and *italic* and a [link](https://example.com).\n\n- one\n- two\n\n1. first\n2. second\n';
  const after = await roundTrip(page, markdown);
  expect(after).toContain('## A heading');
  expect(after).toContain('**bold**');
  expect(after).toContain('[link](https://example.com)');
  expect(after).toMatch(/-\s+one/);
  expect(after).toMatch(/1\.\s+first/);
});

test('preserves block quotes and fenced code', async ({ page }) => {
  const after = await roundTrip(page, '> quoted\n\n```js\nconst x = 1;\n```\n');
  expect(after).toContain('> quoted');
  expect(after).toContain('const x = 1;');
});

test('preserves images when the image extension is registered', async ({ page }) => {
  const after = await roundTrip(page, '![alt text](/images/a.png)\n');
  expect(after).toContain('![alt text](/images/a.png)');
});

test('is idempotent, so an accidental rich save cannot drift further', async ({ page }) => {
  const once = await roundTrip(page, '## Head\n\nText with **bold**.\n\n- a\n- b\n');
  const twice = await roundTrip(page, once);
  expect(twice).toBe(once);
});

test('records the damage a structured fence would take', async ({ page }) => {
  // The classification is what protects this file; the round trip is shown to be unsafe so the
  // rule does not look arbitrary.
  const markdown = '```mermaid\nflowchart LR\n  A --> B\n```\n';
  const after = await roundTrip(page, markdown);
  expect(after).not.toBe(markdown);
});
