import { expect, it } from 'vitest';
import { Simulation } from '../../server/Simulation';
import { GuestStore } from '../../server/GuestStore';
import { flightSaveKey } from '../../src/world/systems/FlightSave';
import { roomForMode } from '../../src/network/shared/GameMode';
import { SOLAR_SYSTEM } from '../../src/world/systems/SystemDescriptor';

it('peaceful authority rejects every weapon, hostile bots and forged damage while allowing travel', () => {
  const game = new Simulation(() => null, () => {}, 'exploration');
  const a = game.add('a', 'A'), b = game.add('b', 'B');
  b.position.copy(a.position).add({ x: 0, y: 0, z: -500 });
  for (const weapon of ['laser', 'shotgun', 'missile']) expect(game.action(a.id, 'fire', { epoch: a.epoch, weapon, mode: 'pvp' })).toBe(false);
  for (const type of ['bots', 'hit', 'damage', 'die']) expect(game.action(a.id, type, { epoch: a.epoch, targetId: b.id, damage: 999999 })).toBe(false);
  for (let i = 0; i < 100; i++) game.step();
  expect(game.shots.size).toBe(0); expect(game.hits).toBe(0); expect(b.hp).toBe(1000); expect(b.shield).toBe(1000);
  expect([...game.systems.values()].every(s => s.bots.entities.size === 0)).toBe(true);
  expect(game.action(a.id, 'cruise', { epoch: a.epoch, target: SOLAR_SYSTEM.bodies[0].id })).toBe(true);
});

it('mode saves keep the same guest identity but never restore PvP damage or position into Exploration', () => {
  const store = new GuestStore(), guest = store.identity(null), game = new Simulation(() => null);
  const pilot = game.add(guest.id, 'Pilot'); pilot.hp = 350; pilot.position.x += 900;
  const pvp = game.self(pilot); store.save(guest.token, pvp);
  expect(store.identity(guest.token, 'exploration').id).toBe(guest.id);
  expect(store.identity(guest.token, 'exploration').state).toBeUndefined();
  pilot.hp = 1000; pilot.position.x += 6000;
  const exploration = game.self(pilot); store.save(guest.token, exploration, 'exploration');
  expect(store.identity(guest.token).state).toEqual(pvp);
  expect(store.identity(guest.token, 'exploration').state).toEqual(exploration);
  expect(flightSaveKey(guest.id)).toBe('universe:stellar-flight:v1:guest');
  expect(flightSaveKey(guest.id, 'exploration')).not.toBe(flightSaveKey(guest.id, 'pvp'));
  expect(roomForMode('exploration')).not.toBe(roomForMode('pvp'));
});
