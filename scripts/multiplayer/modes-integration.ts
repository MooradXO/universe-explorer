import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { startServer } from '../../server/index';
import { NET, type WorldSnapshot } from '../../src/network/shared/Protocol';
import { GENERATOR } from '../../src/world/generation/GeneratorContract';
import { roomForMode, type GameMode } from '../../src/network/shared/GameMode';
import { WorldDecoder } from '../../src/network/shared/WorldCodec';
import { SOLAR_SYSTEM } from '../../src/world/systems/SystemDescriptor';

const endpoint = 'http://127.0.0.1:2584';
const running = await startServer({ port: 2584, store: null, allowBots: true, maxPlayers: 4 });
const rooms: Room[] = [];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 6000) { const start = Date.now(); while (!check()) { assert(Date.now() - start < timeout, 'Condition timed out'); await wait(25); } }
const total = () => [...running.rooms.values()].reduce((n, room) => n + room.game.pilots.size, 0);
async function join(mode: GameMode, token?: string) {
  const room = await new Client(endpoint).joinById(roomForMode(mode), { version: NET.version, generator: GENERATOR, mode, username: mode, token }); rooms.push(room);
  room.reconnection.minUptime = 0;
  const decoder = new WorldDecoder();
  const state: { id?: string; token?: string; mode?: string; world?: WorldSnapshot; visible: Set<string>; events: string[] } = { visible: new Set(), events: [] };
  room.onReconnect(() => decoder.reset());
  room.onMessage('*', (type, data) => {
    if (type === 'welcome') { state.id = data.id; state.token = data.token; state.mode = data.mode; }
    else if (type === 'arrival') { decoder.reset(); state.visible.clear(); }
    else if (type === 'world') { state.world = decoder.decode(data); for (const e of state.world.entities) state.visible.add(e.id); for (const id of state.world.gone) state.visible.delete(id); }
    else state.events.push(String(type));
  });
  await until(() => !!state.world && !!state.id); assert.equal(state.mode, mode); return { room, state };
}
try {
  const e = await join('exploration'), friend = await join('exploration'), p = await join('pvp'), opponent = await join('pvp');
  const peaceful = running.rooms.get('exploration')!.game, combat = running.room.game;
  await until(() => e.state.visible.has(friend.state.id!) && p.state.visible.has(opponent.state.id!));
  assert(!e.state.visible.has(p.state.id!)); assert(!p.state.visible.has(e.state.id!));
  await assert.rejects(() => join('exploration')); await assert.rejects(() => join('pvp'));
  await assert.rejects(() => new Client(endpoint).joinById(roomForMode('exploration'), { version: NET.version, generator: GENERATOR, mode: 'pvp' }));
  assert.equal(total(), 4);
  e.room.send('chat', { message: 'Peaceful hello' });
  e.room.send('voice', { targetId: friend.state.id, signal: { type: 'candidate', candidate: {} } });
  e.room.send('voice', { targetId: p.state.id, signal: { type: 'candidate', candidate: {} } });
  await until(() => friend.state.events.includes('chat') && friend.state.events.includes('voice'));
  for (const weapon of ['laser', 'shotgun', 'missile']) e.room.send('fire', { epoch: e.state.world!.self.epoch, weapon, mode: 'pvp' });
  e.room.send('bots', { epoch: e.state.world!.self.epoch }); e.room.send('hit', { targetId: friend.state.id, damage: 999999 });
  await wait(350);
  assert(!p.state.events.includes('chat')); assert(!p.state.events.includes('voice'));
  assert.equal(peaceful.shots.size, 0); assert.equal(peaceful.fired, 0); assert.equal(peaceful.hits, 0);
  assert.equal(peaceful.rejectedByReason['peaceful-mode'], 4);
  assert.equal(friend.state.world!.self.shield, 1000);
  assert([...peaceful.systems.values()].every(system => system.bots.entities.size === 0));
  const a = combat.pilots.get(p.state.id!)!, b = combat.pilots.get(opponent.state.id!)!;
  a.quaternion.identity(); b.position.copy(a.position); b.position.z -= 550; a.model.resetMotion(); b.model.resetMotion();
  combat.announce(a); combat.announce(b);
  p.room.send('fire', { epoch: a.epoch, weapon: 'laser' }); await until(() => opponent.state.world!.self.shield < 1000);
  assert(combat.hits > 0);
  e.room.send('cruise', { epoch: e.state.world!.self.epoch, target: SOLAR_SYSTEM.bodies[0].id });
  await until(() => !!e.state.world!.self.cruise); e.room.send('stop', { epoch: e.state.world!.self.epoch }); await until(() => !e.state.world!.self.cruise);
  const epoch = e.state.world!.self.epoch; e.room.connection.close(4010, 'Local mode reconnect check');
  await until(() => e.state.world!.self.epoch > epoch, 15000); assert.equal(total(), 4); assert.equal(e.state.mode, 'exploration');
  const saved = [...e.state.world!.self.flight.p], token = e.state.token;
  await e.room.leave(); await until(() => total() === 3);
  const switched = await join('pvp', token); assert.equal(switched.state.id, e.state.id); assert.equal(switched.state.world!.self.hp, 1000);
  const switchedPilot = combat.pilots.get(switched.state.id!)!; switchedPilot.hp = 321; switchedPilot.position.x += 6000;
  await switched.room.leave(); await until(() => total() === 3);
  const restored = await join('exploration', token); assert.equal(restored.state.world!.self.hp, 1000);
  restored.state.world!.self.flight.p.forEach((value, i) => assert(Math.abs(value - saved[i]) < .11));
  await assert.rejects(() => join('pvp', token)); assert(peaceful.pilots.has(restored.state.id!));
  await opponent.room.leave(); await until(() => total() === 3);
  const race = await Promise.allSettled([join('pvp'), join('exploration')]);
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1); assert.equal(total(), 4);
  for (const room of rooms.filter(room => room.connection.isOpen)) await room.leave();
  await until(() => total() === 0);
  console.log(JSON.stringify({ passed: true, checks: ['same-mode ships visible', 'cross-mode ships hidden', 'chat and voice isolated', 'server denies all peaceful weapons and hostile bots', 'PvP damage', 'peaceful cruise', 'mode preserved after reconnect', 'distinct mode saves', 'duplicate identity retained after rejected join', 'shared cap including simultaneous joins', 'all seats released'] }));
} finally { await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave())); await running.close(); }
