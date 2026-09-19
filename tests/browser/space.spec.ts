import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const snapshot = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((mode) => {
    localStorage.setItem('universe_gfx_mode', mode);
    // Hold the legacy decorative randomness constant for before/after comparisons.
    // The planet catalog has its own independent versioned RNG.
    let state = 71415;
    Math.random = () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }, testInfo.project.name.includes('mobile') ? 'LOW' : 'HIGH');
});

for (const state of ['near-base', 'planet-showcase']) {
  test(`space / ${state}`, async ({ page }, testInfo) => {
    const issues: string[] = [];
    page.on('pageerror', (error) => issues.push(error.message));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) issues.push(message.text());
    });
    await page.goto(`/?spaceSmoke=${state}`);
    await page.locator('#btn-start-game').click();

    await page.locator('#start-screen').waitFor({ state: 'detached' });
    await expect(page.locator('#ui-layer')).toBeVisible();
    await page.waitForFunction(() => window.__UNIVERSE_DEBUG__?.snapshot());
    await page.waitForTimeout(6000);
    const samples = [];
    for (let i = 0; i < 8; i++) {
      samples.push(await snapshot(page));
      await page.waitForTimeout(1000);
    }
    const last = samples.at(-1)!;
    expect(last.world.scene).toBe(state);
    expect(last.world.players.local).toBe(1);
    expect(last.world.planetCount).toBe(80);
    expect(last.world.visiblePlanets).toBeGreaterThan(0);
    expect(last.renderer.calls).toBeGreaterThan(0);
    expect(last.renderer.triangles).toBeGreaterThan(0);
    expect(last.renderer.textures).toBeGreaterThan(0);
    expect(last.renderer.geometries).toBeGreaterThan(0);
    expect(last.world.ship.hp).toBeGreaterThan(0);
    await expect(page.locator('[class*="atmosphere-"]')).toHaveCount(0);
    expect(await page.evaluate(() => '__universePlanetSmoke' in window)).toBe(false);
    await page.keyboard.press('f');
    expect((await snapshot(page)).world.scene).toBe(state);
    expect(await page.evaluate(() => {
      const api = window.__UNIVERSE_DEBUG__;
      return Object.isFrozen(api) && Object.isFrozen(api.snapshot()) && Object.isFrozen(api.planets());
    })).toBe(true);

    const evidence = join('docs', 'phases_archive', 'space-only-sprint-2026-09-15', process.env.SMOKE_PHASE || '../sector-streaming-2026-09-15/after');
    await mkdir(evidence, { recursive: true });
    const name = `${testInfo.project.name}-${state}`;
    await page.screenshot({ path: join(evidence, `${name}.png`) });
    await writeFile(join(evidence, `${name}.json`), JSON.stringify({
      browser: testInfo.project.use.channel || 'chromium', samples,
      averageFps: samples.reduce((sum, sample) => sum + sample.fps, 0) / samples.length,
      planets: await page.evaluate(() => window.__UNIVERSE_DEBUG__.planets()), issues,
    }, null, 2));

    const mobile = testInfo.project.name.includes('mobile');
    const weapon = page.locator(mobile ? '.mobile-weapon--missile' : '[data-weapon="missile"]');
    await weapon.click();
    await expect(weapon).toHaveAttribute('aria-pressed', 'true');
    const cameraButton = page.locator(mobile ? '.mobile-action--camera' : '.combat-dock__action--camera');
    await cameraButton.click();
    expect((await snapshot(page)).world.ship.viewMode).toBe('first');
    await cameraButton.click();
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    await page.keyboard.up('w');
    expect((await snapshot(page)).world.ship.speed).toBeGreaterThan(0);
    expect(issues).toEqual([]);
  });
}

test('normal guest entry and identical planets in fresh independent clients', async ({ page, browser }) => {
  const issues: string[] = [];
  const githubRequests: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('request', request => {
    if (/https:\/\/(?:api\.)?github\.com\//.test(request.url())) githubRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#start-screen button')).toHaveCount(1);
  await expect(page.locator('#start-screen')).not.toContainText(/GitHub|PILOT ACCESS|LAUNCH CLEARANCE/);
  await page.locator('#btn-start-game').press('Enter');

  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await expect(page.locator('#ui-layer')).toBeVisible();
  expect((await snapshot(page)).world.scene).toBe('free-flight');
  const planets = await page.evaluate(() => window.__UNIVERSE_DEBUG__.planets());

  // This context has no shared storage, mocked randomness or smoke fixture.
  const other = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const client = await other.newPage();
    client.on('pageerror', (error) => issues.push(error.message));
    await client.goto('/?planetSmoke=desert');
    await expect(client.locator('#start-screen')).toBeVisible();
    await client.locator('#btn-start-game').click();
    await client.waitForFunction(() => window.__UNIVERSE_DEBUG__?.snapshot().world.travel?.systemId === 'athyg:4.0:1');
    expect(await client.evaluate(() => window.__UNIVERSE_DEBUG__.planets().length)).toBe(8);
    expect(await client.evaluate(() => window.__UNIVERSE_DEBUG__.planets())).toEqual(planets);
  } finally { await other.close(); }
  expect(issues).toEqual([]);
  expect(githubRequests).toEqual([]);
});
