import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { startServer } from '../../server/index';
import { idleInput, NET, type WorldSnapshot } from '../../src/network/shared/Protocol';
import { WorldDecoder } from '../../src/network/shared/WorldCodec';
import { localProxy } from './local-proxy';
import { mkdir, writeFile } from 'node:fs/promises';

const port = 2578, endpoint = `http://127.0.0.1:${port}`;
const running = await startServer({ port, store: null, allowBots: true });
const capacity = running.room.maxClients;
const closeProxy = await localProxy(2580, port);
const rooms: Room[] = [];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 5000) {
  const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) throw new Error('Integration condition timed out'); await wait(25); }
}
async function join(name: string, token?: string, url = endpoint) {
  const room = await new Client(url).joinById(NET.roomId, { version: NET.version, username: name, token }); rooms.push(room);
  room.reconnection.minUptime = 0;
  const decoder = new WorldDecoder(); room.onReconnect(() => decoder.reset());
  const state: { world?: WorldSnapshot; id?: string; token?: string; events: { type: string; data: any }[]; visible: Set<string> } = { events: [], visible: new Set() };
  room.onMessage('*', (type, data) => {
    if (type === 'arrival') { decoder.reset(); state.visible.clear(); }
    if (type === 'world') { state.world = decoder.decode(data); for (const entity of state.world.entities) state.visible.add(entity.id); for (const id of state.world.gone) state.visible.delete(id); }
    else if (type === 'welcome') { state.id = data.id; state.token = data.token; }
    else state.events.push({ type: String(type), data });
  });
  await until(() => !!state.world && !!state.id); return { room, state };
}
try {
  const a = await join('A'), b = await join('B');
  const ticks = running.room.game.tick, at = performance.now(); await wait(1000);
  assert.ok((running.room.game.tick - ticks) / ((performance.now() - at) / 1000) > 48, 'Fixed simulation must advance at wall-clock 50Hz');
  await until(() => a.state.visible.has(b.state.id!));
  const proxied = await join('Proxy', undefined, 'http://127.0.0.1:2580/multiplayer');
  assert.equal(proxied.state.world!.self.systemId, a.state.world!.self.systemId); await proxied.room.leave();
  assert.equal((await fetch('http://127.0.0.1:2580/multiplayer/metrics')).status, 404);
  assert.equal((await fetch(`${endpoint}/matchmake/create/universe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canonical: true }) })).status, 404);
  assert.equal((await fetch(`${endpoint}/health`, { headers: { origin: 'https://untrusted.example' } })).status, 403);
  const burst = await join('RateLimit');
  for (let i = 0; i < 170; i++) burst.room.send('unknown', {});
  await until(() => !running.room.game.pilots.has(burst.state.id!) && !burst.room.connection.isOpen, 3000);
  await assert.rejects(() => new Client(endpoint).joinById(NET.roomId, { version: NET.version, token: a.state.token }));
  const start = running.room.game.pilots.get(a.state.id!)!.position.clone();
  a.room.send('input', { epoch: a.state.world!.self.epoch, inputs: [1, 2, 3, 4, 5].map(seq => ({ ...idleInput(seq), z: 1 })) });
  await until(() => a.state.world!.self.seq === 5); assert.ok(running.room.game.pilots.get(a.state.id!)!.position.distanceTo(start) > 0);
  a.room.send('hit', { targetId: b.state.id, damage: 999999 }); a.room.send('position', { id: a.state.id, x: 1e12, y: 1e12, z: 1e12 });
  await wait(150); assert.equal(b.state.world!.self.hp, 1000); assert.ok(running.room.game.pilots.get(a.state.id!)!.position.distanceTo(start) < 100);
  running.server.simulateLatency(180);
  a.room.send('input', { epoch: a.state.world!.self.epoch, inputs: [6, 7, 8, 9, 10].map(seq => ({ ...idleInput(seq), z: 1 })) });
  await until(() => a.state.world!.self.seq === 10); running.server.simulateLatency(0);
  a.room.send('chat', { message: 'Integration hello', username: 'forged' });
  await until(() => b.state.events.some(e => e.type === 'chat')); assert.equal(b.state.events.find(e => e.type === 'chat')!.data.username, 'A');
  a.room.send('voice', { targetId: b.state.id, senderId: 'forged', signal: { type: 'candidate', candidate: {} } });
  await until(() => b.state.events.some(e => e.type === 'voice')); assert.equal(b.state.events.find(e => e.type === 'voice')!.data.senderId, a.state.id);
  const oldEpoch = a.state.world!.self.epoch;
  a.room.connection.close(4010, 'Local reconnection test');
  await until(() => (a.state.world?.self.epoch ?? 0) > oldEpoch, 15000);
  assert.equal(a.state.world!.self.id, a.state.id); assert.equal(running.room.game.pilots.size, 2);
  for (let i = 2; i < capacity; i += 10) await Promise.all(Array.from({ length: Math.min(10, capacity - i) }, (_, n) => join(`Load${i + n}`)));
  await until(() => running.room.game.pilots.size === capacity);
  await assert.rejects(() => new Client(endpoint).joinById(NET.roomId, { version: NET.version, username: 'Overflow' }));
  assert.equal(running.room.game.systems.size, 1);
  await until(() => running.room.game.pilots.get(a.state.id!)!.seen.size === capacity - 1);
  const result = { passed: true, checks: ['real WebSocket join', 'same universe visibility', '50Hz wall-clock', 'reverse-proxy prefix', 'private metrics', 'no public room creation', 'origin allowlist',
    'guest ownership', 'message flood closes promptly without a frozen socket', 'input acknowledgement', '180ms simulated RTT', 'forged hits/positions rejected', 'chat', 'nearby voice signalling', 'automatic reconnect', `${capacity} clients and ${capacity + 1}st rejection`], metrics: running.room.metrics() };
  await mkdir('.multiplayer-evidence', { recursive: true }); await writeFile('.multiplayer-evidence/integration.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.race([Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave())), wait(1000)]); await closeProxy(); await running.close();
}
