/**
 * Editing site settings.
 *
 * This is the feature a theme author actually needs: change the title, the navigation or the
 * feature switches without hand-editing JSON. The form is inferred from the file, so these tests
 * use the theme's real settings file rather than a toy object.
 */
import { test, expect, type Page } from '@playwright/test';

const SETTINGS = 'site.config.json';

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
  await expect(page.locator('.list-summary')).toHaveCount(2);
  await expect(page.locator('#nav-0-href-field')).toHaveValue('/posts/');
  await expect(page.locator('#nav-0-label-zh-CN-field')).toHaveValue('文章');
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
