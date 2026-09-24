import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Packr } from 'msgpackr';
import { Simulation } from '../../server/Simulation';
import { CruiseNavigator } from '../../src/world/systems/CruiseNavigator';
import { cruiseStep } from '../../src/world/systems/CruiseMotion';
import { WorldEncoder } from '../../src/network/shared/WorldCodec';
import type { WorldSnapshot } from '../../src/network/shared/Protocol';

// In-process comparison of 50 simultaneous direct cruises, not a VPS capacity claim.
const originalStep = CruiseNavigator.prototype.step;
const packer = new Packr({ useRecords: false });
function measure(legacy: boolean) {
  CruiseNavigator.prototype.step = legacy ? function(position, target, obstacles, dt) {
    return { ...cruiseStep(position, target, obstacles, dt), heading: target, avoiding: false };
  } : originalStep;
  const encoders = new Map<string, WorldEncoder>();
  let bytes = 0, snapshots = 0;
  const game = new Simulation(() => null, (id, type, data) => {
    if (type !== 'world') return;
    bytes += packer.pack(encoders.get(id)!.encode(data as WorldSnapshot)).byteLength;
    snapshots++;
  });
  for (let n = 0; n < 50; n++) {
    const p = game.add(`pilot-${n}`, `Pilot ${n}`); encoders.set(p.id, new WorldEncoder());
    game.action(p.id, 'cruise', { epoch: p.epoch, target: 'sol/mars' });
  }
  const start = performance.now(), cpu = process.cpuUsage();
  for (let step = 0; step < 1500; step++) game.step();
  const used = process.cpuUsage(cpu), ms = performance.now() - start;
  assert.ok([...game.pilots.values()].every(p => p.travelStatus.includes('Destination reached')));
  return { legacy, players: 50, simulatedSeconds: 30, elapsedMs: ms, millisecondsPerTick: ms / 1500,
    cpuMilliseconds: (used.user + used.system) / 1000, snapshots, encodedPayloadBytes: bytes, bytesPerSimulatedSecond: bytes / 30 };
}
try {
  measure(true); measure(false); // JIT/cache warm-up for both paths.
  const samples = [measure(true), measure(false), measure(false), measure(true)];
  const before = samples.filter(s => s.legacy), after = samples.filter(s => !s.legacy);
  const average = (values: typeof samples, key: 'millisecondsPerTick' | 'encodedPayloadBytes') => values.reduce((sum, s) => sum + s[key], 0) / values.length;
  const result = { note: 'Local in-process simulation and MessagePack payloads; excludes sockets/TLS, browser and VPS effects.', samples,
    tickMsBefore: average(before, 'millisecondsPerTick'), tickMsAfter: average(after, 'millisecondsPerTick'),
    payloadRatio: average(after, 'encodedPayloadBytes') / average(before, 'encodedPayloadBytes') };
  assert.ok(result.payloadRatio <= 1.01);
  await writeFile('docs/phases_archive/flight-cruise-2026-09-24/budget.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { CruiseNavigator.prototype.step = originalStep; }
