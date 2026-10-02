import { tiff, withExif } from '../packages/cms/test/exif-fixture.js';
import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';

async function openAlbum(page: Page, mode = '') {
  await page.goto(`/?locale=en${mode ? `&media=${mode}` : ''}`);
  await page.evaluate(() => sessionStorage.setItem('v7-cms-token', 'test-token'));
  await page.getByRole('button', { name: '相册', exact: true }).click();
  await page.locator('.entry-link').first().click();
}

async function choose(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 6;
    canvas.getContext('2d')!.fillRect(0, 0, 8, 6);
    return canvas.toDataURL().split(',')[1]!;
  });
  await page
    .locator('[data-field="src"]')
    .first()
    .locator('input[type=file]')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
}

test('a real browser encodes and writes an image into the content backend before saving its URL', async ({
  page,
}) => {
  await openAlbum(page);
  await choose(page);
  const src = page.locator('#images-0-src-field');
  await expect(src).toHaveValue(/\/images\/albums\/city-corners\/test-.*\.webp/);
  const url = await src.inputValue();
  const bytes = await page.evaluate(async (path) => {
    const storage = (
      window as unknown as { __cms: { storage: { readBinary(path: string): Promise<Uint8Array> } } }
    ).__cms.storage;
    return Array.from(await storage.readBinary(`public${path}`));
  }, url);
  expect(Buffer.from(bytes).subarray(8, 12).toString()).toBe('WEBP');
  await expect(page.locator('#images-0-width-field')).toHaveValue('8');
  await expect(page.locator('#images-0-height-field')).toHaveValue('6');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const saved = await page.evaluate(
    () =>
      (
        window as unknown as { __cms: { storage: { snapshot(): Record<string, string> } } }
      ).__cms.storage.snapshot()['content/albums/city-corners.md'],
  );
  expect(saved).toContain(url);
});

test('a HEIC photo is decoded in the browser and uploaded as WebP', async ({ page }) => {
  await openAlbum(page);
  // Small sample from the MIT-licensed heic2any demo.
  await page
    .locator('[data-field="src"]')
    .first()
    .locator('input[type=file]')
    .setInputFiles(resolve('e2e/fixtures/photo.heic'));
  const src = page.locator('#images-0-src-field');
  await expect(src).toHaveValue(/\/images\/albums\/city-corners\/photo-.*\.webp/);
  const bytes = await page.evaluate(
    async (url) => {
      const storage = (
        window as unknown as {
          __cms: { storage: { readBinary(path: string): Promise<Uint8Array> } };
        }
      ).__cms.storage;
      return Array.from(await storage.readBinary(`public${url}`));
    },
    await src.inputValue(),
  );
  expect(Buffer.from(bytes).subarray(8, 12).toString()).toBe('WEBP');
  expect(Number(await page.locator('#images-0-width-field').inputValue())).toBeGreaterThan(0);
  expect(Number(await page.locator('#images-0-height-field').inputValue())).toBeGreaterThan(0);
});

test('R2 failure preserves the image, then success uses the server URL', async ({ page }) => {
  let fail = true;
  await page.route('**/api/media', async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer test-token');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await route.fulfill({
      status: fail ? 403 : 201,
      json: fail
        ? { error: 'Upload denied' }
        : {
            src: 'https://img.example/images/r2.webp',
            width: 8,
            height: 6,
            srcset: 'https://img.example/images/r2.webp 8w',
          },
    });
  });
  await openAlbum(page, 'r2');
  const before = await page.locator('#images-0-src-field').inputValue();
  await choose(page);
  await expect(page.getByRole('status')).toHaveText('Upload denied');
  await expect(page.locator('#images-0-src-field')).toHaveValue(before);
  fail = false;
  await choose(page);
  await expect(page.locator('#images-0-src-field')).toHaveValue(
    'https://img.example/images/r2.webp',
  );
  await expect(page.locator('#images-0-srcset-field')).toHaveValue(
    'https://img.example/images/r2.webp 8w',
  );
});

test('independent repository receives the upload on its own branch', async ({ page }) => {
  let uploaded = false;
  await page.route('https://api.github.com/repos/owner/media/contents/images/**', async (route) => {
    expect(route.request().method()).toBe('PUT');
    const body = route.request().postDataJSON();
    expect(body.branch).toBe('assets');
    expect(Buffer.from(body.content, 'base64').subarray(8, 12).toString()).toBe('WEBP');
    uploaded = true;
    await route.fulfill({ status: 201, json: { content: { sha: 'new' } } });
  });
  await openAlbum(page, 'github');
  await choose(page);
  await expect(page.locator('#images-0-src-field')).toHaveValue(
    /https:\/\/img.example\/images\/test-.*\.webp/,
  );
  expect(uploaded).toBe(true);
});

test('upload prefills EXIF into nested photo fields and persists it', async ({ page }) => {
  await openAlbum(page);
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 6;
    return canvas.toDataURL('image/jpeg').split(',')[1]!;
  });
  const file = withExif(
    Buffer.from(jpeg, 'base64'),
    tiff(
      [[0x0110, 2, 'Camera X']],
      [
        [0x8827, 3, 400],
        [0x9003, 2, '2026:10:01 12:00:00'],
      ],
    ),
  );
  await page.locator('#images-0-photo-camera-field').fill('');
  await page.locator('#images-0-photo-iso-field').fill('');
  await page.locator('#images-0-date-field').fill('');
  await page
    .locator('[data-field="src"]')
    .first()
    .locator('input[type=file]')
    .setInputFiles({
      name: 'exif.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(file),
    });
  await expect(page.locator('#images-0-photo-camera-field')).toHaveValue('Camera X');
  await expect(page.locator('#images-0-photo-iso-field')).toHaveValue('400');
  await expect(page.locator('#images-0-date-field')).toHaveValue('2026-10-01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
});
