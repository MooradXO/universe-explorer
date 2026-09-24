import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform } from 'node:os';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { NET, idleInput, type SelfSnapshot } from '../../src/network/shared/Protocol';
import { WorldDecoder } from '../../src/network/shared/WorldCodec';

// Deliberately loopback-only. This harness cannot be pointed at the production host.
const port = 2579, endpoint = `http://127.0.0.1:${port}`, seconds = Number(process.env.LOCAL_LOAD_SECONDS || 30);
const sizes = (process.env.LOCAL_LOAD_SIZES || '10,25,50,100').split(',').map(Number);
const modes = (process.env.LOCAL_LOAD_MODES || 'clustered,distributed').split(',');
assert.ok(seconds >= 10 && seconds <= 600 && sizes.every(n => n >= 1 && n <= 100));
assert.ok(modes.every(mode => mode === 'clustered' || mode === 'distributed'));
const withBots = process.env.LOCAL_LOAD_BOTS === 'true';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const output: unknown[] = [];
await mkdir('.multiplayer-evidence', { recursive: true });
for (const mode of modes) for (const count of sizes) {
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, MULTIPLAYER_PORT: String(port),
    MULTIPLAYER_HOST: '127.0.0.1', MULTIPLAYER_SAVE: `.multiplayer-evidence/load-${mode}-${count}-guests.json` }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let log = '', startup = ''; server.stderr.on('data', data => { log += String(data); }); server.stdout.on('data', data => { startup += String(data); });
  const clients: { room: Room; state?: SelfSnapshot; seq: number; epoch: number; received: number; lastAt: number; maxGap: number; gaps: number[]; visible: Set<string> }[] = [];
  let timer: ReturnType<typeof setInterval> | undefined, disconnects = 0;
  try {
    for (let i = 0; ; i++) {
      if (server.exitCode !== null) throw new Error(`Local load process exited: ${log}`);
      try { if (startup.includes('Multiplayer listening') && (await fetch(`${endpoint}/health`)).ok) break; } catch { /* startup */ }
      if (i > 100) throw new Error(`Local load server did not start: ${log}`); await wait(100);
    }
    for (let i = 0; i < count; i += 10) await Promise.all(Array.from({ length: Math.min(10, count - i) }, async (_, n) => {
      const room = await new Client(endpoint).joinById(NET.roomId, { version: NET.version, username: `Load${i + n}` });
      const decoder = new WorldDecoder();
      const item = { room, state: undefined as SelfSnapshot | undefined, seq: 0, epoch: 0, received: 0, lastAt: 0, maxGap: 0, gaps: [] as number[], visible: new Set<string>() }; clients.push(item);
      room.onMessage('*', (type, data) => {
        if (type === 'arrival') decoder.reset();
        if (type !== 'world') return;
        data = decoder.decode(data);
        item.state = data.self;
        if (item.epoch !== data.self.epoch) { item.seq = 0; item.epoch = data.self.epoch; item.visible.clear(); }
        for (const entity of data.entities) item.visible.add(entity.id); for (const id of data.gone) item.visible.delete(id);
        const now = performance.now(); if (item.lastAt) { const gap = now - item.lastAt; item.maxGap = Math.max(item.maxGap, gap); item.gaps.push(gap); }
        item.lastAt = now; item.received++;
      });
      room.onDrop(() => disconnects++); room.onLeave(() => disconnects++);
    }));
    await wait(1000);
    if (mode === 'distributed') {
      // The shipped read-only catalogue resolves these AT-HYG identities; no invented coordinates.
      for (let i = 0; i < clients.length; i++) {
        const item = clients[i], target = i % 10 + 1;
        if (target !== 1) item.room.send('warp', { epoch: item.epoch, systemId: `athyg:4.0:${target}` });
      }
      await wait(3000);
      assert.ok(new Set(clients.map(c => c.state?.systemId)).size >= Math.min(count, 10), 'Distributed destinations must actually be reached');
    }
    if (withBots) { clients[0].room.send('bots', { epoch: clients[0].epoch }); await wait(500); }
    let frame = 0, last = performance.now(), budget = 0, lastFire = 0;
    timer = setInterval(() => {
      const now = performance.now(); budget = Math.min(.1, budget + (now - last) / 1000); last = now;
      const steps = Math.floor(budget * NET.tickHz); budget -= steps / NET.tickHz; frame += steps;
      const firing = now - lastFire >= 410; if (firing) lastFire = now;
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i]; if (!c.state || c.state.dead || !c.room.connection.isOpen) continue;
        // Wall-clock 50Hz, even with Windows timer coalescing. Pilots share a 1–3km region.
        const phase = frame / NET.tickHz, inputs = Array.from({ length: steps }, () => ({ ...idleInput(++c.seq), z: 1, yaw: .65,
          x: Math.sin(phase + i) * .35, pitch: Math.cos(phase * .5 + i) * .05, boost: frame % 600 < 80 }));
        while (inputs.length) c.room.send('input', { epoch: c.epoch, inputs: inputs.splice(0, 5) });
        if (firing) c.room.send('fire', { epoch: c.epoch, weapon: 'shotgun', color: 'red' });
      }
    }, 20);
    await wait(3000); // Warm-up excluded from measurements.
    for (const c of clients) { c.gaps = []; c.maxGap = 0; c.received = 0; }
    const before = await (await fetch(`${endpoint}/metrics`)).json(), start = performance.now();
    console.log(`Measuring ${mode}: ${count} active moving/firing clients, ${seconds}s`);
    await wait(seconds * 1000);
    const elapsed = (performance.now() - start) / 1000, after = await (await fetch(`${endpoint}/metrics`)).json();
    clearInterval(timer); timer = undefined;
    const gaps = clients.flatMap(c => c.gaps).sort((a, b) => a - b), percentile = (p: number) => gaps[Math.floor(gaps.length * p)] ?? 0;
    const result = { mode, count, elapsed, server: after, measurement: {
      observedTickHz: (after.tick - before.tick) / elapsed, serverCPUPercentOfOneCore: (after.cpuMicroseconds - before.cpuMicroseconds) / (elapsed * 10000),
      serverRSSMiB: after.rssBytes / 1048576, outboundMbps: (after.socketBytesWritten - before.socketBytesWritten) * 8 / elapsed / 1e6,
      shotsFired: after.fired - before.fired, hits: after.hits - before.hits, rejected: after.rejected - before.rejected,
      rejectedByReason: Object.fromEntries(Object.entries(after.rejectedByReason ?? {}).map(([reason, value]) => [reason, Number(value) - (before.rejectedByReason?.[reason] ?? 0)])),
      snapshotGapMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: Math.max(...clients.map(c => c.maxGap)) },
      minSnapshotsPerSecond: Math.min(...clients.map(c => c.received)) / elapsed, disconnects,
      systems: new Set(clients.map(c => c.state?.systemId)).size, bots: after.bots, maxPendingInputs: Math.max(...clients.map(c => c.seq - (c.state?.seq ?? 0))),
      visiblePeersAtEnd: { min: Math.min(...clients.map(c => c.visible.size)), max: Math.max(...clients.map(c => c.visible.size)) },
      maxDistanceFromFirstAtEnd: Math.max(...clients.map(c => Math.hypot(...c.state!.flight.p.map((v, i) => v - clients[0].state!.flight.p[i])))),
    }, stderr: log };
    output.push(result); console.log(JSON.stringify(result.measurement));
    assert.equal(disconnects, 0); assert.equal(after.players, count); assert.ok(result.measurement.observedTickHz > 48);
    assert.ok(result.measurement.shotsFired > count * seconds * 5.5, 'All clients must fire continuously');
    assert.ok(result.measurement.minSnapshotsPerSecond > 9);
    assert.ok(result.measurement.maxPendingInputs < 25, 'Clients must keep receiving input acknowledgements');
    if (mode === 'clustered' && !withBots) assert.equal(result.measurement.visiblePeersAtEnd.min, count - 1, 'Every pilot must still see the complete crowd');
  } finally {
    if (timer) clearInterval(timer);
    await Promise.race([Promise.allSettled(clients.map(c => c.room.leave())), wait(1000)]);
    server.kill(); await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', () => resolve()); });
    await writeFile(withBots ? '.multiplayer-evidence/load-with-bots.json' : '.multiplayer-evidence/load.json', JSON.stringify({ date: new Date().toISOString(), host: { platform: platform(), cpu: cpus()[0]?.model,
      logicalCPUs: cpus().length, ramGiB: totalmem() / 1073741824, node: process.version }, seconds, results: output }, null, 2));
  }
}
