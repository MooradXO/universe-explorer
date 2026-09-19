import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:3001';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Use a local preview URL');
const output = resolve('docs/phases_archive/online-catalog-2026-09-15');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
try {
  for (const mode of ['HIGH', 'LOW']) {
    const page = await browser.newPage({ viewport: mode === 'HIGH' ? { width: 1440, height: 810 } : { width: 844, height: 390 } });
    const issues = []; page.on('pageerror', error => issues.push(error.message));
    await page.addInitScript(graphics => localStorage.setItem('universe_gfx_mode', graphics), mode);
    await page.goto(base + '/?spaceSmoke=near-base');
    await page.locator('#btn-start-game').click(); await page.locator('#btn-guest-login').click();
    await page.locator('#start-screen').waitFor({ state: 'detached' });
    await page.locator('#btn-star-map').click();
    await page.locator('#star-map-search').fill('Proxima');
    await page.getByRole('button', { name: 'Выбрать Proxima Centauri', exact: true }).click();
    await page.getByRole('button', { name: 'Изучить: Gaia и SIMBAD' }).click();
    await page.locator('.star-map__source h3').filter({ hasText: 'SIMBAD' }).waitFor();
    await page.locator('.star-map__source').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, `${mode.toLowerCase()}-live-proxima.png`) });
    await page.locator('#star-map-search').fill('M31');
    await page.getByText('Gaia · SIMBAD · NED', { exact: true }).click();
    await page.getByRole('combobox').selectOption('ned');
    await page.getByRole('button', { name: 'Искать в источнике' }).click();
    await page.locator('.star-map__observation h4').filter({ hasText: 'Messier 031' }).waitFor();
    await page.locator('.star-map__card').evaluate(card => { card.scrollTop = 0; });
    await page.locator('.star-map__search').evaluate(panel => { panel.scrollTop = 0; });
    await page.screenshot({ path: join(output, `${mode.toLowerCase()}-live-m31.png`) });
    if (issues.length) throw new Error(issues.join('\n'));
    console.log(`${mode}: live Gaia/SIMBAD/NED cards captured without page errors`);
    await page.close();
  }
} finally { await browser.close(); }
