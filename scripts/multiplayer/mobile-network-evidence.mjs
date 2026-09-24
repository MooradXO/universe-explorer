import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startServer } from '../../server/index.ts';

const evidence = 'docs/phases_archive/mobile-controls-2026-09-24/network';
await mkdir(evidence, { recursive: true });
const isolated = await startServer({ port: 2577, store: null, allowBots: false });
isolated.server.simulateLatency(240);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const snapshots = [];
try {
  await page.route('http://127.0.0.1:2567/matchmake/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':2567/', ':2577/') });
    const reservation = await response.json(); reservation.publicAddress = '127.0.0.1:2577';
    await route.fulfill({ response, json: reservation });
  });
  await page.addInitScript(() => localStorage.setItem('universe_gfx_mode', 'LOW'));
  await page.goto('http://127.0.0.1:3012/'); await page.locator('#btn-start-game').click();
  await page.waitForFunction(() => window.__UNIVERSE_DEBUG__.snapshot().realtime.subscribed);
  const snapshot = async label => {
    const client = await page.evaluate(() => window.__UNIVERSE_DEBUG__.snapshot());
    const pilot = [...isolated.room.game.pilots.values()][0];
    const server = { input: { ...pilot.input }, position: pilot.position.toArray(), rotation: pilot.quaternion.toArray(), fired: isolated.room.game.fired };
    const result = { label, client, server }; snapshots.push(result); return result;
  };
  const cd = await page.context().newCDPSession(page);
  const bounds = await page.locator('.mobile-joystick').boundingBox();
  const fire = await page.getByRole('button', { name: 'FIRE', exact: true }).boundingBox();
  const points = [{ id: 1, x: bounds.x + bounds.width / 2 + 28, y: bounds.y + bounds.height / 2 - 14 }, { id: 2, x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 }];
  const before = await snapshot('idle');
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await page.waitForTimeout(1800);
  const held = await snapshot('held');
  assert.equal(held.server.input.z, 1); assert.ok(held.server.input.yaw < -.1); assert.ok(held.server.input.pitch > .05);
  assert.ok(Math.hypot(...held.server.position.map((v, i) => v - before.server.position[i])) > 100);
  assert.ok(Math.abs(held.server.rotation.reduce((n, v, i) => n + v * before.server.rotation[i], 0)) < .98);
  assert.ok(held.server.fired - before.server.fired >= 3);
  await page.screenshot({ path: `${evidence}/both-held.png` });
  await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  const released = await snapshot('released');
  assert.equal(released.server.input.z, 0); assert.equal(released.server.input.yaw, 0); assert.equal(released.server.input.pitch, 0);
  assert.equal(released.client.world.ship.mobileInput.firing, false);
  await page.waitForTimeout(500); assert.equal(isolated.room.game.fired, released.server.fired);
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  await page.waitForTimeout(700);
  assert.equal([...isolated.room.game.pilots.values()][0].cruise, 'sol/mars');
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await page.waitForTimeout(1100);
  const resumed = await snapshot('cruise-to-held-flight');
  assert.equal([...isolated.room.game.pilots.values()][0].cruise, null);
  assert.equal(resumed.server.input.z, 1, 'Held stick resumes after cruise stop acknowledgment');
  assert.ok(resumed.server.input.yaw < -.1);
  assert.equal(resumed.client.world.ship.mobileInput.firing, true);
  await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', simulatedRTTms: 240, serverShots: held.server.fired - before.server.fired, errors }));
} finally {
  await writeFile(`${evidence}/evidence.json`, JSON.stringify({ snapshots, errors }, null, 2));
  await browser.close(); await isolated.close();
}
process.exit(0);
