import { test, expect } from '@playwright/test';

const files = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
    ).__cms.storage.snapshot(),
  );

test('inserts, previews, edits and repositions an article illustration', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link', { hasText: 'A smaller web' }).first().click();

  await page.getByRole('button', { name: 'Insert illustration', exact: true }).click();
  await page.locator('#article-figure-src').fill('/images/photo.webp');
  await page.getByLabel('Alternative text').fill('Street scene');
  await page.getByLabel('Caption').fill('Evening on the corner');
  await page.getByLabel('Article position').selectOption('after:0');
  await page.getByLabel('Display width (px)').fill('420');
  await page.getByLabel('Display height (px, optional)').fill('280');
  await page.getByRole('button', { name: 'Wrap text on left' }).click();
  await page.locator('.figure-composer-actions .primary').click();

  await expect(page.locator('.body-field')).toHaveAttribute('data-mode', 'source');
  await page.getByRole('tab', { name: 'Markdown' }).click();
  const preview = page.locator('.preview-body figure[data-v7-figure="1"]');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-v7-align', 'wrap-right');
  await expect(preview.locator('figcaption')).toHaveText('Evening on the corner');
  await expect(preview).toHaveAttribute('style', /width: 420px/);
  await expect(preview.locator('img')).toHaveCSS('height', '280px');

  await page.getByLabel('Edit an illustration').selectOption('0');
  await page.getByLabel('Caption').fill('Revised caption');
  await page.getByLabel('Article position').selectOption('start');
  await page.getByRole('button', { name: 'Center', exact: true }).click();
  await page.locator('.figure-composer-actions .primary').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Saved');

  const saved = (await files(page))['content/posts/a-smaller-web.md']!;
  expect(saved.indexOf('<figure')).toBeLessThan(saved.indexOf('Body text.'));
  expect(saved).toContain('data-v7-align="center"');
  expect(saved).toContain('<figcaption>Revised caption</figcaption>');
  expect(saved).toContain('width="420"');
  expect(saved).toContain('height="280"');

  await page.getByLabel('Edit an illustration').selectOption('0');
  await page.getByRole('button', { name: 'Remove illustration' }).click();
  await expect(page.getByLabel('Edit an illustration')).toHaveCount(0);
  await expect(page.locator('.preview-body figure[data-v7-figure="1"]')).toHaveCount(0);
});

test('the Markdown preview sanitizes raw HTML', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '文章 · MDX 源码', exact: true }).click();
  await page.locator('.entry-link', { hasText: '小组件' }).first().click();
  await page.locator('.source-editor .cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n<img src="/x" onerror="window.__v7Xss = 1" />');
  await page.getByRole('tab', { name: 'Markdown' }).click();
  await expect(page.locator('.preview-body img[src="/x"]')).toBeVisible();
  await expect(page.locator('.preview-body img[onerror]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __v7Xss?: number }).__v7Xss),
  ).toBeUndefined();
});
