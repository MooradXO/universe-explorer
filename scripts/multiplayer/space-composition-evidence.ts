import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Quaternion, Euler } from 'three';
import { REVIEW_WORLDS } from '../../src/world/environments/EnvironmentReviewWorlds';
import { stellarAddress } from '../../src/world/space/StellarAddress';
import { worldPosition, absolutePosition, type Triple } from '../../src/world/space/WorldPosition';
const label = process.env.COMPOSITION_LABEL || 'before', mode = process.env.CRUISE_QUALITY || 'HIGH';
const evidence = `docs/phases_archive/space-composition-2026-09-24/${label}-${mode}`;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const samples: any[] = [], errors: string[] = [];
try {
  for (const index of [2, 4, 8]) for (const angle of [0, .32]) {
    const { body, system } = REVIEW_WORLDS[index];
    // Same physical camera location before/after; only the artistic composition changes.
    const position: Triple = [body.position[0], body.position[1], body.position[2] + body.radius + Math.max(3500, body.radius * .6)];
    const rotation = new Quaternion().setFromEuler(new Euler(0, angle, 0)).toArray();
    const save = { version: 1, address: stellarAddress(system.anchor, worldPosition(undefined, position)), spectrum: system.spectrum, rotation, visited: [] };
    const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW' });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ mode, save }) => { localStorage.setItem('universe_gfx_mode', mode); localStorage.setItem('universe:stellar-flight:v1:guest', JSON.stringify(save)); }, { mode, save });
    await page.goto('http://127.0.0.1:3014/'); await page.locator('#btn-start-game').click();
    await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().world.space.system.fullPlanets > 0);
    await page.waitForTimeout(1800);
    const sample: any = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())));
    const actual = sample.world.space.system.bodies.find((b: any) => b.id === body.id);
    assert.equal(actual.radius, body.radius); assert.deepEqual(actual.position, [...body.position]);
    assert.ok(Math.hypot(...absolutePosition(sample.world.ship.worldPosition).map((v, i) => v - position[i])) < .01);
    if (process.env.COMPOSITION_VERIFY === 'true') {
      assert.ok(sample.world.space.system.panorama.instances > 0);
      assert.ok(sample.world.space.system.panorama.instances <= (mode === 'LOW' ? 180 : 420));
    }
    await page.screenshot({ path: `${evidence}/world-${index}-angle-${angle}.png` });
    samples.push({ body: body.id, angle, fixturePosition: position, sample }); await page.close();
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(`${evidence}/evidence.json`, JSON.stringify({ label, mode, samples, errors }, null, 2)); await browser.close(); }
console.log(JSON.stringify({ label, mode, samples: samples.length, errors }));
