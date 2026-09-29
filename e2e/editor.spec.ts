/**
 * End-to-end coverage for the editor, driven in a real browser against a seeded memory backend.
 *
 * The point of these tests is the contract, not the pixels: entries can be found and opened, every
 * field renders, editing one value reaches the file, and — the part that matters most — everything
 * the user did not touch comes back unchanged.
 */
import { test, expect, type Page } from '@playwright/test';

const ALBUM = 'content/albums/city-corners.md';

const files = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
    ).__cms.storage.snapshot(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '相册', exact: true }).click();
  await expect(page.locator('.entry-link').first()).toBeVisible();
});

test('lists collections and their entries by their readable label', async ({ page }) => {
  await expect(page.locator('.nav-link')).toContainText([
    '文章 · Markdown',
    '文章 · MDX 源码',
    '相册',
    '动态',
    '站点设置',
  ]);
  // Entries are labelled by their title, not their file name.
  await expect(page.locator('.entry-link')).toHaveText(['城市边角', '纸面练习']);
});

test('opens an entry and renders every field, including nested list items', async ({ page }) => {
  await page.locator('.entry-link').first().click();
  await expect(page.locator('#title-field')).toHaveValue('城市边角');
  // Field ids are derived from the path, so they address a nested field unambiguously.
  await expect(page.locator('#images-0-photo-camera-field')).toHaveValue('Demo Camera X1');
  await expect(page.locator('#images-0-photo-lens-field')).toHaveValue('Demo 35mm F1.8');
  await expect(page.locator('#images-0-photo-iso-field')).toHaveValue('800');
  await expect(page.locator('#images-0-location-field')).toHaveValue('示例城市 · 河畔街');
  await expect(page.locator('#images-0-alt-field')).toHaveValue('米色楼面上整齐排列的深色窗格');
  // Nested lists inside list items render too.
  await expect(page.locator('#images-0-tags-0-field')).toHaveValue('architecture');
  await expect(page.locator('.list-item').first()).toBeVisible();
});

test('editing one field saves it and leaves the rest of the file byte-identical', async ({
  page,
}) => {
  const before = (await files(page))[ALBUM]!;
  await page.locator('.entry-link').first().click();
  await page.locator('#title-field').fill('城市边角（改过）');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);

  const after = (await files(page))[ALBUM]!;
  expect(after).toContain('城市边角（改过）');

  // Every other line survives verbatim: quoting, flow style, nested maps, order.
  const untouched = before
    .split('\n')
    .filter((line) => !line.startsWith('title:'))
    .join('\n');
  for (const line of untouched.split('\n').filter((line) => line.trim() !== '')) {
    expect(after).toContain(line);
  }
  expect(after).toContain("date: '2026-09-12'");
  expect(after).toContain('tags: [street, architecture]');
  expect(after).toContain('camera: Demo Camera X1');
});

test('saving without editing changes nothing at all', async ({ page }) => {
  const before = (await files(page))[ALBUM]!;
  await page.locator('.entry-link').first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  expect((await files(page))[ALBUM]).toBe(before);
});

test('editing one entry leaves the others alone', async ({ page }) => {
  const before = (await files(page))['content/albums/paper.md']!;
  await page.locator('.entry-link').first().click();
  await page.locator('#title-field').fill('城市边角（改过）');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  expect((await files(page))['content/albums/paper.md']).toBe(before);
});

test('a required field left blank blocks saving and points at the field', async ({ page }) => {
  await page.locator('.entry-link').first().click();
  await page.locator('#title-field').fill('');
  await expect(page.locator('.field-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  // The same applies to a field nested inside a list item, reported at its own path.
  await page.locator('#title-field').fill('城市边角');
  await page.locator('#images-0-alt-field').fill('');
  await expect(page.locator('.field-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('creates a new entry without writing blank optional keys', async ({ page }) => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('#title-field')).toBeVisible();
  // The required fields have to be filled before saving is allowed.
  await page.locator('#title-field').fill('新相册');
  await page.locator('#slug-field').fill('new-album');
  await page.locator('#date-field').fill('2026-09-20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toHaveText(/Saved/);

  const created = (await files(page))['content/albums/untitled.md']!;
  expect(created).toContain('title: 新相册');
  expect(created).toContain('slug: new-album');
  // Nothing the user never filled in should appear, including empty collections.
  expect(created).not.toContain('cover:');
  expect(created).not.toContain('description:');
  expect(created).not.toContain('images:');
});

test('reports a conflict instead of overwriting a change made elsewhere', async ({ page }) => {
  await page.locator('.entry-link').first().click();
  await page.locator('#title-field').fill('我的改动');
  // Someone else saves first.
  await page.evaluate(async (path) => {
    const cms = (window as unknown as { __cms: { storage: StorageAdapterLike } }).__cms;
    const file = await cms.storage.readFile(path);
    await cms.storage.writeFile(path, file.text.replace('城市边角', '别人的改动'), {
      message: 'their edit',
      sha: file.sha,
    });
  }, ALBUM);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice.error')).toContainText(/changed elsewhere/);

  const after = (await files(page))[ALBUM]!;
  expect(after).toContain('别人的改动');
  expect(after).not.toContain('我的改动');
});

interface StorageAdapterLike {
  readFile(path: string): Promise<{ text: string; sha?: string }>;
  writeFile(
    path: string,
    text: string,
    options: { message: string; sha?: string },
  ): Promise<unknown>;
}
