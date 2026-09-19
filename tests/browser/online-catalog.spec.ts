import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const evidence = resolve('docs/phases_archive/online-catalog-2026-09-15');
async function enter(page: Page, mobile: boolean) {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mobile ? 'LOW' : 'HIGH');
  await page.goto('/?spaceSmoke=near-base');
  await page.locator('#btn-start-game').click();
  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await page.locator('#btn-star-map').click();
  await expect(page.locator('.star-map__card h2')).toHaveText('Sol');
  expect(await page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot().graphicsMode)).toBe(mobile ? 'LOW' : 'HIGH');
}
const fixture = (provider = 'ned', cache = 'cached') => [{ provider, query: 'Test galaxy', status: 'ok', cache,
  fetchedAt: '2026-09-15T00:00:00Z', bytes: 100, localMatches: [], observations: [{ schemaVersion: 1,
    source: { catalog: provider, release: 'test', value: 'Test galaxy' }, snapshotSha256: 'fixture', queryUrl: 'https://ned.ipac.caltech.edu/',
    names: ['Test galaxy'], identifiers: [], objectType: 'G', flags: ['redshift-not-converted-to-xyz'],
    astrometry: { frame: 'FK5', equinox: 'J2000.0', epochJulianYear: null, raDegrees: 10, decDegrees: 20, reference: null },
    measurements: { z: { value: -0.001, unit: null, reference: null }, mean_distance: { value: 0.8, unit: 'Mpc', reference: null } } }] }];

test('catalogue research is explicit, renders provenance and offline status, and offers retry', async ({ page }, info) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (/__catalog\/(online|enrich)/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await enter(page, info.project.name.includes('mobile'));
  expect(requests).toHaveLength(0);
  await page.locator('#star-map-search').fill('Proxima');
  await page.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.route('**/__catalog/enrich/*', route => route.fulfill({ json: [{ provider: 'gaia', query: 'fixture', status: 'unavailable', cache: null, observations: [], fetchedAt: null, bytes: 0, message: 'Источник недоступен' }] }));
  await page.getByRole('button', { name: 'Look up Gaia and SIMBAD' }).click();
  await expect(page.locator('.star-map__online')).toContainText('Источник недоступен');
  await expect(page.getByRole('button', { name: 'Retry request' })).toBeVisible();
  await page.unroute('**/__catalog/enrich/*');
  await page.route('**/__catalog/enrich/*', route => route.fulfill({ json: fixture('gaia', 'stale') }));
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(page.locator('.star-map__online')).toContainText('Source unavailable · cached data');

  await page.locator('#star-map-search').fill('M31');
  await page.getByText('Gaia · SIMBAD · NED', { exact: true }).click();
  await page.getByRole('combobox').selectOption('ned');
  await page.route('**/__catalog/online?*', route => route.fulfill({ json: fixture() }));
  await page.getByRole('button', { name: 'Search source' }).click();
  await expect(page.locator('.star-map__card h2')).toHaveText('M31');
  await expect(page.locator('.star-map__card')).toContainText('NASA/IPAC NED');
  await expect(page.locator('.star-map__card')).toContainText('0.8 Mpc');
  await expect(page.locator('.star-map__marker')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Centre on star' })).toHaveCount(0);
  await page.getByText('Names, coordinates and source', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open source response' })).toHaveAttribute('href', 'https://ned.ipac.caltech.edu/');
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${info.project.name}-research.png`) });
  await page.getByRole('button', { name: 'Close star map' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('late research cannot overwrite another star or reopen a closed map', async ({ page }, info) => {
  await enter(page, info.project.name.includes('mobile'));
  await page.route('**/__catalog/enrich/*', async route => {
    await new Promise(done => setTimeout(done, 800));
    await route.fulfill({ json: fixture() }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Look up Gaia and SIMBAD' }).click();
  await page.locator('#star-map-search').fill('Sirius');
  await page.getByRole('button', { name: 'Select Sirius', exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator('.star-map__card h2')).toHaveText('Sirius');
  await expect(page.locator('.star-map__card')).not.toContainText('Test galaxy');
  await page.getByRole('button', { name: 'Look up Gaia and SIMBAD' }).click();
  await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
