/**
 * The editor chrome follows `config.locale`.
 *
 * Before this, `locale` was accepted and ignored: the interface rendered English regardless, and
 * no test noticed because the collections' own labels come from the consumer's config and were
 * already translated there. These tests read the chrome, not the content.
 */
import { test, expect } from '@playwright/test';

test('the editor renders its chrome in Chinese when the config asks for it', async ({ page }) => {
  await page.goto('/');
  // The harness config sets locale: 'zh-CN'.
  await expect(page.locator('.sidebar .brand')).toHaveText('V7 CMS');
  await expect(page.locator('.nav-heading')).toHaveText('设置');
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  await expect(page.locator('.notice').filter({ hasText: '选择一条内容' })).toBeVisible();
});

test('switching locale to English translates the chrome', async ({ page }) => {
  await page.goto('/?locale=en');
  await expect(page.locator('.nav-heading')).toHaveText('Settings');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
});

test('a save reports itself in the configured language', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '文章 · Markdown' }).click();
  await page.locator('.entry-link').first().click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除', exact: true })).toBeVisible();
});
