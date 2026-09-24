import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Simulation, segmentSphere, type Pilot } from '../../server/Simulation';
import { GuestStore } from '../../server/GuestStore';
import { WorldEncoder, WorldDecoder } from '../../src/network/shared/WorldCodec';
import { FlightModel } from '../../src/network/shared/FlightModel';
import { idleInput, NET, validInput, type WorldSnapshot } from '../../src/network/shared/Protocol';
import { SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';

const other = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:2', title: 'Test star', position: [1, 2, 3] as [number, number, number], distance: Math.sqrt(14), spectrum: 'M5' };
const make = () => { const events: { id: string; type: string; data: any }[] = []; const game = new Simulation(id => id === other.id ? other : null, (id, type, data) => events.push({ id, type, data })); return { game, events }; };
const advance = (game: Simulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * NET.tickHz); i++) game.step(); };
const action = (game: Simulation, p: Pilot, type: string, data: Record<string, unknown> = {}) => game.action(p.id, type, { epoch: p.epoch, ...data });
function lineUp(game: Simulation) {
  const a = game.add('a', 'A'), b = game.add('b', 'B'); a.quaternion.identity(); b.position.copy(a.position).add(new Vector3(0, 0, -800));
  game.step(); return { a, b };
}

describe('authoritative universe', () => {
  it('validates finite, bounded inputs and strictly increasing sequence numbers', () => {
    expect(validInput({ ...idleInput(1), yaw: NaN })).toBe(false); expect(validInput({ ...idleInput(1), z: 2 })).toBe(false);
    const { game } = make(), p = game.add('a', 'A'), initial = p.position.clone();
    expect(game.input('a', { epoch: p.epoch, inputs: [{ ...idleInput(1), z: 1 }] })).toBe(true);
    expect(game.input('a', { epoch: p.epoch, inputs: [{ ...idleInput(1), z: 1 }] })).toBe(false);
    expect(game.input('a', { epoch: p.epoch - 1, inputs: [idleInput(2)] })).toBe(false);
    game.step(); expect(p.position.distanceTo(initial)).toBeGreaterThan(0); expect(p.seq).toBe(1);
  });
  it('matches shared prediction exactly and cannot consume faster than server time', () => {
    const { game } = make(), p = game.add('a', 'A'), predicted = new FlightModel(); predicted.restore(p.model.snapshot());
    for (let seq = 1; seq <= 100; seq++) {
      const input = { ...idleInput(seq), z: 1, yaw: .2, boost: true };
      expect(game.input(p.id, { epoch: p.epoch, inputs: [input] })).toBe(true); game.step(); predicted.step(input, .02);
    }
    expect(p.position.distanceTo(predicted.position)).toBeLessThan(1e-8);
    for (let batch = 0; batch < 3; batch++) game.input(p.id, { epoch: p.epoch, inputs: Array.from({ length: 5 }, (_, i) => ({ ...idleInput(101 + batch * 5 + i), z: 1 })) });
    expect(game.input(p.id, { epoch: p.epoch, inputs: [idleInput(116)] })).toBe(false);
    expect(p.epoch).toBe(2); expect(game.input(p.id, { epoch: p.epoch, inputs: [idleInput(1)] })).toBe(true);
    game.step(); expect(p.seq).toBe(1); expect(p.model.velocity.length()).toBeLessThan(1760);
  });
  it('never accepts browser positions, identities, hits, deaths or bounty', () => {
    const { game } = make(), p = game.add('a', 'A'), initial = p.position.clone();
    for (const type of ['position', 'hit', 'die', 'identity', 'bounty']) expect(action(game, p, type, { id: 'victim', position: [9e15, 0, 0], damage: 1e9, bounty: 1e9 })).toBe(false);
    expect(p.position.equals(initial)).toBe(true); expect(p.hp).toBe(1000); expect(p.bounty).toBe(50000);
  });
  it('enforces server cooldown and projectile damage using swept collision', () => {
    const { game } = make(), { a, b } = lineUp(game);
    expect(action(game, a, 'fire', { weapon: 'laser', damage: 1e9 })).toBe(true);
    expect(action(game, a, 'fire', { weapon: 'laser' })).toBe(false);
    advance(game, .3); expect(b.shield).toBe(980); expect(b.hp).toBe(1000); expect(game.hits).toBe(1);
    expect(segmentSphere(new Vector3(0, 0, 0), new Vector3(0, 0, -1000), new Vector3(0, 0, -500), 40)).toBeCloseTo(.46);
  });
  it('handles all weapons, deaths, bounty and timed respawn exactly once', () => {
    const { game, events } = make(), { a, b } = lineUp(game); b.hp = 20; b.shield = 0; b.regenAt = 100;
    action(game, a, 'fire', { weapon: 'laser' }); advance(game, .3);
    expect(b.dead).toBe(true); expect(a.bounty).toBe(75000); expect(b.bounty).toBe(100);
    expect(events.filter(e => e.type === 'die' && e.id === a.id)).toHaveLength(1);
    advance(game, 5); expect(b.dead).toBe(false); expect(b.hp).toBe(1000); expect(b.shield).toBe(1000);
    action(game, a, 'fire', { weapon: 'shotgun' }); expect(game.shots.size).toBe(3);
    advance(game, .7); expect(action(game, a, 'fire', { weapon: 'missile' })).toBe(true);
    expect([...game.shots.values()].some(s => s.weapon === 'missile')).toBe(true);
  });
  it('isolates systems and bounds visibility while retaining stationary entities', () => {
    const { game } = make(), a = game.add('a', 'A'), b = game.add('b', 'B'); game.step();
    let snapshot = game.snapshot(a); expect(snapshot.entities.map(e => e.id)).toEqual(['b']);
    snapshot = game.snapshot(a); expect(snapshot.entities).toEqual([]); expect(snapshot.gone).toEqual([]);
    b.position.x += 19000; snapshot = game.snapshot(a); expect(snapshot.gone).toEqual(['b']);
    b.position.copy(a.position); b.systemId = other.id; action(game, a, 'warp', { systemId: other.id });
    advance(game, 2.5); expect(a.systemId).toBe(other.id); expect(game.systems.size).toBe(2);
    b.systemId = SOLAR_CATALOG_OBJECT.id; game.step(); expect(game.snapshot(a).gone).not.toContain(a.id);
    expect(game.snapshot(a).entities.every(e => e.id !== b.id)).toBe(true);
  });
  it('warps only to server catalogue destinations, rejects stale inputs, and returns to base', () => {
    const { game, events } = make(), p = game.add('a', 'A');
    expect(action(game, p, 'warp', { systemId: 'made-up', object: other })).toBe(false);
    expect(game.self(p).travelStatus).toContain('unavailable'); expect(p.warp).toBeNull();
    expect(action(game, p, 'warp', { systemId: other.id, position: [1e12, 0, 0] })).toBe(true); const epoch = p.epoch;
    advance(game, 2.5); expect(p.systemId).toBe(other.id); expect(p.epoch).toBe(epoch + 1);
    expect(game.input(p.id, { epoch, inputs: [idleInput(1)] })).toBe(false);
    expect(events.some(e => e.type === 'arrival' && e.data.object.id === other.id)).toBe(true);
    advance(game, 3); expect(action(game, p, 'base')).toBe(true); advance(game, 2.5); expect(p.systemId).toBe(SOLAR_CATALOG_OBJECT.id);
  });
  it('runs cruise, stops on input/fire/damage and keeps projectile speeds bounded', () => {
    const { game } = make(), p = game.add('a', 'A');
    expect(action(game, p, 'cruise', { target: 'sol/mars' })).toBe(true); advance(game, 2);
    expect(p.cruise).toBe('sol/mars'); expect(action(game, p, 'stop')).toBe(true); expect(p.cruise).toBeNull();
    action(game, p, 'fire', { weapon: 'laser' }); expect([...game.shots.values()][0].velocity.length()).toBeLessThanOrEqual(4000 + 1e-8);
    expect(action(game, p, 'cruise', { target: 'forged-planet' })).toBe(false);
  });
  it('damage interrupts warp and cruise, including shield hits', () => {
    const { game } = make(), { a, b } = lineUp(game);
    action(game, b, 'warp', { systemId: other.id }); action(game, a, 'fire', { weapon: 'laser' }); advance(game, .4);
    expect(b.warp).toBeNull(); expect(b.systemId).toBe(SOLAR_CATALOG_OBJECT.id);
  });
  it('allows 100 players in a single system and rejects the 101st', () => {
    const { game } = make(); for (let i = 0; i < 100; i++) game.add(`p${i}`, `Pilot${i}`);
    game.step(); expect(game.snapshot(game.pilots.get('p0')!).entities).toHaveLength(99);
    expect(() => game.add('overflow', 'Overflow')).toThrow(); expect(game.systems.size).toBe(1);
  });
  it('keeps dropped pilots vulnerable and resets epoch on reconnect', () => {
    const { game } = make(), { a, b } = lineUp(game), epoch = b.epoch;
    game.drop(b.id); action(game, a, 'fire', { weapon: 'laser' }); advance(game, .3); expect(b.shield).toBe(980);
    game.reconnect(b.id); expect(b.epoch).toBe(epoch + 1); expect(b.connected).toBe(true); expect(b.shield).toBe(980);
  });
  it('routes global chat and only nearby voice/sonar, never client-supplied sender IDs', () => {
    const { game, events } = make(), a = game.add('a', 'A'), b = game.add('b', 'B');
    action(game, a, 'voice', { targetId: b.id, senderId: 'forged', signal: { type: 'candidate', candidate: {} } });
    expect(events.at(-1)?.data.senderId).toBe('a'); expect(events.at(-1)?.id).toBe('b');
    b.position.x += 4000; expect(action(game, a, 'voice', { targetId: b.id, signal: { type: 'offer' } })).toBe(false);
    b.systemId = other.id; expect(action(game, a, 'chat', { username: 'forged', message: 'Hello' })).toBe(true);
    expect(events.at(-1)?.data).toEqual({ username: 'A', message: 'Hello' });
    expect(action(game, a, 'chat', { message: 'x'.repeat(281) })).toBe(false);
    expect(action(game, a, 'sonar')).toBe(true); expect(action(game, a, 'sonar')).toBe(false);
  });
  it('server validates existing hangar repair costs and location', () => {
    const { game } = make(), p = game.add('a', 'A'); p.hp = 500;
    expect(action(game, p, 'repair', { item: 'hull' })).toBe(true); expect(p.hp).toBe(1000); expect(p.bounty).toBe(49920);
    p.subsystems.engines = 20; expect(action(game, p, 'repair', { item: 'systems' })).toBe(true); expect(p.subsystems.engines).toBe(100);
    p.hp = 500; p.position.x += 2000; expect(action(game, p, 'repair', { item: 'hull' })).toBe(false);
  });
  it('spawns one shared, bounded bot population', () => {
    const { game } = make(), a = game.add('a', 'A'), b = game.add('b', 'B');
    expect(action(game, a, 'bots')).toBe(true); expect(action(game, b, 'bots')).toBe(false); advance(game, .2);
    expect(game.systems.get(a.systemId)!.bots.entities.size).toBe(100);
    const data: WorldSnapshot = game.snapshot(a); expect(data.entities.some(e => e.id.startsWith('bot_')) || a.seen.size > 1).toBe(true);
  });
});

it('guest identity and saves cannot be forged by knowing a player ID', () => {
  const store = new GuestStore(), first = store.identity(null), { game } = make(), p = game.add(first.id, 'A');
  p.position.x += 150; store.save(first.token, game.self(p));
  expect(store.identity(first.token).state?.flight.p[0]).toBe(p.position.x);
  expect(store.identity(first.id).id).not.toBe(first.id);
});

it('compact snapshots preserve identities, positions, hits, projectile owners and removals across AOI changes', () => {
  const encoder = new WorldEncoder(), decoder = new WorldDecoder(), { game, events } = make(), { a, b } = lineUp(game);
  const first = decoder.decode(encoder.encode(game.snapshot(a)));
  expect(first.entities[0].id).toBe(b.id); expect(first.entities[0].name).toBe('B');
  first.entities[0].p.forEach((n, i) => expect(Math.abs(n - b.position.toArray()[i])).toBeLessThanOrEqual(.051));
  action(game, a, 'fire', { weapon: 'laser' });
  const shot = decoder.decode(encoder.encode(game.snapshot(a))).shots[0]; expect(shot.owner).toBe(a.id);
  advance(game, .3);
  const updates = events.filter(e => e.id === a.id && e.type === 'world').map(e => decoder.decode(encoder.encode(e.data)));
  expect(updates.flatMap(e => e.shotGone)).toContain(shot.id);
  b.position.x += 20000; game.step(); const gone = decoder.decode(encoder.encode(game.snapshot(a))); expect(gone.gone).toContain(b.id);
  b.position.copy(a.position); game.step(); expect(decoder.decode(encoder.encode(game.snapshot(a))).entities[0].id).toBe(b.id);
});
