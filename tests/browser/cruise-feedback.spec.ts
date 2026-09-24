import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('offline cruise exposes acceleration, engine thrust and bounded camera through arrival', async ({ page }, info) => {
  test.setTimeout(90000);
  const mode = info.project.name.includes('mobile') ? 'LOW' : 'HIGH';
  const evidence = `docs/phases_archive/cruise-feel-2026-09-24/offline-${mode}`;
  await mkdir(evidence, { recursive: true });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(value => localStorage.setItem('universe_gfx_mode', value), mode);
  await page.goto('/'); await page.locator('#btn-start-game').click();
  await expect(page.locator('.system-navigation')).toBeVisible(); await page.waitForTimeout(1000);
  const sample = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
  const initial = await sample(); expect(initial.realtime.transport).not.toBe('colyseus');
  await page.screenshot({ path: `${evidence}/idle.png` });
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  const samples: any[] = []; let peak = initial;
  for (let step = 0; step < 350; step++) {
    await page.waitForTimeout(100); const state = await sample(); samples.push(state);
    if (state.world.ship.cruiseIntensity > peak.world.ship.cruiseIntensity) {
      peak = state;
      if (step % 5 === 0) await page.screenshot({ path: `${evidence}/accelerating.png` });
    }
    expect(Math.hypot(...state.world.ship.cameraOffset)).toBeLessThan(650);
    if (!state.world.travel.cruising) break;
  }
  await expect.poll(async () => (await sample()).world.travel.status).toContain('Destination reached');
  await page.waitForTimeout(1000); const arrival = await sample();
  await page.screenshot({ path: `${evidence}/arrival.png` });
  expect(peak.world.ship.cruiseIntensity).toBeGreaterThan(.85);
  expect(Math.hypot(...peak.world.ship.cameraOffset)).toBeGreaterThan(Math.hypot(...initial.world.ship.cameraOffset) + 60);
  expect(peak.world.ship.engine.plumeLength).toBeGreaterThan(initial.world.ship.engine.plumeLength * 2);
  expect(arrival.world.ship.cruiseIntensity).toBeLessThan(.1); expect(arrival.flightInputBlocked).toBe(false);
  expect(errors).toEqual([]);
  await writeFile(`${evidence}/evidence.json`, JSON.stringify({ initial, peak, arrival, samples, errors }, null, 2));
});
