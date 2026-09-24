import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mode = process.env.CRUISE_QUALITY || 'HIGH', label = process.env.MAP_LABEL || 'before';
const evidence = `docs/phases_archive/map-continuity-2026-09-24/${label}-${mode}`;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW' });
const samples: any[] = [], errors: string[] = []; let sampling = true;
page.on('pageerror', e => errors.push(e.message));
await page.route('**/__catalog/manifest', async route => { await new Promise(done => setTimeout(done, 1800)); await route.continue(); });
await page.route('**/__catalog/tiles/**', async route => { await new Promise(done => setTimeout(done, 180)); await route.continue().catch(() => {}); });
try {
  await page.addInitScript(value => localStorage.setItem('universe_gfx_mode', value), mode);
  await page.goto('http://127.0.0.1:3014/'); await page.locator('#btn-start-game').click();
  await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill('Proxima');
  await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
  await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().starMap?.points > 0);
  const collect = (async () => { while (sampling && !page.isClosed()) {
    samples.push(await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot().starMap))));
    await page.waitForTimeout(50);
  } })();
  try {
    await page.waitForTimeout(2500); await page.screenshot({ path: `${evidence}/initial.png` });
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let step = 0; step < 5; step++) { await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.waitForTimeout(140); }
      const { width, height } = page.viewportSize()!;
      await page.mouse.move(width * .43, height * .43); await page.mouse.down();
      await page.mouse.move(width * .61, height * .52, { steps: 18 }); await page.mouse.up();
      await page.waitForTimeout(1000); await page.screenshot({ path: `${evidence}/orbit-${cycle}.png` });
      for (let step = 0; step < 5; step++) { await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await page.waitForTimeout(140); }
      await page.waitForTimeout(1000);
    }
    await page.getByRole('button', { name: 'Centre on star', exact: true }).click();
    await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().starMap.pending === 0, undefined, { timeout: 20000 });
    await page.waitForTimeout(700); await page.screenshot({ path: `${evidence}/settled.png` });
    const final = samples[samples.length - 1];
    assert.equal(final.selectedId, 'athyg:4.0:1440825'); assert.equal(final.errors, 0);
    assert.ok(samples.every(s => s.points > 0 && s.points <= s.maxPoints && s.tiles <= s.maxTiles));
    if (process.env.MAP_VERIFY === 'true') {
      assert.ok(samples.some(s => s.fadingTiles > 0), 'Tile changes must crossfade');
      assert.ok(samples.every(s => s.renderedPoints <= s.maxPoints * 2));
    }
    assert.equal(errors.length, 0);
    const swaps = samples.filter((s, i) => i && s.activeTileKeys.join(',') !== samples[i - 1].activeTileKeys.join(',')).length;
    console.log(JSON.stringify({ mode, label, swaps, samples: samples.length, finalPoints: final.points, errors }));
  } finally { sampling = false; await collect; }
} catch (error) { errors.push(String(error)); throw error; }
finally { await writeFile(`${evidence}/evidence.json`, JSON.stringify({ mode, label, samples, errors }, null, 2)); await browser.close(); }
