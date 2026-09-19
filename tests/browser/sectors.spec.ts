import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const snapshot = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
const evidence = process.env.SECTOR_EVIDENCE || join('docs', 'phases_archive', 'sector-streaming-2026-09-15');

async function enter(page: Page, state: string, mode: string) {
  await page.addInitScript((graphics) => localStorage.setItem('universe_gfx_mode', graphics), mode);
  await page.goto(`/?spaceSmoke=${state}`);
  await page.locator('#btn-start-game').click();

  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await expect(page.locator('#ui-layer')).toBeVisible();
}

test('flight crosses a negative sector boundary, rebases with live projectiles and returns to base', async ({ page }, testInfo) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  await enter(page, 'sector-boundary', testInfo.project.name.includes('mobile') ? 'LOW' : 'HIGH');
  await page.waitForFunction(() => window.__UNIVERSE_DEBUG__.snapshot().world.space.stream.pending === 0);
  const initial = await snapshot(page);
  expect(initial.world.ship.worldPosition.sector).toEqual([0, 0, 0]);
  // Use the same gameplay events as the FIRE and SPAWN BOTS controls.
  await page.evaluate(() => { window.dispatchEvent(new Event('SpawnBots')); window.dispatchEvent(new Event('PrimaryFireStart')); });
  await page.keyboard.down('w'); await page.keyboard.down('Shift');
  await page.waitForFunction(() => window.__UNIVERSE_DEBUG__.snapshot().world.ship?.worldPosition.sector[2] === -1);
  await page.waitForFunction((shifts) => window.__UNIVERSE_DEBUG__.snapshot().world.space.origin.shifts > shifts,
    initial.world.space.origin.shifts, { timeout: 30000 });
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  const crossed = await snapshot(page);
  expect(crossed.world.projectiles).toBeGreaterThan(0);
  expect(crossed.world.players.bots).toBeGreaterThan(0);
  expect(Math.hypot(...crossed.world.ship.position)).toBeLessThan(10000);
  expect(Math.hypot(...crossed.world.ship.cameraOffset)).toBeLessThan(1200);
  expect(crossed.world.ship.hp).toBeGreaterThan(0);
  await page.evaluate(() => { window.dispatchEvent(new Event('PrimaryFireEnd')); window.dispatchEvent(new Event('ReturnToBase')); });
  await page.waitForTimeout(1000);
  const returned = await snapshot(page);
  expect(returned.world.ship.worldPosition).toEqual({ sector: [0, 0, 0], offset: [0, 100, 8300] });
  expect(Math.hypot(...returned.world.ship.cameraOffset)).toBeLessThan(1000);
  expect(issues).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, `${testInfo.project.name}-boundary.json`), JSON.stringify({ initial, crossed, returned, issues }, null, 2));
  await page.screenshot({ path: join(evidence, `${testInfo.project.name}-boundary.png`) });
});

test('fixed long-distance tour bounds resources and restores identical sector contents', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  const high = !testInfo.project.name.includes('mobile');
  await enter(page, 'sector-tour', high ? 'HIGH' : 'LOW');
  const home = await page.evaluate(() => window.__UNIVERSE_DEBUG__.planets());
  const samples: any[] = [];
  let frontier: unknown;
  for (let step = 1; step <= 6; step++) {
    await page.waitForFunction((target) => window.__UNIVERSE_DEBUG__.snapshot().world.tour?.step === target, step, { timeout: 15000 });
    await page.waitForFunction(() => {
      const { stream, planets } = window.__UNIVERSE_DEBUG__.snapshot().world.space;
      return stream.pending === 0 && stream.queued === 0 && planets.queued === 0;
    });
    await page.waitForTimeout(400);
    const sample = await snapshot(page); samples.push(sample);
    expect(sample.world.space.stream.cached).toBeLessThanOrEqual(125);
    expect(sample.world.space.navigation.groups).toBeLessThanOrEqual(27);
    expect(sample.world.space.planets.active).toBeLessThanOrEqual(high ? 16 : 8);
    expect(sample.world.space.stream.failed).toBe(0);
    expect(Math.hypot(...sample.world.ship.position)).toBeLessThan(10000);
    expect(Math.hypot(...sample.world.ship.cameraOffset)).toBeLessThan(500);
    const planets = await page.evaluate(() => window.__UNIVERSE_DEBUG__.planets());
    if (step === 1) frontier = planets;
    if (step === 5) expect(planets).toEqual(frontier);
    if (step === 4 || step === 6) expect(planets).toEqual(home);
    if (step === 3) {
      expect(sample.world.ship.worldPosition).toEqual({ sector: [1000000, -1000000, 1000000], offset: [0.125, 100.25, 9800.5] });
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `${testInfo.project.name}-frontier.png`) });
    }
  }
  const firstHome = samples[3]; const secondHome = samples[5];
  expect(secondHome.world.space.planets.disposed).toBeGreaterThan(firstHome.world.space.planets.disposed);
  expect(secondHome.renderer.geometries).toBeLessThanOrEqual(firstHome.renderer.geometries + 2);
  expect(secondHome.renderer.textures).toBeLessThanOrEqual(firstHome.renderer.textures + 2);
  expect(samples[5].world.tour.done).toBe(true);
  expect(issues).toEqual([]);
  await writeFile(join(evidence, `${testInfo.project.name}-tour.json`), JSON.stringify({ samples, issues }, null, 2));
});
