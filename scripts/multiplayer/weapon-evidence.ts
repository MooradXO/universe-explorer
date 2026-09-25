import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SOLAR_SYSTEM, bodyArrival } from '../../src/world/systems/SystemDescriptor';
import { stellarAddress } from '../../src/world/space/StellarAddress';
import { worldPosition } from '../../src/world/space/WorldPosition';
const label = process.env.WEAPON_LABEL || 'before', mode = process.env.CRUISE_QUALITY || 'HIGH';
const evidence = `${process.env.WEAPON_EVIDENCE_ROOT || 'docs/phases_archive/weapon-artifacts-2026-09-24'}/${label}-${mode}`;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW', recordVideo: { dir: evidence } });
const errors: string[] = [], samples: any[] = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())));
try {
  const save = { version: 1, address: stellarAddress(SOLAR_SYSTEM.anchor, worldPosition(undefined, bodyArrival(SOLAR_SYSTEM.bodies[3]))), spectrum: SOLAR_SYSTEM.spectrum, rotation: [0, 1, 0, 0], visited: [] };
  await page.addInitScript(({ mode, save }) => { localStorage.setItem('universe_gfx_mode', mode); localStorage.setItem('universe:stellar-flight:v1:guest', JSON.stringify(save)); }, { mode, save });
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:3014/'); await page.locator('.mode-card:has(input[value="pvp"])').click(); await page.locator('#btn-start-game').click(); await page.waitForTimeout(1300);
  for (const view of ['third', 'first']) {
    if (view === 'first') { await page.keyboard.press('v'); await page.waitForTimeout(600); }
    assert.equal((await snapshot()).world.ship.viewMode, view);
    for (const [key, weapon] of [['1', 'laser'], ['2', 'shotgun'], ['3', 'missile']]) {
      await page.keyboard.press(key); await page.waitForTimeout(600);
      if (weapon === 'shotgun' && process.env.BOLT_VERIFY === 'true') await page.keyboard.press('c');
      const idle = await snapshot(), frames: any[] = [];
      const size = page.viewportSize()!;
      const fire = mode === 'LOW' ? await page.locator('.mobile-action--fire').boundingBox() : null;
      await page.mouse.move(fire ? fire.x + fire.width / 2 : size.width / 2, fire ? fire.y + fire.height / 2 : size.height / 2); await page.mouse.down();
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(30); const frame = await snapshot(); frames.push(frame);
        if (i === 2) await page.screenshot({ path: `${evidence}/${view}-${weapon}.png` });
      }
      await page.mouse.up();
      assert.ok(frames.some(s => s.world.projectiles > 0), `${view} ${weapon} must fire`);
      if (process.env.AUDIO_VERIFY === 'true') {
        assert.ok(frames.some(s => s.world.audio.weapons?.played[weapon] > (idle.world.audio.weapons?.played[weapon] ?? 0)), `${weapon} uses its own sound`);
        assert.ok(frames.every(s => s.world.audio.weapons.active <= 16));
      }
      if (process.env.WEAPON_VERIFY === 'true') assert.ok(frames.every(s => s.renderer.lines <= idle.renderer.lines), 'No extra stationary firing line');
      if (process.env.BOLT_VERIFY === 'true' && weapon !== 'missile') {
        const shots = frames.flatMap(s => s.world.weaponVisuals.shots);
        assert.ok(shots.some((s: any) => s.tailLength >= (weapon === 'shotgun' ? 416 : 672)));
        assert.ok(shots.every((s: any) => s.tailLength <= 900));
      }
      samples.push({ view, weapon, idle, frames }); await page.waitForTimeout(1700);
      if (weapon === 'shotgun' && process.env.BOLT_VERIFY === 'true') await page.keyboard.press('c');
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${evidence}/evidence.json`, JSON.stringify({ label, mode, samples, errors }, null, 2));
  const video = page.video(); await browser.close(); if (video) await rename(await video.path(), `${evidence}/weapons.webm`);
}
console.log(JSON.stringify({ label, mode, cases: samples.length, maximumExtraLines: Math.max(...samples.flatMap(s => s.frames.map((f: any) => f.renderer.lines - s.idle.renderer.lines))), errors }));
