// Drives the real editor in a browser: pick a collection, open an entry, edit a field, save, and
// check both what landed and what was left alone.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));

await page.goto('http://127.0.0.1:5199/');
await page.waitForTimeout(2500);
console.log('NAV', await page.locator('.nav-link').allInnerTexts());
console.log('POSTS', await page.locator('.entry-link').allInnerTexts());

await page.getByRole('button', { name: '相册', exact: true }).click();
await page.waitForTimeout(800);
console.log('ALBUMS', await page.locator('.entry-link').allInnerTexts());
await page.screenshot({ path: 'packages/cms/.scratch/shot-list.png' });

await page.locator('.entry-link').first().click();
await page.waitForTimeout(800);
const title = page.locator('#title-field');
console.log('OPENED', await title.inputValue());
console.log('FIELD COUNT', await page.locator('.field').count());
console.log('PHOTO ROWS', await page.locator('.list-item').count());
await page.screenshot({ path: 'packages/cms/.scratch/shot-editor.png', fullPage: true });

// Edit the title, then save and inspect the backend.
await title.fill('城市边角（改过）');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(1500);
console.log('NOTICES', await page.locator('.notice').allInnerTexts());

const files = await page.evaluate(() => window.__cms.storage.snapshot());
const edited = files['content/albums/city-corners.md'];
console.log('EDIT LANDED', edited.includes('城市边角（改过）'));
console.log('QUOTING KEPT', edited.includes("date: '2026-09-12'"));
console.log('FLOW TAGS KEPT', edited.includes('tags: [street, architecture]'));
console.log('NESTED KEPT', edited.includes('camera: Demo Camera X1'));
console.log('OTHER FILE UNTOUCHED', files['content/albums/paper.md'].includes('纸面练习'));

// Only the edited line should differ from the original.
const original = `---
title: 城市边角
slug: city-corners
date: '2026-09-12'
draft: false
description: 窗格、台阶与路灯。
tags: [street, architecture]`;
for (const line of original.split('\n').filter((l) => l !== '---' && !l.startsWith('title:'))) {
  if (!edited.includes(line)) console.log('LOST LINE', JSON.stringify(line));
}
console.log('ERRORS', errors);
await browser.close();
