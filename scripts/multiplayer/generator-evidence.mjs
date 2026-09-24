import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const root = `docs/phases_archive/generator-expansion-2026-09-24/${process.env.LABEL || 'before'}`;
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
try {
  for (const quality of ['HIGH', 'LOW']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(`${process.env.PREVIEW_URL || 'http://127.0.0.1:3014'}/environments.html?world=4&quality=${quality}`);
    await page.waitForFunction(() => window.__UNIVERSE_ENVIRONMENTS__?.snapshot().fps > 0);
    for (const world of [4, 5, 2, 8, 9, 10, 11]) {
      await page.locator('#world').selectOption(String(world));
      await page.waitForTimeout(1700);
      const state = await page.evaluate(() => window.__UNIVERSE_ENVIRONMENTS__.snapshot());
      await page.locator('#stage').screenshot({ path: `${root}/${quality}-world-${world}.png` });
      results.push({ quality, world, state });
    }
    await page.close();
  }
} finally { await writeFile(`${root}/evidence.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
console.log(JSON.stringify({ cases: results.length, errors }));
if (errors.length) process.exitCode = 1;
