import { test, expect } from '@playwright/test';
test('selects, creates and removes tags without duplicates', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  await page.getByRole('button', { name: 'Remove 设计', exact: true }).click();
  await page.locator('#tags-field').selectOption('设计');
  await page.getByLabel('New tag', { exact: true }).fill('新标签');
  await page.getByRole('button', { name: 'Create and add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove 新标签', exact: true })).toBeVisible();
  await page.getByLabel('New tag', { exact: true }).fill('新标签');
  await page.getByRole('button', { name: 'Create and add', exact: true }).click();
  await expect(page.getByLabel('New tag', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove 新标签', exact: true })).toHaveCount(1);
  await page.getByLabel('New tag', { exact: true }).fill('bad/tag');
  await page.getByRole('button', { name: 'Create and add', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('URL separators');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const files = await page.evaluate(() =>
    (
      window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
    ).__cms.storage.snapshot(),
  );
  expect(
    JSON.parse(files['data/tags.json']!).tags.filter((t: { name: string }) => t.name === '新标签'),
  ).toHaveLength(1);
  expect(files['content/posts/a-smaller-web.md']).toContain('新标签');
});
