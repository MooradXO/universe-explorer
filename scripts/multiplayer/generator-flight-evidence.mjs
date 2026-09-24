import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SOLAR_SYSTEM } from '../../src/world/systems/SystemDescriptor.ts';
import { stellarAddress } from '../../src/world/space/StellarAddress.ts';
import { worldPosition } from '../../src/world/space/WorldPosition.ts';
const label = process.env.LABEL || 'before';
const root = `docs/phases_archive/generator-expansion-2026-09-24/flight-${label}`;
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
try {
  for (const mode of ['HIGH', 'LOW']) {
    const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW' });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error' && !e.text().includes('favicon')) errors.push(e.text()); });
    const body = SOLAR_SYSTEM.bodies[4];
    const position = body.position.map((v, i) => v + (i === 2 ? body.radius + 1800 : 0));
    const save = { version: 1, address: stellarAddress(SOLAR_SYSTEM.anchor, worldPosition(undefined, position)), spectrum: SOLAR_SYSTEM.spectrum, rotation: [0, 0, 0, 1], visited: [] };
    await page.addInitScript(({ mode, save }) => { localStorage.setItem('universe_gfx_mode', mode); localStorage.setItem('universe:stellar-flight:v1:guest', JSON.stringify(save)); }, { mode, save });
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:3014/'); await page.locator('#btn-start-game').click();
    await page.waitForTimeout(1800); await page.keyboard.press('v'); await page.waitForTimeout(450);
    const snap = () => page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot());
    const idle = await snap(); await page.screenshot({ path: `${root}/${mode}-jupiter.png` });
    const size = page.viewportSize(), x = size.width / 2, y = size.height / 2;
    await page.mouse.move(x, y); await page.waitForTimeout(150); await page.mouse.click(x, y);
    await page.waitForTimeout(180);
    const clicked = await snap(), objectPanel = await page.locator('.object-window').count();
    if (label === 'after') {
      assert.equal(objectPanel, 0); assert.equal(clicked.flightInputBlocked, false);
      assert.equal(clicked.world.space.system.bodies.find(b => b.id === body.id).surface.texture, 'ready');
      // Firing still works; mobile has its own dedicated button.
      const fire = mode === 'LOW' ? page.getByRole('button', { name: 'FIRE', exact: true }) : null;
      if (fire) { const box = await fire.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); }
      await page.mouse.down(); await page.waitForTimeout(450); const firing = await snap(); await page.mouse.up();
      assert.ok(firing.world.audio.weapons.played.laser > idle.world.audio.weapons.played.laser);
      await page.evaluate(() => document.exitPointerLock());
      await page.locator('#btn-star-map').click();
      await page.locator('#star-map-search').fill('Sol');
      await page.getByRole('button', { name: 'Select Sol', exact: true }).click();
      await page.getByRole('button', { name: 'Inspect planet Jupiter', exact: true }).click();
      await page.screenshot({ path: `${root}/${mode}-map-information.png` });
      await page.keyboard.press('Escape'); assert.equal((await snap()).flightInputBlocked, false);
    }
    results.push({ mode, idle, clicked, objectPanel }); await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(`${root}/evidence.json`, JSON.stringify({ results, errors }, null, 2)); await browser.close(); }
console.log(JSON.stringify({ label, cases: results.length, errors }));
