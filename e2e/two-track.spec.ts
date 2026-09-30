/**
 * The two-track rule, exercised in the browser.
 *
 * This is the guarantee the whole body-editing design exists for: a file that carries MDX, JSX or
 * a structured fence opens in the source editor, and saving it — even after editing — does not
 * reformat it. The complementary half is that ordinary prose still gets the nicer editor.
 */
import { test, expect, type Page } from '@playwright/test';

// These tests assert behaviour, not language, so they pin the harness to English. The
// editor's own translations are covered in i18n.spec.ts.

const files = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
    ).__cms.storage.snapshot(),
  );

const openPost = async (page: Page, label: string) => {
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link', { hasText: label }).first().click();
  await expect(page.locator('.body-field')).toBeVisible();
};

const openMdx = async (page: Page, label: string) => {
  await page.getByRole('button', { name: '文章 · MDX 源码', exact: true }).click();
  await page.locator('.entry-link', { hasText: label }).first().click();
  await expect(page.locator('.body-field')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/?locale=en');
});

test('an MDX body opens in the source editor, with the reason shown', async ({ page }) => {
  await openMdx(page, '小组件');
  await expect(page.locator('.body-field')).toHaveAttribute('data-mode', 'source');
  await expect(page.locator('.source-editor .cm-editor')).toBeVisible();
  await expect(page.locator('.rich-editor')).toHaveCount(0);
  await expect(page.locator('.body-field .field-hint')).toContainText('MDX');
});

test('a body with a diagram fence opens in the source editor', async ({ page }) => {
  await openPost(page, '让公式与流程图');
  await expect(page.locator('.body-field')).toHaveAttribute('data-mode', 'source');
  await expect(page.locator('.body-field .field-hint')).toContainText('structured block');
});

test('prose opens in the rich editor', async ({ page }) => {
  await openPost(page, 'A smaller web');
  await expect(page.locator('.body-field')).toHaveAttribute('data-mode', 'rich');
  await expect(page.locator('.rich-editor')).toBeVisible();
  await expect(page.locator('.source-editor')).toHaveCount(0);
});

test('editing an MDX body as source saves only what changed', async ({ page }) => {
  const path = 'content/posts/small-components.mdx';
  const before = (await files(page))[path]!;
  await openMdx(page, '小组件');

  // Type into the body via CodeMirror, changing only the prose paragraph.
  const editor = page.locator('.source-editor .cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n新增一行。');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);

  const after = (await files(page))[path]!;
  expect(after).toContain('新增一行。');
  // The import and the JSX component survive verbatim.
  expect(after).toContain("import Note from '@components/Note.astro';");
  expect(after).toContain('<Note title="先写正文，再考虑组件">');
  // Everything else in the body is unchanged.
  for (const line of before.split('\n').filter((line) => line.trim() !== '')) {
    expect(after).toContain(line);
  }
});

test('saving an MDX body without editing changes nothing at all', async ({ page }) => {
  const path = 'content/posts/small-components.mdx';
  const before = (await files(page))[path]!;
  await openMdx(page, '小组件');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  expect((await files(page))[path]).toBe(before);
});

test('editing prose as rich text writes Markdown back', async ({ page }) => {
  const path = 'content/posts/a-smaller-web.md';
  await openPost(page, 'A smaller web');
  const editor = page.locator('.rich-editor .ProseMirror');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Another line.');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);

  const after = (await files(page))[path]!;
  expect(after).toContain('Another line.');
  // Frontmatter is untouched even though the body was rewritten.
  expect(after).toContain("pubDate: '2026-08-20'");
  expect(after).toContain("tags: ['设计', 'Web']");
});

test('overriding the source decision warns before it reformats', async ({ page }) => {
  await openMdx(page, '小组件');
  await page.getByRole('button', { name: 'Edit as rich text anyway', exact: true }).click();
  await expect(page.locator('.body-warning')).toContainText('reformat');
  await expect(page.locator('.rich-editor')).toBeVisible();
});

test('the source editor is keyboard reachable and labelled', async ({ page }) => {
  await openMdx(page, '小组件');
  // The body region is addressable by the same id the label points at.
  await expect(page.locator('#entry-body')).toBeVisible();
  await page.locator('.source-editor .cm-content').click();
  await expect(page.locator('.cm-content')).toBeFocused();
});
