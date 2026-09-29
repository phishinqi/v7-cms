// Drives the real editor in a browser: pick a collection, open an entry, edit a field, save, and
// check what landed in the backend.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));

await page.goto('http://127.0.0.1:5199/');
await page.waitForTimeout(2500);
console.log('NAV', await page.locator('.nav-link').allInnerTexts());
console.log('ENTRIES', await page.locator('.entry-link').allInnerTexts());
await page.screenshot({ path: '../.scratch/cms-shell.png', fullPage: false });

// The first collection is posts-md; switch to the album collection.
await page.getByRole('button', { name: '相册', exact: true }).click();
await page.waitForTimeout(800);
console.log('ALBUM ENTRIES', await page.locator('.entry-link').allInnerTexts());
await page.locator('.entry-link').first().click();
await page.waitForTimeout(800);
console.log('FIELDS', await page.locator('.field-label').allInnerTexts());
const title = page.locator('#title-field');
console.log('TITLE VALUE', await title.inputValue());
await page.screenshot({ path: '../.scratch/cms-album.png', fullPage: true });

// Edit the title and save.
await title.fill('纸面练习（改过）');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(1200);
const saved = await page.evaluate(() => window.__cms.storage.snapshot()['content/albums/paper.md']);
console.log('NOTICES', await page.locator('.notice').allInnerTexts());
console.log(
  'SAVED DIFF CHECK',
  saved.includes('纸面练习（改过）'),
  saved.includes("date: '2026-09-01'"),
);
const before = saved.split('\n');

// The image list should show both photos with readable summaries.
console.log('LIST SUMMARIES', await page.locator('.list-summary').allInnerTexts());
console.log('ERRORS', errors);
console.log('SAVED TEXT\n' + before.slice(0, 14).join('\n'));
await browser.close();
