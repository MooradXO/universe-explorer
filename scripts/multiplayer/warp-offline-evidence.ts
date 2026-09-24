import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mode of ['HIGH', 'LOW']) {
    const dir = `docs/phases_archive/warp-transition-2026-09-24/offline-${mode}`; await mkdir(dir, { recursive: true });
    const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, hasTouch: mode === 'LOW', isMobile: mode === 'LOW', recordVideo: { dir } });
    const errors: string[] = [], frames: any[] = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mode);
      await page.goto('http://127.0.0.1:3014/'); await page.locator('#btn-start-game').click(); await page.waitForTimeout(700);
      if (mode === 'LOW') await page.keyboard.press('v');
      await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill('Proxima');
      await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
      await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
      for (let i = 0; i < 62; i++) { await page.waitForTimeout(75); frames.push(await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())))); }
      for (const phase of ['charge', 'entry', 'tunnel', 'exit', 'idle']) assert.ok(frames.some(f => f.world.flightFX.effects.warp.phase === phase));
      const last = frames[frames.length - 1]; assert.equal(last.world.travel.systemId, 'athyg:4.0:1440825'); assert.ok(!last.flightInputBlocked);
      assert.ok(Math.abs(last.world.ship.cameraFov - 75) < 1); assert.deepEqual(errors, []);
      console.log(`${mode}: offline warp phases, arrival, camera recovery PASS`);
    } finally {
      await writeFile(`${dir}/evidence.json`, JSON.stringify({ mode, frames, errors }, null, 2));
      const video = page.video(); await page.close(); if (video) await rename(await video.path(), `${dir}/warp.webm`);
    }
  }
} finally { await browser.close(); }
