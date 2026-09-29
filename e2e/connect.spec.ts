/**
 * The connect screen.
 *
 * The editor cannot do anything until a backend exists, so this is the first thing an author sees
 * on a fresh setup. It is checked here rather than only in unit tests because whether the right
 * options appear — and whether a failure is explained — is a whole-screen property.
 */
import { test, expect, type Page } from '@playwright/test';

const mountWith = (page: Page, config: unknown) =>
  page.evaluate(async (value) => {
    const { mount } = await import('/@fs/E:/Code/vibecoding/v7-cms/packages/cms/src/index.tsx');
    document.body.innerHTML = '<div id="host"></div>';
    mount({ container: '#host', config: value });
  }, config);

const localConfig = {
  backend: { name: 'local', local: { kind: 'proxy', url: 'http://127.0.0.1:5177' } },
  collections: [
    {
      kind: 'fields',
      name: 'posts',
      label: 'Posts',
      folder: 'content/posts',
      extension: 'md',
      format: 'frontmatter',
      fields: [{ name: 'title', widget: 'string' }],
    },
  ],
};

const githubConfig = {
  backend: { name: 'github', repo: 'owner/repo', branch: 'main' },
  collections: localConfig.collections,
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('offers the proxy option and explains where the token comes from', async ({ page }) => {
  await mountWith(page, localConfig);
  await expect(page.locator('.connect h1')).toContainText('local repository');
  await expect(page.locator('.connect')).toContainText('npx @v7-cms/proxy');
  await expect(page.locator('#proxy-url')).toHaveValue('http://127.0.0.1:5177');
  await expect(page.locator('#proxy-token')).toBeVisible();
  // Connecting is not possible without a token, so the button says so.
  await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled();
});

test('explains a proxy that is not running rather than failing silently', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await mountWith(page, localConfig);
  await page.locator('#proxy-token').fill('some-token');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.connect .notice.error')).toBeVisible({ timeout: 10_000 });
});

test('offers both GitHub paths when a relay is configured', async ({ page }) => {
  await mountWith(page, {
    ...githubConfig,
    backend: { ...githubConfig.backend, authBase: 'https://relay.example' },
  });
  await expect(page.getByRole('tab', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Access token' })).toBeVisible();
  // The OAuth path is the default when it is available.
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('offers only the token path when no relay is configured', async ({ page }) => {
  await mountWith(page, githubConfig);
  await expect(page.locator('.connect h1')).toContainText('owner/repo');
  await expect(page.locator('#token')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sign in with GitHub' })).toHaveCount(0);
});

test('switches between the GitHub options', async ({ page }) => {
  await mountWith(page, {
    ...githubConfig,
    backend: { ...githubConfig.backend, authBase: 'https://relay.example' },
  });
  await page.getByRole('tab', { name: 'Access token' }).click();
  await expect(page.locator('#token')).toBeVisible();
  await page.getByRole('tab', { name: 'Sign in with GitHub' }).click();
  await expect(page.locator('#token')).toHaveCount(0);
});

test('rejects a bad token with the reason from GitHub', async ({ page }) => {
  await page.route('**/api.github.com/user', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"message":"Bad credentials"}',
    }),
  );
  await mountWith(page, githubConfig);
  await page.locator('#token').fill('ghp_notreal');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.locator('.connect .notice.error')).toContainText('rejected by GitHub');
});

test('the folder option is offered only where the browser supports it', async ({ page }) => {
  await mountWith(page, {
    ...localConfig,
    backend: { name: 'local', local: { kind: 'fs-access' } },
  });
  // Chromium supports it, so both local paths should be on offer.
  const tabs = await page.getByRole('tab').allInnerTexts();
  expect(tabs).toContain('Local folder');
  expect(tabs).toContain('Local proxy');
});
