import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { startServer } from '../../server/index';
import { SOLAR_SYSTEM, bodyArrival } from '../../src/world/systems/SystemDescriptor';
import { absolutePosition } from '../../src/world/space/WorldPosition';
import assert from 'node:assert/strict';

// A fresh, isolated guest and normal UI actions; debug data is read-only.
const mode = process.env.CRUISE_QUALITY || 'HIGH';
const label = process.env.CRUISE_LABEL || 'before';
const evidence = `${process.env.CRUISE_EVIDENCE_ROOT || 'docs/phases_archive/flight-cruise-2026-09-24'}/${label}-${mode}`;
await mkdir(evidence, { recursive: true });
const isolated = await startServer({ port: 2567, store: null, allowBots: false, maxPlayers: 50 });
const latency = Number(process.env.CRUISE_LATENCY || 240);
isolated.server.simulateLatency(latency);
const commands: unknown[] = [], samples: any[] = [], errors: string[] = [];
const originalAction = isolated.room.game.action.bind(isolated.room.game);
isolated.room.game.action = (id, type, data) => {
  const accepted = originalAction(id, type, data);
  if (['cruise', 'stop', 'base', 'warp'].includes(type)) commands.push({ at: Date.now(), type, target: (data as { target?: string })?.target, accepted });
  return accepted;
};
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW',
  recordVideo: process.env.CRUISE_VIDEO === 'true' ? { dir: evidence, size: { width: 1280, height: 720 } } : undefined });
page.on('pageerror', error => errors.push(error.message));
const mars = SOLAR_SYSTEM.bodies.find(body => body.id === 'sol/mars')!;
const target = bodyArrival(mars);
const capture = async (stage: string, screenshot = false) => {
  const client: any = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__UNIVERSE_DEBUG__.snapshot())));
  const pilot = [...isolated.room.game.pilots.values()][0];
  const server = isolated.room.game.self(pilot);
  const navigation = await page.locator('.system-navigation').evaluate(element => ({
    label: element.querySelector('[role=combobox]')?.textContent,
    icon: (element.querySelector('.navigation-symbol') as HTMLElement)?.style.backgroundImage,
    progress: element.querySelector('.navigation-progress')?.textContent,
    button: element.querySelector('.navigation-cruise')?.textContent,
  }));
  const position = absolutePosition(client.world.ship.worldPosition);
  const distance = (p: readonly number[]) => Math.hypot(...p.map((n, i) => n - target[i]));
  const sample = { stage, at: Date.now(), clientDistance: distance(position), serverDistance: distance(server.flight.p), clientPosition: position, server, client, navigation };
  samples.push(sample);
  if (screenshot) await page.screenshot({ path: `${evidence}/${stage}.png` });
  console.log(JSON.stringify({ stage, selected: client.world.travel.selected, cruise: client.world.travel.cruising, distance: sample.clientDistance, serverDistance: sample.serverDistance, speed: client.world.ship.speed, status: server.travelStatus }));
  return sample;
};
try {
  await page.addInitScript(value => localStorage.setItem('universe_gfx_mode', value), mode);
  await page.goto('http://127.0.0.1:3012/');
  await page.locator('#btn-start-game').click();
  await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__?.snapshot().realtime.subscribed && !(window as any).__UNIVERSE_DEBUG__.snapshot().flightInputBlocked);
  await page.waitForTimeout(1500);
  await capture('earth', true);
  if (process.env.CRUISE_MANUAL_SECONDS) {
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(Number(process.env.CRUISE_MANUAL_SECONDS) * 1000);
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    await page.waitForTimeout(1000); await capture('after-manual', true);
  }
  await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
  await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await capture('mars-selected', true);
  await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  for (let second = 1; second <= 65; second++) {
    await page.waitForTimeout(1000);
    const s = await capture(`cruise-${second}`, [1, 5, 10, 20, 30, 45, 60].includes(second));
    if (!s.server.cruise) { await page.waitForTimeout(latency + 800); await capture('ended', true); break; }
  }
  if (process.env.CRUISE_VERIFY === 'true') {
    const last = samples[samples.length - 1];
    assert.match(last.server.travelStatus, /Destination reached/);
    assert.ok(last.clientDistance < 1 && last.serverDistance < 1);
    assert.equal(last.client.world.travel.selected, 'sol/mars');
    assert.equal(last.client.world.travel.cruising, false);
    assert.equal(last.client.flightInputBlocked, false);
    assert.ok(last.navigation.icon.includes('mars.webp'));
    assert.ok(last.navigation.progress.includes('ARRIVED'));
    assert.ok(samples.filter(s => s.client.world.travel.cruising).every(s => Math.hypot(...s.client.world.ship.cameraOffset) < 650));
  }
  if (process.env.CRUISE_VISUAL_VERIFY === 'true') {
    const idle = samples[0].client.world.ship, ships = samples.map(s => s.client.world.ship), last = ships[ships.length - 1];
    const peak = ships.reduce((best, ship) => ship.cruiseIntensity > best.cruiseIntensity ? ship : best, idle);
    assert.ok(peak.cruiseIntensity > .85);
    assert.ok(Math.hypot(...peak.cameraOffset) > Math.hypot(...idle.cameraOffset) + 60);
    assert.ok(peak.engine.plumeLength > idle.engine.plumeLength * 2);
    assert.ok(last.cruiseIntensity < .1);
    assert.ok(ships.every(ship => Math.hypot(...ship.cameraOffset) < 650));
    assert.ok(samples.every(s => Math.hypot(...s.client.world.flightDust.visualDisplacement) <= 125.01));
  }
  if (process.env.CRUISE_STOP_CHECK === 'true') {
    await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
    await page.getByRole('option', { name: 'Earth', exact: true }).click();
    await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
    await page.waitForTimeout(2500); await capture('return-cruise', true);
    await page.getByRole('button', { name: 'STOP', exact: true }).click();
    await page.waitForTimeout(1000); const stopped = await capture('stopped', true);
    await page.waitForTimeout(1000); const held = await capture('stop-held');
    assert.equal(held.server.cruise, null); assert.equal(held.client.world.travel.cruising, false);
    assert.equal(held.client.flightInputBlocked, false); assert.equal(Math.hypot(...held.server.flight.v), 0);
    assert.ok(Math.hypot(...held.server.flight.p.map((v: number, i: number) => v - stopped.server.flight.p[i])) < 1);
    if (process.env.CRUISE_SWITCH_CHECK === 'true') {
      await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
      await page.waitForTimeout(1000);
      await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
      await page.getByRole('option', { name: 'Mars', exact: true }).click();
      await page.waitForTimeout(latency + 300);
      const selected = await capture('changed-target', true);
      assert.equal(selected.client.world.travel.selected, 'sol/mars');
      assert.ok(selected.navigation.label?.includes('Mars'));
      await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
      await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.cruising);
      await page.waitForFunction(() => (window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.status.includes('Destination reached'), { timeout: 45000 });
      await page.waitForTimeout(1000); // Allow the existing final network correction to settle.
      const returned = await capture('switch-arrival', true);
      assert.ok(returned.clientDistance < 1); assert.equal(returned.server.cruise, null);
    }
  }
  assert.equal(errors.length, 0);
  console.log('Cruise evidence checks completed.');
} catch (error) { errors.push(String(error)); throw error; }
finally {
  await writeFile(`${evidence}/evidence.json`, JSON.stringify({ mode, latency, target, commands, samples, errors }, null, 2));
  const video = page.video(); await browser.close();
  if (video) await rename(await video.path(), `${evidence}/flight.webm`);
  await isolated.close();
}
