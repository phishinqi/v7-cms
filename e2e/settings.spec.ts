/**
 * Editing site settings.
 *
 * This is the feature a theme author actually needs: change the title, the navigation or the
 * feature switches without hand-editing JSON. The form is inferred from the file, so these tests
 * use the theme's real settings file rather than a toy object.
 */
import { test, expect, type Page } from '@playwright/test';

const SETTINGS = 'site.config.json';
const AUTHORS = 'data/authors.json';
const TAGS = 'data/tags.json';

const openSettings = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: '站点设置', exact: true }).click();
  await expect(page.locator('.file-editor')).toBeVisible();
};

const stored = (page: Page, path = SETTINGS) =>
  page.evaluate(
    (key) =>
      (
        window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
      ).__cms.storage.snapshot()[key],
    path,
  );

const openAuthors = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: '作者', exact: true }).click();
  await expect(page.locator('.file-editor')).toBeVisible();
};

const openCollection = async (page: Page, label: string) => {
  await page.goto('/');
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.file-editor')).toBeVisible();
};

test('the settings collection opens a form rather than a blank page', async ({ page }) => {
  await openSettings(page);
  // Every top-level key of the file is on the form.
  for (const name of [
    'title',
    'siteURL',
    'postsPerPage',
    'startedAt',
    'description',
    'features',
    'nav',
  ]) {
    await expect(page.locator(`[data-field="${name}"]`)).toBeVisible();
  }
});

test('infers the widget each value needs', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#title-field')).toHaveValue('V7');
  await expect(page.locator('#postsPerPage-field')).toHaveValue('10');
  // A date-shaped string edits as a date.
  await expect(page.locator('#startedAt-field')).toHaveAttribute('type', 'date');
  // A localized object gets one field per locale, taken from the file.
  await expect(page.locator('#description-zh-CN-field')).toHaveValue('写代码，也写生活。');
  await expect(page.locator('#description-en-field')).toHaveValue(
    'On code, and everything around it.',
  );
  // A boolean is a checkbox.
  await expect(page.locator('#features-moments-field')).toBeChecked();
});

test('a list of objects renders its item shape, including a localized label', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('[data-field="nav"] .list-summary')).toHaveCount(2);
  await expect(page.locator('#nav-0-href-field')).toHaveValue('/posts/');
  await expect(page.locator('#nav-0-label-zh-CN-field')).toHaveValue('文章');
});

test('repairs legacy social links when the settings file is saved', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('#socialLinks-0-label-field')).toHaveValue('RSS');
  await page.locator('#title-field').fill('V7 repaired');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);

  const saved = JSON.parse((await stored(page))!) as {
    socialLinks: Array<{ label: string; href: string }>;
  };
  expect(saved.socialLinks).toEqual([
    { label: 'RSS', href: 'https://blog.soyonagasaki.com/rss.xml' },
    { label: 'Ryokoukiryu', href: 'https://x.com/Ryokoukiryu' },
    { label: 'astraruri', href: 'https://x.com/astraruri' },
  ]);
});

test('editing a value saves it and leaves the other keys alone', async ({ page }) => {
  await openSettings(page);
  await page.locator('#title-field').fill('My blog');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);

  const saved = JSON.parse((await stored(page))!) as Record<string, unknown>;
  expect(saved['title']).toBe('My blog');
  // Everything else survives, including keys the form does not describe as objects of their own.
  expect(saved['siteURL']).toBe('https://example.com');
  expect(saved['postsPerPage']).toBe(10);
  expect(saved['nav']).toEqual([
    { href: '/posts/', label: { 'zh-CN': '文章', en: 'Writing' } },
    { href: '/about/', label: { 'zh-CN': '关于', en: 'About' } },
  ]);
  expect(saved['features']).toEqual({ moments: true, albums: true, stats: true });
});

test('keeps the file readable: two-space indent and a trailing newline', async ({ page }) => {
  await openSettings(page);
  await page.locator('#title-field').fill('My blog');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);
  const text = (await stored(page))!;
  expect(text).toContain('\n  "title": "My blog"');
  expect(text.endsWith('\n')).toBe(true);
});

test('toggles a feature switch', async ({ page }) => {
  await openSettings(page);
  await page.locator('#features-moments-field').uncheck();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);
  const saved = JSON.parse((await stored(page))!) as { features: { moments: boolean } };
  expect(saved.features.moments).toBe(false);
});

test('save is unavailable until something changes', async ({ page }) => {
  await openSettings(page);
  const save = page.getByRole('button', { name: '保存', exact: true });
  await expect(save).toBeDisabled();
  await page.locator('#title-field').fill('Changed');
  await expect(save).toBeEnabled();
  // Typing the original value back leaves nothing to save.
  await page.locator('#title-field').fill('V7');
  await expect(save).toBeDisabled();
});

test('adding a navigation entry writes it to the file', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: /添加 Nav|Add Nav/ }).click();
  await page.locator('#nav-2-href-field').fill('/tags/');
  await page.locator('#nav-2-label-zh-CN-field').fill('标签');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);

  const saved = JSON.parse((await stored(page))!) as { nav: Array<Record<string, unknown>> };
  expect(saved.nav).toHaveLength(3);
  expect(saved.nav[2]).toEqual({ href: '/tags/', label: { 'zh-CN': '标签' } });
});

test('edits authors from the dedicated author collection', async ({ page }) => {
  await openAuthors(page);
  await expect(page.locator('#authors-0-name-field')).toHaveValue('V7');
  await page.locator('#authors-0-name-field').fill('V7 CMS');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);

  const saved = JSON.parse((await stored(page, AUTHORS))!) as {
    authors: Array<{ name: string }>;
  };
  expect(saved.authors[0]!.name).toBe('V7 CMS');
});

test('registers the taxonomy and friends JSON files as editable collections', async ({ page }) => {
  await openCollection(page, '分类');
  await expect(page.locator('#categories-0-id-field')).toHaveValue('technology');
  await expect(page.locator('#categories-0-title-zh-CN-field')).toHaveValue('技术');

  await openCollection(page, '友链');
  await expect(page.locator('#friends-0-name-field')).toHaveValue('Astro');

  await openCollection(page, '相册标签');
  await expect(page.locator('#tags-0-label-en-field')).toHaveValue('Street');

  await openCollection(page, '标签');
  await expect(page.locator('#tags-0-name-field')).toHaveValue('设计');

  // The collections are real file editors, so a value change is persisted through the same path.
  await page.locator('#tags-0-name-field').fill('设计与排版');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);
  const saved = JSON.parse((await stored(page, TAGS))!) as { tags: Array<{ name: string }> };
  expect(saved.tags[0]!.name).toBe('设计与排版');
});

/**
 * A file edited as one block of source.
 *
 * `source: true` is for files that are documents rather than data — an MDX page, whose content is
 * the whole file. Parsing one into frontmatter would be wrong, and this is the regression that
 * matters: the page opens, and saving writes back exactly what was typed and nothing else.
 */
test('a source collection opens the whole file in one editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '独立页面', exact: true }).click();
  await expect(page.locator('.file-editor')).toBeVisible();
  await expect(page.locator('.source-editor')).toBeVisible();
  // No inferred form: the file is not data, so there are no fields to render.
  await expect(page.locator('.field')).toHaveCount(0);
});

test('editing a source file writes back only what changed', async ({ page }) => {
  const path = 'content/pages/about.zh.mdx';
  await page.goto('/');
  await page.getByRole('button', { name: '独立页面', exact: true }).click();
  const before = (await stored(page, path))!;

  const editor = page.locator('.source-editor .cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n新增一行。');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.notice.ok')).toHaveText(/已保存|Saved/);

  const after = (await stored(page, path))!;
  expect(after).toBe(`${before}\n新增一行。`);
});

test('a source file saves byte for byte when nothing is edited', async ({ page }) => {
  const path = 'content/pages/about.zh.mdx';
  await page.goto('/');
  await page.getByRole('button', { name: '独立页面', exact: true }).click();
  const before = (await stored(page, path))!;
  // Save is offered only when something changed, so a no-op is a no-op.
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  expect((await stored(page, path))!).toBe(before);
});

test('a body that opens with a rule is reported without blocking the save', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '独立页面', exact: true }).click();
  const notes = page.locator('.format-notes');
  await expect(notes).toBeVisible();
  await expect(notes.locator('[data-code="body-looks-like-frontmatter"]')).toBeVisible();
  // Advisory, not validation: the format note must not disable the button the way a field error does.
  const editor = page.locator('.source-editor .cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
});
