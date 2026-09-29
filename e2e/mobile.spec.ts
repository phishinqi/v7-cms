/**
 * The editor on a phone.
 *
 * What matters is reachability rather than appearance: the things you need while editing have to
 * be within reach of a thumb, and nothing may overflow sideways. The editor is a full application
 * in a small viewport, so a horizontal scrollbar is a real defect, not a cosmetic one.
 */
import { test, expect, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

const openEntry = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link', { hasText: 'A smaller web' }).first().click();
  await expect(page.locator('.body-field')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE);
});

test('nothing overflows sideways', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openEntry(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the save action stays reachable while scrolled down the form', async ({ page }) => {
  await openEntry(page);
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await page.locator('.body-field').scrollIntoViewIfNeeded();
  // The header is sticky on small screens, so saving does not mean scrolling back up.
  await expect(save).toBeInViewport();
});

test('tap targets are large enough to hit', async ({ page }) => {
  await openEntry(page);
  const save = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
  expect(save!.height).toBeGreaterThanOrEqual(32);
  const entry = await page.locator('.entry-link').first().boundingBox();
  expect(entry!.height).toBeGreaterThanOrEqual(32);
});

test('the source editor is bounded rather than filling the screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '文章 · MDX 源码', exact: true }).click();
  await page.locator('.entry-link').first().click();
  const scroller = page.locator('.source-editor .cm-scroller');
  await expect(scroller).toBeVisible();
  const box = await scroller.boundingBox();
  // A viewport-tall editor leaves nowhere to scroll to the rest of the form.
  expect(box!.height).toBeLessThanOrEqual(PHONE.height);
});

test('the editor is usable with a touch pointer', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: PHONE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).tap();
  await page.locator('.entry-link').first().tap();
  await expect(page.locator('.field-label').first()).toBeVisible();
  await context.close();
});

test('the preview sits below the form rather than beside it', async ({ page }) => {
  await openEntry(page);
  const editor = (await page.locator('.entry-editor').boundingBox())!;
  const preview = (await page.locator('.entry-preview').boundingBox())!;
  // Stacked, not side by side: the preview starts below where the form ends.
  expect(preview.y).toBeGreaterThanOrEqual(editor.y + editor.height - 1);
});
