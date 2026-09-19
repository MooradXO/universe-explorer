import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const evidence = process.env.STELLAR_EVIDENCE || join('docs', 'phases_archive', 'stellar-flight-2026-09-15');
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
async function enter(page: Page) {
  await page.goto('/'); await page.locator('#btn-start-game').click();
  await expect(page.locator('.system-navigation')).toBeVisible();
}
test('Solar base, Mars cruise, real catalogue warp, exploration, return and offline save', async ({ page }, info) => {
  test.setTimeout(120000);
  const issues: string[] = [];
  page.on('pageerror', error => issues.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), info.project.name.includes('mobile') ? 'LOW' : 'HIGH');
  await enter(page);
  await expect.poll(async () => (await snapshot(page)).world.space.system?.sky.status, { timeout: 20000 }).toBe('ready');
  const initial = await snapshot(page); expect(initial.world.travel.atHome).toBe(true); expect(initial.world.planetCount).toBe(8);
  await mkdir(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `${info.project.name}-earth.png`) });
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.travel.cruising).toBe(true);
  await expect.poll(async () => (await snapshot(page)).world.flightDust.originShifts).toBeGreaterThan(initial.world.flightDust.originShifts);
  expect((await snapshot(page)).world.flightDust.maxOffset).toBeLessThanOrEqual(620);
  await expect.poll(async () => (await snapshot(page)).world.travel.status, { timeout: 55000 }).toContain('Destination reached');
  expect((await snapshot(page)).flightInputBlocked).toBe(false);
  await page.getByRole('button', { name: 'Flight details', exact: true }).click();
  await page.getByRole('button', { name: 'ORBITAL SURVEY', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.flightFX.effects.scan.particles).toBeGreaterThan(0);
  expect((await snapshot(page)).world.travel.visited).toContain('sol/mars');
  const mars = await snapshot(page); await page.screenshot({ path: join(evidence, `${info.project.name}-mars.png`) });
  await page.locator('#btn-star-map').click();
  await page.locator('#star-map-search').fill('Proxima');
  await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
  await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.flightFX.effects.warp.particles).toBeGreaterThan(0);
  expect((await snapshot(page)).world.flightDust.visible).toBe(false);
  await page.screenshot({ path: join(evidence, `${info.project.name}-warp.png`) });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).world.travel.systemId, { timeout: 12000 }).toBe('athyg:4.0:1440825');
  await expect.poll(async () => (await snapshot(page)).world.space.system.sky.status, { timeout: 20000 }).toBe('ready');
  const arrival = await snapshot(page); expect(arrival.world.travel.atHome).toBe(false); expect(arrival.world.planetCount).toBe(4);
  expect(arrival.world.flightDust.speed).toBe(0); expect(arrival.world.flightDust.maxOffset).toBeLessThanOrEqual(620);
  await expect.poll(async () => (await snapshot(page)).world.space.system.debris?.phenomenon.particles??0).toBeGreaterThan(0);
  if((await snapshot(page)).world.flightFX.effects.anomaly.requested)
    await expect.poll(async () => (await snapshot(page)).world.flightFX.effects.anomaly.particles).toBeGreaterThan(0);
  const fx = (await snapshot(page)).world.flightFX;
  expect(fx.effects.anomaly.particles).toBeLessThanOrEqual(fx.budgetPerEffect);
  expect(arrival.world.ship.hp).toBe(initial.world.ship.hp); expect(arrival.realtime.systemId).toBe('athyg:4.0:1440825');
  await expect(page.locator('.system-navigation__note')).toContainText('Procedural game object');
  await page.getByRole('button', { name: 'Flight details', exact: true }).click();
  await page.getByRole('button', { name: 'ORBITAL SURVEY', exact: true }).click();
  await page.screenshot({ path: join(evidence, `${info.project.name}-proxima.png`) });
  // Save is local, including an anchor snapshot; restoration needs no scientific API.
  await page.route('**/__catalog/**', route => route.abort());
  await enter(page);
  expect((await snapshot(page)).world.travel.systemId).toBe('athyg:4.0:1440825');
  await expect(page.locator('.navigation-details [role="status"]')).toContainText('illustrative background');
  await page.unroute('**/__catalog/**');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ReturnToBase')));
  await expect.poll(async () => (await snapshot(page)).world.travel.atHome, { timeout: 12000 }).toBe(true);
  const returned = await snapshot(page); expect(returned.world.travel.visited).toContain('sol/mars');
  // Failed network requests above are intentional offline coverage.
  const unexpected = issues.filter(issue => !issue.includes('net::ERR_FAILED'));
  expect(unexpected).toEqual([]);
  await writeFile(join(evidence, `${info.project.name}-route.json`), JSON.stringify({ initial, mars, arrival, returned, issues: unexpected }, null, 2));
});

test('cruise yields to firing, unknown distances block warp, repeated systems release resources', async ({ page }, info) => {
  test.setTimeout(100000);
  const issues: string[] = []; page.on('pageerror', error => issues.push(error.message));
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), info.project.name.includes('mobile') ? 'LOW' : 'HIGH');
  await enter(page);
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).world.travel.cruiseSpeed).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^FIRE/ }).click();
  await expect.poll(async () => (await snapshot(page)).world.projectiles).toBeGreaterThan(0);
  expect((await snapshot(page)).world.travel.cruising).toBe(false);
  expect((await snapshot(page)).flightInputBlocked).toBe(false);
  await page.locator('#btn-star-map').click();
  await expect(page.getByRole('button', { name: 'Current system', exact: true })).toBeDisabled();
  await page.route('**/__catalog/search?q=Unknown-distance', route => route.fulfill({ json: [{ id: 'athyg:4.0:2', title: 'Unknown-distance', distance: null, positioned: false }] }));
  await page.route('**/__catalog/objects/2', route => route.fulfill({ json: { id: 'athyg:4.0:2', title: 'Unknown-distance', distance: null, positioned: false,
    position: null, names: [], raHours: null, decDegrees: null, magnitude: null, spectrum: null, identifiers: [], flags: [], distanceSource: null, positionSource: null, gaiaMatches: 0 } }));
  await page.locator('#star-map-search').fill('Unknown-distance'); await page.getByRole('button', { name: 'Select Unknown-distance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Warp to star', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close star map' }).click();
  const samples = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.locator('#btn-star-map').click(); await page.locator('#star-map-search').fill('Proxima');
    await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
    await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).world.travel.systemId, { timeout: 10000 }).toBe('athyg:4.0:1440825');
    await expect.poll(async () => (await snapshot(page)).world.space.system.sky.status, { timeout: 15000 }).toBe('ready');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ReturnToBase')));
    await expect.poll(async () => (await snapshot(page)).world.travel.atHome, { timeout: 10000 }).toBe(true);
    await expect.poll(async () => (await snapshot(page)).world.space.system.sky.status, { timeout: 15000 }).toBe('ready');
    await page.waitForTimeout(700); samples.push(await snapshot(page));
  }
  expect(samples[2].renderer.geometries).toBeLessThanOrEqual(samples[0].renderer.geometries);
  expect(samples[2].renderer.textures).toBeLessThanOrEqual(samples[0].renderer.textures);
  expect(samples[2].world.projectiles).toBe(0); expect(samples[2].flightInputBlocked).toBe(false);
  expect(issues).toEqual([]);
  await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, `${info.project.name}-repeat.json`), JSON.stringify({ samples, issues }, null, 2));
});
