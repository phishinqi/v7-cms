import { test, expect } from '@playwright/test';

test('creates a category in the article and selects it before saving', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  await page.getByRole('button', { name: 'New category', exact: true }).click();
  await page.getByLabel('Category name', { exact: true }).fill('New notes');
  await page.getByRole('button', { name: 'Create and select', exact: true }).click();
  await expect(page.locator('#category-field')).toHaveValue('new-notes');
  const registry = await page.evaluate(
    () =>
      (
        window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
      ).__cms.storage.snapshot()['data/categories.json'],
  );
  expect(JSON.parse(registry!).categories).toContainEqual({
    id: 'new-notes',
    title: { 'zh-CN': 'New notes', en: 'New notes' },
    description: { 'zh-CN': '', en: '' },
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
});
