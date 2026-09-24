import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = 'docs/phases_archive/generator-expansion-2026-09-24/layers';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [], resources = [];
try {
  for (const quality of ['HIGH', 'LOW']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(`http://127.0.0.1:3018/environments.html?world=4&quality=${quality}`);
    await page.waitForFunction(() => window.__UNIVERSE_ENVIRONMENTS__?.snapshot().surface.texture === 'ready');
    await page.waitForTimeout(400);
    const snapshot = () => page.evaluate(() => window.__UNIVERSE_ENVIRONMENTS__.snapshot());
    const baseline = await snapshot();
    await page.locator('details.catalog').evaluate(e => e.open = true);
    const cases = [['surface', [0,16,24,32,40,50]], ['geology', Array.from({length:12}, (_,i)=>i)],
      ['circulation', Array.from({length:8}, (_,i)=>i)], ['clouds',[0,9,19,31]], ['atmosphere',[0,8,15,23]], ['aurora',[0,5,9,15]], ['ring',[0,10,17,31]]];
    for (const [category, recipes] of cases) {
      await page.locator('#category').selectOption(category);
      for (const recipe of recipes) {
        await page.locator('#recipe').selectOption(String(recipe));
        await page.waitForTimeout(160);
        const state = await snapshot();
        assert.equal(state.override.category, category); assert.equal(state.override.recipe, recipe);
        assert.ok(state.drawCalls > 0); assert.ok(state.textures <= 18);
        results.push({ quality, category, recipe, surface: state.surface, calls: state.drawCalls, textures: state.textures });
        if ((category === 'geology' && [1,6,8,10].includes(recipe)) || (category === 'circulation' && recipe === 3)) {
          await page.locator('#stage').screenshot({ path: `${root}/${quality}-${category}-${recipe}.png` });
        }
      }
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.locator('#world').selectOption('8'); await page.waitForTimeout(200);
      await page.locator('#world').selectOption('4');
      await page.waitForFunction(() => window.__UNIVERSE_ENVIRONMENTS__.snapshot().surface.texture === 'ready'); await page.waitForTimeout(400);
      const state = await snapshot(); resources.push({ quality, cycle, geometries: state.geometries, textures: state.textures });
      assert.equal(state.geometries, baseline.geometries); assert.equal(state.textures, baseline.textures);
    }
    await page.close();
  }
  // A delayed/failed atlas must never replace the procedural globe with black.
  for (const failure of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    let release; const gate = new Promise(resolve => release = resolve);
    await page.route('**/jupiter.webp', async route => { if (failure) await route.abort(); else { await gate; await route.continue(); } });
    await page.goto('http://127.0.0.1:3018/environments.html?world=4&quality=LOW', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__UNIVERSE_ENVIRONMENTS__?.snapshot().fps > 0);
    let state = await page.evaluate(() => window.__UNIVERSE_ENVIRONMENTS__.snapshot());
    assert.equal(state.surface.texture, failure ? 'fallback-error' : 'fallback-loading');
    await page.locator('#stage').screenshot({ path: `${root}/${failure?'failed':'delayed'}-jupiter.png` });
    if (!failure) { release(); await page.waitForFunction(() => window.__UNIVERSE_ENVIRONMENTS__.snapshot().surface.texture === 'ready'); }
    results.push({ failure, surface: state.surface }); await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(`${root}/evidence.json`, JSON.stringify({ results, resources, errors }, null, 2)); await browser.close(); }
console.log(JSON.stringify({ cases: results.length, cycles: resources.length, errors }));
