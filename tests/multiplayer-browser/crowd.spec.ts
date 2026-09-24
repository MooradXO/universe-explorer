import { test, expect } from '@playwright/test';
import { Client, type Room } from '@colyseus/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { NET, idleInput, type SelfSnapshot } from '../../src/network/shared/Protocol';

// One rendered browser plus 99 actual network clients in the same local battle.
// This measures one consumer device, not 100 rendered browsers or production capacity.
test('one browser receives and renders a 100-player moving battle', async ({ page }, info) => {
  const clients: { room: Room; state?: SelfSnapshot; seq: number; epoch: number }[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), info.project.name);
    await page.goto('/'); await page.locator('#btn-start-game').click();
    const snapshot = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
    await expect.poll(async () => (await snapshot()).realtime.subscribed).toBe(true);
    for (let i = 0; i < 99; i += 10) await Promise.all(Array.from({ length: Math.min(10, 99 - i) }, async (_, n) => {
      const room = await new Client('http://127.0.0.1:2567').joinById(NET.roomId, { version: NET.version, username: `Crowd${i + n}` });
      const item = { room, state: undefined as SelfSnapshot | undefined, seq: 0, epoch: 0 }; clients.push(item);
      room.onMessage('*', (type, data) => {
        if (type !== 'world') return;
        item.state = data.self;
        if (item.epoch !== data.self.epoch) { item.seq = 0; item.epoch = data.self.epoch; }
      });
    }));
    await expect.poll(async () => (await snapshot()).world.players.remote, { timeout: 15000 }).toBe(99);
    let last = performance.now(), budget = 0, frame = 0, lastFire = 0;
    timer = setInterval(() => {
      const now = performance.now(); budget += Math.min(.1, (now - last) / 1000); last = now;
      const steps = Math.floor(budget * NET.tickHz); budget -= steps / NET.tickHz; frame += steps;
      const fire = now - lastFire >= 410; if (fire) lastFire = now;
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i]; if (!c.state || c.state.dead || !c.room.connection.isOpen) continue;
        const phase = frame / NET.tickHz;
        const inputs = Array.from({ length: steps }, () => ({ ...idleInput(++c.seq), z: 1, yaw: .65,
          x: Math.sin(phase + i) * .35, pitch: Math.cos(phase * .5 + i) * .05, boost: frame % 600 < 80 }));
        if (inputs.length) c.room.send('input', { epoch: c.epoch, inputs });
        if (fire) c.room.send('fire', { epoch: c.epoch, weapon: 'shotgun', color: 'red' });
      }
    }, 20);
    await page.waitForTimeout(4000);
    const samples: any[] = [];
    for (let i = 0; i < 15; i++) { await page.waitForTimeout(1000); samples.push(await snapshot()); }
    const metrics = await (await fetch('http://127.0.0.1:2567/metrics')).json();
    const result = { mode: info.project.name, averageFPS: samples.reduce((n, s) => n + s.fps, 0) / samples.length,
      maxP95FrameMs: Math.max(...samples.map(s => s.p95FrameTimeMs)), maxRemotePlayers: Math.max(...samples.map(s => s.world.players.remote)),
      maxProjectiles: Math.max(...samples.map(s => s.world.projectiles)), metrics, samples, errors };
    await mkdir('.multiplayer-evidence', { recursive: true });
    await writeFile(`.multiplayer-evidence/${info.project.name}-crowd.json`, JSON.stringify(result, null, 2));
    await page.screenshot({ path: `.multiplayer-evidence/${info.project.name}-crowd.png` });
    expect(metrics.players).toBe(100); expect(result.maxRemotePlayers).toBe(99);
    expect(result.maxProjectiles).toBeGreaterThan(100); expect(errors).toEqual([]);
    expect(samples.every(s => s.realtime.subscribed)).toBe(true);
    expect(samples.at(-1).realtime.received - samples[0].realtime.received).toBeGreaterThan(120);
    expect(Math.max(...samples.map(s => s.realtime.pendingInputs))).toBeLessThan(20);
    expect(result.averageFPS).toBeGreaterThan(25);
  } finally {
    if (timer) clearInterval(timer);
    await Promise.allSettled(clients.map(c => c.room.leave()));
    await page.goto('about:blank');
    await expect.poll(async () => (await (await fetch('http://127.0.0.1:2567/metrics')).json()).players, { timeout: 24000 }).toBe(0);
  }
});
