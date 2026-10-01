import { test, expect } from '@playwright/test';

test('author chips show names, save IDs and preserve the registry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?locale=en');
  const registry = JSON.stringify({
    authors: [null, {}, { id: 'v7', name: 'V7' }, { id: 'guest', name: 'Guest Author' }],
  });
  await page.evaluate(async (registry) => {
    const storage = (
      window as unknown as {
        __cms: {
          storage: {
            writeFile(path: string, text: string, options: { message: string }): Promise<unknown>;
          };
        };
      }
    ).__cms.storage;
    await storage.writeFile('data/authors.json', registry, { message: 'fixture' });
  }, registry);
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  const field = page.locator('[data-field=authors]').first();
  const input = field.getByRole('combobox');
  await input.fill('V7');
  await input.press('Enter');
  await input.fill('guest');
  await input.press('Enter');
  await expect(field.locator('.tag-chip')).toHaveText(['V7×', 'Guest Author×']);
  await input.fill('Guest');
  await expect(field.getByRole('option')).toHaveCount(0);
  await input.fill('');
  await input.press('Escape');
  const box = await field.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await field.screenshot({ path: 'test-results/authors-mobile.png' });
  await field.getByRole('button', { name: 'Remove V7', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const files = await page.evaluate(() =>
    (
      window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
    ).__cms.storage.snapshot(),
  );
  expect(files['content/posts/a-smaller-web.md']).toMatch(/authors:\s*\n\s*- guest/);
  expect(files['content/posts/a-smaller-web.md']).not.toContain('Guest Author');
  expect(files['data/authors.json']).toBe(registry);
  expect(errors).toEqual([]);
});
