import { test, expect } from '@playwright/test';
test('selects, creates and removes tags without duplicates', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  await page.getByRole('button', { name: 'Remove 设计', exact: true }).click();
  const input = page.locator('#tags-field');
  await input.fill('设计');
  await input.press('Enter');
  await input.fill('新标签');
  await page.getByRole('option', { name: 'Create “新标签”', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove 新标签', exact: true })).toBeVisible();
  await expect(page.locator('.tag-chip')).toHaveText(['Web×', '设计×', '新标签×']);
  await page.locator('.tag-picker').screenshot({ path: 'test-results/tags-desktop.png' });
  await input.fill('新标签');
  await expect(page.getByRole('option', { name: 'Create “新标签”', exact: true })).toHaveCount(0);
  await input.fill('bad/tag');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('URL separators');
  await input.fill('');
  await input.press('Escape');
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

test('compact tags fit mobile and dismiss suggestions on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  for (const tag of ['摄影', '日常', '旅行记录', '随笔']) {
    await page.locator('#tags-field').fill(tag);
    await page.locator('#tags-field').press('Enter');
    await expect(page.getByRole('button', { name: `Remove ${tag}`, exact: true })).toBeVisible();
  }
  await expect(page.locator('.tag-chip')).toHaveCount(6);
  await page.locator('.tag-picker').screenshot({ path: 'test-results/tags-mobile.png' });
  await page.locator('#tags-field').fill('New');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.locator('#tags-field').press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const box = await page.locator('.tag-picker').boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
