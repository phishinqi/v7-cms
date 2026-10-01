import { test, expect } from '@playwright/test';

test('date-only fields offer Today and timestamp fields offer Now', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: '相册', exact: true }).click();
  await page.locator('.entry-link').first().click();
  const date = page.locator('#date-field');
  await expect(date).toHaveAttribute('type', 'date');
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await expect(date).toHaveValue(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link').first().click();
  const timestamp = page.locator('#pubDate-field');
  await expect(timestamp).toHaveAttribute('type', 'datetime-local');
  await page.getByRole('button', { name: 'Now', exact: true }).first().click();
  await expect(timestamp).toHaveValue(/T/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
});
