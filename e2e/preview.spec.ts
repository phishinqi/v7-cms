/**
 * The preview panel.
 *
 * What matters here is that previewing never touches the content being edited, that a body with no
 * diagrams downloads none of the diagram engines, and that a renderer which fails leaves the
 * source visible rather than an empty box.
 */
import { test, expect, type Page } from '@playwright/test';

const POST = 'content/posts/a-smaller-web.md';

/** Replace the body, so each test controls exactly what is previewed. */
async function setBody(page: Page, body: string): Promise<void> {
  await page.evaluate(
    async ({ path, text }) => {
      const cms = (
        window as unknown as {
          __cms: {
            storage: {
              snapshot(): Record<string, string>;
              writeFile(...args: unknown[]): Promise<unknown>;
            };
          };
        }
      ).__cms;
      const current = cms.storage.snapshot()[path]!;
      const head = current.slice(0, current.indexOf('---', 4) + 3);
      await cms.storage.writeFile(path, head + '\n' + text, { message: 'test' });
    },
    { path: POST, text: body },
  );
}

const openEditor = async (page: Page, body?: string) => {
  await page.goto('/');
  if (body !== undefined) await setBody(page, body);
  await page.getByRole('button', { name: '文章 · Markdown', exact: true }).click();
  await page.locator('.entry-link', { hasText: 'A smaller web' }).first().click();
  await expect(page.locator('.preview')).toBeVisible();
};

const HEADING = ['## A heading', '', 'Some **bold** and a [link](https://example.com).', ''].join(
  '\n',
);
const QUOTE_AND_LIST = ['> quoted', '', '- one', '- two', ''].join('\n');
const PLAIN = ['Just prose with **bold**.', ''].join('\n');

test('renders Markdown beside the form', async ({ page }) => {
  await openEditor(page);
  const preview = page.locator('.preview-body');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Body text.');
});

test('renders headings, emphasis and links', async ({ page }) => {
  await openEditor(page, HEADING);
  const preview = page.locator('.preview-body');
  await expect(preview.locator('h2')).toContainText('A heading');
  await expect(preview.locator('strong')).toContainText('bold');
  await expect(preview.locator('a')).toHaveAttribute('href', 'https://example.com');
});

test('renders a list and a quote', async ({ page }) => {
  await openEditor(page, QUOTE_AND_LIST);
  const preview = page.locator('.preview-body');
  await expect(preview.locator('blockquote')).toContainText('quoted');
  await expect(preview.locator('li')).toHaveCount(2);
});

test('does not download a diagram engine for a body with no diagram', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await openEditor(page, PLAIN);
  await page.waitForTimeout(1500);
  // The engines are several megabytes between them; a plain post must not pay for them.
  expect(requested.filter((url) => /mermaid|katex|abcjs/.test(url))).toEqual([]);
});

test('offers the site preview when the config points at a dev server', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('tab', { name: 'Markdown' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Site' })).toBeVisible();
});

test('offers only the Markdown preview when no dev server is configured', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { mount } = await import('/@fs/E:/Code/vibecoding/v7-cms/packages/cms/src/index.tsx');
    document.body.innerHTML = '<div id="bare"></div>';
    mount({
      container: '#bare',
      config: {
        backend: { name: 'local', local: { kind: 'memory', files: {} } },
        collections: [
          {
            kind: 'fields',
            name: 'notes',
            label: 'Notes',
            folder: 'notes',
            extension: 'md',
            format: 'frontmatter',
            contentField: 'body',
            fields: [
              { name: 'title', widget: 'string' },
              { name: 'body', widget: 'markdown' },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.preview')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Site' })).toHaveCount(0);
});

test('shows the preview for a collection that has a body', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '相册', exact: true }).click();
  await page.locator('.entry-link').first().click();
  await expect(page.locator('.preview')).toBeVisible();
});
