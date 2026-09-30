/**
 * The account panel.
 *
 * A Git-backed editor holds a credential that can write to a repository, and it can be opened on a
 * machine that is not the author's. Seeing which account is acting, and being able to drop it, is
 * the difference between a shared machine being usable and being a liability.
 */
import { test, expect } from '@playwright/test';

test('names the signed-in account and how the session was obtained', async ({ page }) => {
  await page.goto('/?account=1');
  const panel = page.locator('.account');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.account-name')).toHaveText('The Octocat');
  // The panel is translated like the rest of the chrome; the harness config is zh-CN.
  await expect(panel.locator('.account-via')).toHaveText('GitHub 账号登录');
});

test('signing out asks first, and can be cancelled', async ({ page }) => {
  await page.goto('/?account=1');
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.locator('.account-confirm')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  // Cancelling leaves the session alone.
  await expect(page.locator('.account-confirm')).toHaveCount(0);
  await expect(page.locator('.account-name')).toHaveText('The Octocat');
});

test('signing out returns to the connect screen', async ({ page }) => {
  await page.goto('/?account=1');
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.account-confirm').getByRole('button', { name: '退出登录' }).click();
  // The editor is gone and the author is asked for a backend again.
  await expect(page.locator('.account')).toHaveCount(0);
  await expect(page.locator('.connect')).toBeVisible();
});

test('a backend with no account shows no sign-out button', async ({ page }) => {
  await page.goto('/');
  // The memory backend reports no account, so the panel states what is being edited instead.
  await expect(page.locator('.account[data-account="local"]')).toBeVisible();
  await expect(page.locator('.account-signout')).toHaveCount(0);
});

test('stays visible while editing an article, not just on the collection list', async ({
  page,
}) => {
  // The sidebar used to stretch to the article form's height, which pushed this panel thousands of
  // pixels below the fold. Being in the DOM is not the same as being reachable.
  await page.goto('/?account=1');
  await page.getByRole('button', { name: '文章 · Markdown' }).click();
  await page.locator('.entry-link').first().click();
  await expect(page.locator('.entry-editor')).toBeVisible();

  const panel = page.locator('.account');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'the account panel must have a layout box').not.toBeNull();
  expect(
    box!.y,
    'the account panel must start inside the viewport on the editing screen',
  ).toBeLessThan(viewport.height);
});

test('the sidebar can scroll if its contents outgrow the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 480 });
  await page.goto('/?account=1');
  const sidebar = page.locator('.sidebar');
  const box = await sidebar.boundingBox();
  // A tall list of collections must scroll inside the sidebar rather than run off the page.
  expect(box!.height).toBeLessThanOrEqual(481);
  await expect(page.locator('.account')).toBeVisible();
});
