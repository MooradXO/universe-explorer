import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { startServer } from '../../server/index';
import { bodyArrival, SOLAR_SYSTEM } from '../../src/world/systems/SystemDescriptor';
import { faceFlightDirection } from '../../src/world/systems/FlightOrientation';

const mode = process.env.CRUISE_QUALITY || 'HIGH';
const evidence = `${process.env.WEAPON_EVIDENCE_ROOT || 'docs/phases_archive/laser-bolts-2026-09-24'}/network-${mode}`;
await mkdir(evidence, { recursive: true });
const isolated = await startServer({ port: 2567, store: null, allowBots: false, maxPlayers: 50 });
isolated.server.simulateLatency(240);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, hasTouch: mode === 'LOW', isMobile: mode === 'LOW', recordVideo: { dir: evidence } });
const samples: any[] = [], errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())));
const capture = async (stage: string) => { const client = await snapshot(); samples.push({ stage, time: isolated.room.game.time, hits: isolated.room.game.hits, client }); return client; };
try {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mode);
  await page.goto('http://127.0.0.1:3012/'); await page.locator('.mode-card:has(input[value="pvp"])').click(); await page.locator('#btn-start-game').click();
  await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__?.snapshot().realtime.subscribed);
  const game = isolated.room.game, pilot = [...game.pilots.values()][0];
  // An isolated fixture in empty space, beyond the Mars arrival corridor.
  pilot.position.fromArray(bodyArrival(SOLAR_SYSTEM.bodies[3])).add(new Vector3(0, 0, 8000));
  faceFlightDirection(pilot.quaternion, new Vector3(0, 0, 1)); pilot.epoch++; game.announce(pilot);
  const target = game.add('weapon-fixture', 'Local weapon fixture');
  for (const [view, distance] of [['third', 2200], ['first', 5200]] as const) {
    if (view === 'first') await page.keyboard.press('v');
    target.position.copy(pilot.position).add(new Vector3(0, 0, distance));
    target.shield = 1000; target.regenAt = game.time + 100;
    await page.waitForTimeout(700); const startHits = game.hits;
    const size = page.viewportSize()!, fire = mode === 'LOW' ? await page.locator('.mobile-action--fire').boundingBox() : null;
    await page.mouse.move(fire ? fire.x + fire.width / 2 : size.width / 2, fire ? fire.y + fire.height / 2 : size.height / 2);
    await page.keyboard.press('1'); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    let sawShot = false;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(80); const s = await capture(`${view}-hit-${i}`);
      sawShot ||= s.world.weaponVisuals.shots.some((s: any) => s.laser && s.tailLength >= 240);
      if (i === 4) await page.screenshot({ path: `${evidence}/${view}-hit.png` });
    }
    assert.ok(sawShot); assert.ok(game.hits > startHits); assert.ok(target.shield < 1000);
    assert.equal((await snapshot()).world.weaponVisuals.shots.length, 0, 'confirmed impact removes the visual');
  }
  target.position.copy(pilot.position).add(new Vector3(-1800, 0, 2100));
  faceFlightDirection(target.quaternion, new Vector3(1, 0, 0));
  const startHits = game.hits;
  const beforeRemote = await snapshot();
  assert.ok(game.action(target.id, 'fire', { epoch: target.epoch, weapon: 'laser', color: 'green' }));
  let remoteSeen = false, spatialHeard = false;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(100); const s = await capture(`remote-miss-${i}`);
    remoteSeen ||= s.world.weaponVisuals.shots.some((s: any) => s.id && s.laser && s.tailLength >= 240);
    spatialHeard ||= s.world.audio?.weapons?.spatial > 0;
    if (i === 4) await page.screenshot({ path: `${evidence}/remote-miss.png` });
  }
  assert.ok(remoteSeen); assert.equal(game.hits, startHits); assert.equal((await snapshot()).world.weaponVisuals.shots.length, 0);
  if (process.env.AUDIO_VERIFY === 'true') {
    assert.ok(spatialHeard, 'remote sound has a spatial source');
    assert.equal((await snapshot()).world.audio.weapons.played.laser, beforeRemote.world.audio.weapons.played.laser + 1, 'one sound per network shot');
    assert.equal((await snapshot()).world.audio.weapons.active, 0);
  }
  assert.deepEqual(errors, []);
  console.log(`${mode}: network hit at 2200/5200, both cameras, remote miss/expiry at RTT 240 PASS`);
} catch (e) { errors.push(String(e)); throw e; }
finally {
  await writeFile(`${evidence}/evidence.json`, JSON.stringify({ mode, rttMs: 240, samples, errors }, null, 2));
  const video = page.video(); await browser.close(); if (video) await rename(await video.path(), `${evidence}/network-weapons.webm`);
  isolated.room.game.remove('weapon-fixture'); await isolated.close();
}
