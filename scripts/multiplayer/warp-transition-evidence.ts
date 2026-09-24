import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { startServer } from '../../server/index';
const mode = process.env.CRUISE_QUALITY || 'HIGH', label = process.env.WARP_LABEL || 'before';
const verify = label !== 'before', dir = `docs/phases_archive/warp-transition-2026-09-24/${label}-${mode}`;
await mkdir(dir, { recursive: true });
const isolated = await startServer({ port: 2567, store: null, allowBots: false, maxPlayers: 50 });
isolated.server.simulateLatency(240);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, hasTouch: mode === 'LOW', isMobile: mode === 'LOW', recordVideo: { dir } });
const errors: string[] = [], samples: any[] = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = (): Promise<any> => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot()))))));
try {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mode);
  await page.goto('http://127.0.0.1:3012/'); await page.locator('#btn-start-game').click();
  await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__?.snapshot().realtime.subscribed);
  const game = isolated.room.game, pilot = [...game.pilots.values()][0], originalAction = game.action.bind(game);
  const request = async (star: string) => {
    await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill(star);
    await page.getByRole('button', { name: `Select ${star}`, exact: true }).click();
    await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
  };
  for (const [index, star] of (verify ? ['Proxima Centauri', 'Sirius'] : ['Proxima Centauri']).entries()) {
    if (index) { isolated.server.simulateLatency(1200); await page.keyboard.press('v'); }
    const before = await snapshot(); await request(star);
    const trip: any[] = [], pictured = new Set<string>(); let confirmed = false, sawPending = false;
    samples.push({ scenario: star, rtt: index ? 1200 : 240, before, trip });
    for (let i = 0; i < 75; i++) {
      await page.waitForTimeout(65); const s = await snapshot(), fx = s.world.flightFX.effects.warp;
      trip.push({ s, serverWarp: pilot.warp?.id ?? null, serverSystem: pilot.systemId });
      if (s.world.travel.warping) {
        confirmed = true;
        const right = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().fromArray(s.world.ship.rotation));
        assert.ok(Math.abs(right.y) < 1e-5); assert.ok(fx.requested);
      } else if (!confirmed && s.world.travel.systemId === before.world.travel.systemId) {
        sawPending = true; assert.ok(!fx.requested);
      }
      const stage = fx.phase ?? (fx.requested ? 'old-portal' : 'idle');
      if (!pictured.has(stage) && (stage !== 'charge' || fx.elapsed > .3)) {
        pictured.add(stage); await page.screenshot({ path: `${dir}/${index}-${stage}.png` });
      }
    }
    const last = trip[trip.length - 1].s; assert.ok(confirmed); assert.notEqual(last.world.travel.systemId, before.world.travel.systemId); assert.equal(last.world.travel.systemId, pilot.systemId);
    assert.ok(!last.world.travel.warping); assert.ok(!last.world.flightFX.effects.warp.requested);
    if (verify) {
      for (const phase of ['charge', 'entry', 'tunnel', 'exit', 'idle']) assert.ok(trip.some(f => f.s.world.flightFX.effects.warp.phase === phase), `${star}: ${phase}`);
      assert.ok(sawPending); assert.ok(trip.some(f => f.s.world.ship.cameraFov > 95));
      assert.ok(Math.abs(last.world.ship.cameraFov - 75) < 1); assert.ok(!last.flightInputBlocked);
    }
  }
  if (verify) {
    isolated.server.simulateLatency(240);
    game.action = (id, type, value) => originalAction(id, type, type === 'warp' ? { ...(value as object), systemId: 'unavailable-test-star' } : value);
    await request('Vega'); const rejected: any[] = [];
    for (let i = 0; i < 14; i++) { await page.waitForTimeout(100); rejected.push(await snapshot()); }
    assert.ok(rejected.every(s => s.world.flightFX.effects.warp.phase === 'idle' && !s.world.travel.warping));
    assert.ok(rejected[rejected.length - 1].world.travel.status.includes('unavailable')); assert.ok(!rejected[rejected.length - 1].flightInputBlocked);
    samples.push({ scenario: 'rejected', frames: rejected }); game.action = originalAction;
    await request('Vega'); await page.waitForFunction(() => !!(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.warping);
    const originalSystem = pilot.systemId; originalAction(pilot.id, 'stop', { epoch: pilot.epoch });
    await page.waitForTimeout(1300); const cancelled = await snapshot();
    assert.equal(cancelled.world.travel.systemId, originalSystem); assert.equal(cancelled.world.flightFX.effects.warp.phase, 'idle'); assert.ok(!cancelled.flightInputBlocked);
    samples.push({ scenario: 'cancelled', state: cancelled });
    await page.waitForTimeout(2200);
    await request('Vega'); await page.waitForFunction(() => !!(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.warping);
    isolated.room.clients[0].leave(4000, 'Isolated disconnect fixture');
    await page.waitForFunction(() => !(window as any).__UNIVERSE_DEBUG__.snapshot().realtime.subscribed);
    await page.waitForTimeout(1400); const disconnected = await snapshot();
    assert.equal(disconnected.world.flightFX.effects.warp.phase, 'idle'); assert.ok(!disconnected.world.travel.warping);
    assert.ok(Math.abs(disconnected.world.ship.cameraFov - 75) < 1);
    samples.push({ scenario: 'disconnected', state: disconnected });
  }
  assert.deepEqual(errors, []); console.log(`${label} ${mode}: warp scenarios PASS`);
} catch (e) { errors.push(String(e)); throw e; }
finally {
  await writeFile(`${dir}/evidence.json`, JSON.stringify({ mode, label, samples, errors }, null, 2));
  const video = page.video(); await browser.close(); if (video) await rename(await video.path(), `${dir}/warp.webm`); await isolated.close();
}
