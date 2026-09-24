import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const evidence = 'docs/phases_archive/map-design-2026-09-24';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results: any[] = [];
try {
  for (const [name, width, height] of [['HIGH', 1440, 810], ['LOW', 844, 390]] as const) {
    if (process.env.MAP_LAYOUT_ONLY && process.env.MAP_LAYOUT_ONLY !== name) continue;
    const page = await browser.newPage({ viewport: { width, height }, isMobile: name !== 'HIGH', hasTouch: name !== 'HIGH' });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), name === 'HIGH' ? 'HIGH' : 'LOW');
    await page.goto('http://127.0.0.1:3014/'); await page.locator('#btn-start-game').click();
    await page.locator('#btn-star-map').click();
    await expect(page.locator('.star-map__card h2')).toHaveText('Sol');
    await expect(page.locator('.star-map__planet')).toHaveCount(8);
    await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().starMap.points > 0);
    await page.waitForTimeout(1500); await page.screenshot({ path: `${evidence}/${name}-sol.png` });
    await page.getByRole('button', { name: 'Inspect planet Mars', exact: true }).click();
    await expect(page.locator('.star-map__planet-detail')).toContainText('Solar System planet');
    await page.getByRole('button', { name: 'Set destination: Mars', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/${name}-mars.png` });
    await page.getByRole('button', { name: 'Set destination: Mars', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal(await page.evaluate(() => (window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.selected), 'sol/mars');
    await expect(page.locator('.system-navigation')).toContainText('Mars');
    await page.locator('#btn-star-map').click();
    await page.locator('#star-map-search').fill('Proxima');
    await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
    await expect(page.locator('.star-map__planet')).toHaveCount(4);
    await expect(page.locator('.star-map__system')).toContainText('not confirmed observations');
    await page.getByRole('button', { name: 'Inspect planet World 2', exact: true }).click();
    await expect(page.locator('.star-map__planet-detail')).toContainText('Warp to Proxima Centauri');
    await expect(page.getByRole('button', { name: /Set destination:/ })).toHaveCount(0);
    await page.locator('.star-map__card h2').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000); await page.screenshot({ path: `${evidence}/${name}-proxima.png` });
    const layout = await page.evaluate(() => {
      const selectors = ['.star-map__header', '.star-map__search', '.star-map__card', '.star-map__tools'];
      const boxes = selectors.map(selector => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
      return { boxes, viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale }, horizontalOverflow: document.querySelector('.star-map')!.scrollWidth > innerWidth };
    });
    await writeFile(`${evidence}/${name}-layout.json`, JSON.stringify(layout, null, 2));
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.viewport.width, width); assert.equal(layout.viewport.height, height);
    for (const box of layout.boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.right <= width && box.bottom <= height, JSON.stringify(box));
    for (let i = 0; i < layout.boxes.length; i++) for (let j = i + 1; j < layout.boxes.length; j++) {
      const a = layout.boxes[i], b = layout.boxes[j]; assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${a.selector} overlaps ${b.selector}`);
    }
    await page.getByRole('button', { name: 'Close star map' }).click();
    assert.equal(await page.evaluate(() => (window as any).__UNIVERSE_DEBUG__.snapshot().flightInputBlocked), false);
    assert.deepEqual(errors, []); results.push({ name, layout, errors, passed: true }); await page.close();
  }
} finally { await writeFile(`${evidence}/verification.json`, JSON.stringify(results, null, 2)); await browser.close(); }
console.log(JSON.stringify(results.map(({name, passed}) => ({ name, passed }))));
