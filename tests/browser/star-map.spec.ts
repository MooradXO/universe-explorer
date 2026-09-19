import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';
import { decodeStarTile, type StarMapManifest } from '../../src/catalog/StarMapData';
const evidence = join('docs', 'phases_archive', 'star-map-2026-09-15');
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
async function enter(page: Page, mobile: boolean) {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mobile ? 'LOW' : 'HIGH');
  await page.goto('/?spaceSmoke=near-base');
  await page.locator('#btn-start-game').click();
  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await expect(page.locator('#btn-star-map')).toBeVisible();
}
async function settled(page: Page) {
  await expect.poll(async () => {
    const map = (await snapshot(page)).starMap;
    return map.open && map.points > 0 && map.pending === 0 && map.errors === 0;
  }, { timeout: 20000 }).toBe(true);
  await page.waitForTimeout(500);
}

test('full catalogue map searches, orbits, zooms and closes without flight input or retained resources', async ({ page }, info) => {
  const issues: string[] = [], requests: string[] = [];
  page.on('pageerror', error => issues.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/__catalog/')) requests.push(request.url()); });
  await enter(page, info.project.name.includes('mobile'));
  await page.waitForTimeout(1500);
  expect(requests).toHaveLength(0);
  const before = await snapshot(page);
  await page.locator('#btn-star-map').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await settled(page);
  const initial = await snapshot(page);
  if (info.project.name.includes('mobile')) await expect(page.locator('.mobile-flight-controls')).toBeHidden();
  expect(initial.flightInputBlocked).toBe(true);
  await expect(page.locator('.star-map__count')).toContainText('2');
  await page.locator('#star-map-search').fill('Sirius');
  await page.getByRole('button', { name: 'Select Sirius', exact: true }).click();
  await expect(page.locator('.star-map__card h2')).toHaveText('Sirius');
  await settled(page);
  const focused = await snapshot(page);
  expect(focused.starMap.selectedId).not.toBe(initial.starMap.selectedId);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).starMap.radiusParsecs).toBeLessThan(focused.starMap.radiusParsecs);
  const width = info.project.use.viewport!.width, height = info.project.use.viewport!.height;
  const zoomBeforeGesture = (await snapshot(page)).starMap.radiusParsecs;
  if (info.project.name.includes('mobile')) {
    const cdp = await page.context().newCDPSession(page);
    const touches = (gap: number) => [{ id: 1, x: width / 2 - gap, y: height / 2, radiusX: 2, radiusY: 2 },
      { id: 2, x: width / 2 + gap, y: height / 2, radiusX: 2, radiusY: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(60) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, -150);
  }
  await expect.poll(async () => (await snapshot(page)).starMap.radiusParsecs).toBeLessThan(zoomBeforeGesture);
  await page.mouse.move(width / 2 - 30, height / 2);
  await page.mouse.down(); await page.mouse.move(width / 2 + 50, height / 2 - 30, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(350);
  expect((await snapshot(page)).starMap.camera).not.toEqual(focused.starMap.camera);
  await page.keyboard.press('w'); await page.keyboard.press('3'); await page.keyboard.press('Tab');
  const afterInput = await snapshot(page);
  expect(afterInput.world.ship.speed).toBeLessThan(0.01);
  expect(afterInput.world.ship.viewMode).toBe(before.world.ship.viewMode);
  expect(afterInput.world.projectiles).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(page.locator('#leaderboard-container')).toBeHidden();
  await settled(page);
  const loaded = await snapshot(page);
  expect(loaded.starMap.points).toBeLessThanOrEqual(loaded.starMap.maxPoints);
  expect(loaded.starMap.tiles).toBeLessThanOrEqual(loaded.starMap.maxTiles);
  expect(loaded.starMap.cachedTiles).toBeLessThanOrEqual(info.project.name.includes('mobile') ? 48 : 80);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${info.project.name}-sirius.png`) });
  // Project an actually loaded catalogue point, then select it with a real pointer click.
  const pickedBefore = (await snapshot(page)).starMap.selectedId;
  const mapState = (await snapshot(page)).starMap;
  const manifest: StarMapManifest = await (await page.request.get('/__catalog/manifest')).json();
  const camera = new PerspectiveCamera(55, width / height, 0.001, 5e6);
  camera.up.set(0, 0, 1); camera.position.fromArray(mapState.camera); camera.lookAt(new Vector3(...mapState.target)); camera.updateMatrixWorld();
  let pick: [number, number] | undefined;
  for (const key of mapState.activeTileKeys) {
    const node = manifest.nodes.find(value => value.key === key)!;
    const buffer = await (await page.request.get(`/__catalog/tiles/${key}`)).body();
    const tile = decodeStarTile(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    for (let i = 0; i < tile.ids.length; i++) {
      if (`athyg:4.0:${tile.ids[i]}` === pickedBefore) continue;
      const p = new Vector3().fromArray(tile.positions, i * 3).add(new Vector3(...node.center)).sub(new Vector3(...mapState.origin)).project(camera);
      const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
      if (Math.abs(p.z) < 1 && x > width / 2 - 100 && x < width / 2 + 100 && y > 125 && y < height - 135 && Math.hypot(x - width / 2, y - height / 2) > 25) {
        pick = [x, y]; break;
      }
    }
    if (pick) break;
  }
  expect(pick).toBeDefined();
  await page.mouse.click(...pick!);
  await expect.poll(async () => (await snapshot(page)).starMap.selectedId).not.toBe(pickedBefore);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await settled(page);
  const overview = await snapshot(page);
  expect(overview.starMap.radiusParsecs).toBeGreaterThan(100000);
  await page.screenshot({ path: join(evidence, `${info.project.name}-overview.png`) });
  await page.getByRole('button', { name: 'Sol', exact: true }).click();
  await expect(page.locator('.star-map__card h2')).toHaveText('Sol');
  await settled(page);
  await page.locator('#star-map-search').fill('AT-HYG 64');
  await page.getByRole('button', { name: 'Select TYC 5841-249-1', exact: true }).click();
  await expect(page.locator('.star-map__card')).toContainText('Distance is unknown');
  await expect(page.getByRole('button', { name: 'Centre on star' })).toBeDisabled();
  await expect(page.locator('.star-map__marker')).toBeHidden();
  await page.locator('#star-map-search').fill('Gaia DR3 1001982545507542272');
  await expect(page.locator('.star-map__result')).toHaveCount(2);
  await page.locator('.star-map__result').first().click();
  await expect(page.locator('.star-map__card')).toContainText('2 AT-HYG records');
  await page.getByText('Identifiers and accuracy', { exact: true }).click();
  await expect(page.locator('.star-map__card')).toContainText('1001982545507542272');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#btn-star-map')).toBeFocused();
  await page.waitForTimeout(500);
  const closed = await snapshot(page);
  expect(closed.starMap.open).toBe(false); expect(closed.flightInputBlocked).toBe(false);
  const requestCount = requests.length;
  await page.waitForTimeout(600); expect(requests).toHaveLength(requestCount);
  await page.locator('#btn-star-map').click(); await settled(page);
  await page.getByRole('button', { name: 'Close star map' }).click();
  await page.waitForTimeout(500);
  const reopened = await snapshot(page);
  expect(reopened.renderer.geometries).toBeLessThanOrEqual(closed.renderer.geometries + 2);
  expect(reopened.renderer.textures).toBeLessThanOrEqual(closed.renderer.textures);
  await page.keyboard.down('w'); await page.waitForTimeout(250); await page.keyboard.up('w');
  expect((await snapshot(page)).world.ship.speed).toBeGreaterThan(0);
  await writeFile(join(evidence, `${info.project.name}-map.json`), JSON.stringify({ before, initial, focused, loaded, overview, closed, reopened, catalogueRequests: requests.length, issues }, null, 2));
  expect(issues).toEqual([]);
});

test('unavailable catalogue can be retried and rapid close discards pending loads', async ({ page }, info) => {
  await enter(page, info.project.name.includes('mobile'));
  await page.route('**/__catalog/manifest', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.locator('#btn-star-map').click();
  await expect(page.locator('.star-map__status')).toContainText('unavailable');
  await page.unroute('**/__catalog/manifest');
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await settled(page);
  await page.keyboard.press('Escape');
  await page.route('**/__catalog/manifest', async route => { await new Promise(done => setTimeout(done, 400)); await route.continue().catch(() => {}); });
  await page.locator('#btn-star-map').click();
  await page.getByRole('button', { name: 'Close star map' }).click();
  await page.waitForTimeout(600);
  expect((await snapshot(page)).starMap.open).toBe(false);
  expect((await snapshot(page)).flightInputBlocked).toBe(false);
});
