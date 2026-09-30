/**
 * Editing from the page itself.
 *
 * The author clicks the paragraph they want to change and lands on the field that produced it,
 * instead of hunting for it in a form. The embedded page is a fixture that opted in by marking
 * each element with the frontmatter path it renders.
 *
 * This runs against a same-origin frame, which is the setup the editor can inject into. A
 * cross-origin dev server needs the site to serve the bridge itself; the protocol is the same and
 * is covered by the unit tests.
 */
import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/?incontext=1&locale=zh-CN');
  await page.getByRole('button', { name: '文章 · Markdown' }).click();
  await page.locator('.entry-link').first().click();
  await expect(page.locator('.entry-editor')).toBeVisible();
};

/** The preview frame, once the bridge has announced itself. */
const frame = (page: Page) => page.frameLocator('iframe[title="站点"]');

test('opens on the site preview when in-context editing is configured', async ({ page }) => {
  await open(page);
  // The tab is selected because editing in place is the point; Markdown preview would not help.
  await expect(page.getByRole('tab', { name: '站点' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.preview')).toHaveAttribute('data-in-context', 'true');
  await expect(page.locator('.field-hint')).toContainText('点击页面上的文字');
});

test('the marked nodes are outlined, and unmarked ones are left alone', async ({ page }) => {
  await open(page);
  const heading = frame(page).locator('[data-v7-field="title"]');
  await expect(heading).toBeVisible();
  // Hovering is what draws the outline, so the author can see what is editable before clicking.
  await heading.hover();
  await expect(heading).toHaveAttribute('data-v7-hover', '');
  // A paragraph the theme did not mark stays inert.
  const plain = frame(page).locator('p:not([data-v7-field])');
  await plain.hover();
  await expect(plain).not.toHaveAttribute('data-v7-hover', '');
});

test('clicking a marked element focuses the field that produced it', async ({ page }) => {
  await open(page);
  await frame(page).locator('[data-v7-field="description"]').click();
  // The form's description control takes focus, so typing needs no further click.
  const control = page.locator(
    '[data-field="description"] textarea, [data-field="description"] input',
  );
  await expect(control.first()).toBeFocused();
});

test('clicking a link inside the frame does not navigate away', async ({ page }) => {
  await open(page);
  // A pick is an edit gesture; following the link would throw away the author's place.
  const before = page.url();
  await frame(page).locator('[data-v7-field="title"]').click();
  expect(page.url()).toBe(before);
  await expect(page.locator('.entry-editor')).toBeVisible();
});
