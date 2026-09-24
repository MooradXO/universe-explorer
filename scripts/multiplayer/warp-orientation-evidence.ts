import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { startServer } from '../../server/index';

const mode = process.env.CRUISE_QUALITY || 'HIGH';
const evidence = `docs/phases_archive/warp-orientation-2026-09-24/${mode}`;
await mkdir(evidence, { recursive: true });
const isolated = await startServer({ port: 2567, store: null, allowBots: false, maxPlayers: 50 });
isolated.server.simulateLatency(240);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW' });
const samples: any[] = [], errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const capture = async (stage: string, screenshot = false) => {
  const client: any = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())));
  const pilot = [...isolated.room.game.pilots.values()][0], server = isolated.room.game.self(pilot);
  const q = new Quaternion().fromArray(client.world.ship.rotation);
  const right = new Vector3(1, 0, 0).applyQuaternion(q), forward = new Vector3(0, 0, -1).applyQuaternion(q);
  const state = { stage, client, server, right: right.toArray(), forward: forward.toArray() }; samples.push(state);
  if (screenshot) await page.screenshot({ path: `${evidence}/${stage}.png` });
  return state;
};
try {
  await page.addInitScript(value => localStorage.setItem('universe_gfx_mode', value), mode);
  await page.goto('http://127.0.0.1:3012/'); await page.locator('#btn-start-game').click();
  await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__?.snapshot().realtime.subscribed && !(window as any).__UNIVERSE_DEBUG__.snapshot().flightInputBlocked);
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  await page.waitForTimeout(4000); const cruise = await capture('cruise', true);
  assert.ok(Math.abs(cruise.right[1]) < 1e-5);
  for (const star of ['Proxima Centauri', 'Sirius', 'Vega']) {
    await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill(star);
    await page.getByRole('button', { name: `Select ${star}`, exact: true }).click();
    await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
    await page.waitForFunction(() => !!(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.warping);
    const begin = await capture(`${star}-charge`, true), heading = new Quaternion().fromArray(begin.server.flight.q);
    for (let frame = 0; frame < 8; frame++) {
      await page.waitForTimeout(90); const state = await capture(`${star}-${frame}`);
      assert.ok(Math.abs(state.right[1]) < 1e-5);
      assert.ok(new Quaternion().fromArray(state.server.flight.q).angleTo(heading) < 1e-5);
      assert.ok(state.client.world.flightFX.effects.warp.requested);
    }
    await page.waitForFunction(() => !(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.warping);
    await page.waitForTimeout(500); const arrival = await capture(`${star}-arrival`, true);
    assert.ok(Math.abs(arrival.right[1]) < 1e-5);
    assert.equal(arrival.client.world.travel.systemId, arrival.server.systemId);
    assert.ok(arrival.client.world.space.system.title.includes(star));
  }
  assert.equal(errors.length, 0); console.log(`${mode}: three warp directions, stable upright heading and arrival PASS`);
} catch (error) { errors.push(String(error)); throw error; }
finally { await writeFile(`${evidence}/evidence.json`, JSON.stringify({ mode, rttMs: 240, samples, errors }, null, 2)); await browser.close(); await isolated.close(); }
