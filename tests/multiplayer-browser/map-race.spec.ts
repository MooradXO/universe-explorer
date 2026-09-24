import { test, expect } from '@playwright/test';

test('a star chosen before the manifest loads stays selected and can be reached', async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/__catalog/manifest', async route => { await gate; await route.continue(); });
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), info.project.name);
  try {
    await page.goto('/'); await page.locator('#btn-start-game').click();
    await expect.poll(() => page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot().realtime.subscribed)).toBe(true);
    await page.locator('#btn-star-map').click();
    await page.locator('#star-map-search').fill('Proxima');
    await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
    await expect(page.locator('.star-map__card h2')).toHaveText('Proxima Centauri');
    release();
    await expect.poll(() => page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot().starMap?.selectedId)).toBe('athyg:4.0:1440825');
    await expect(page.locator('.star-map__card h2')).toHaveText('Proxima Centauri');
    await page.getByRole('button', { name: 'Warp to star', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot().world.travel?.systemId), { timeout: 15000 }).toBe('athyg:4.0:1440825');
  } finally { release(); }
});
