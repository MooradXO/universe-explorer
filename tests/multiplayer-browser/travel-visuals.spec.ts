import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../../server';
const snapshot = (page: Page): Promise<any> => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
test('online warp portal and cruise camera stay coherent with delayed snapshots', async ({ page }, info) => {
  const evidence = process.env.TRAVEL_EVIDENCE_DIR || '.multiplayer-evidence/travel-visuals'; await mkdir(evidence, { recursive: true });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const isolated = await startServer({ port: 2577, store: null });
  isolated.server.simulateLatency(240);
  await page.route('http://127.0.0.1:2567/matchmake/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':2567/', ':2577/') });
    const reservation = await response.json(); reservation.publicAddress = '127.0.0.1:2577';
    await route.fulfill({ response, json: reservation });
  });
  try {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), info.project.name);
  await page.goto('/'); await page.locator('#btn-start-game').click();
  await expect.poll(async () => (await snapshot(page)).realtime.subscribed).toBe(true);
  await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill('Proxima');
  await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
  await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.flightFX.effects.warp.streaks, { timeout: 2200, intervals: [50, 100] }).toBeGreaterThan(0);
  const warp = await snapshot(page); expect(warp.world.travel.warping).toBe('athyg:4.0:1440825');
  await page.screenshot({ path: `${evidence}/${info.project.name}-warp.png` });
  await expect.poll(async () => (await snapshot(page)).world.travel.systemId, { timeout: 10000 }).toBe('athyg:4.0:1440825');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ReturnToBase')));
  await expect.poll(async () => (await snapshot(page)).world.travel.atHome, { timeout: 10000 }).toBe(true);
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click(); await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.travel.cruiseSpeed, { timeout: 15000 }).toBeGreaterThan(50000);
  const cruising = [];
  for (let n = 0; n < 15; n++) {
    const state = await snapshot(page); cruising.push(state);
    expect(Math.hypot(...state.world.ship.cameraOffset)).toBeLessThan(650);
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: `${evidence}/${info.project.name}-cruise.png` });
  await expect.poll(async () => (await snapshot(page)).world.travel.status, { timeout: 65000 }).toContain('Destination reached');
  const arrival = await snapshot(page); expect(Math.hypot(...arrival.world.ship.cameraOffset)).toBeLessThan(650);
  expect(arrival.world.flightFX.effects.warp.requested).toBe(false); expect(errors).toEqual([]);
  await writeFile(`${evidence}/${info.project.name}.json`, JSON.stringify({ simulatedRTTms: 240, warp, cruising, arrival, errors }, null, 2));
  } finally { await page.close(); await isolated.close(); }
});
