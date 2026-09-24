import { expect, it } from 'vitest';
import { CruiseNavigator } from '../../src/world/systems/CruiseNavigator';
import { Simulation } from '../../server/Simulation';
import { bodyArrival, SOLAR_SYSTEM, buildSystem, SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';
import { orbitalZones } from '../../src/world/systems/OrbitalSite';
import { SYSTEM_CONFIG } from '../../src/world/systems/SystemConfig';
import type { Triple } from '../../src/world/space/WorldPosition';
import { idleInput } from '../../src/network/shared/Protocol';

it('routes around a blocking sphere while every swept segment stays outside it', () => {
  const navigator = new CruiseNavigator(), obstacle = { position: [0, 0, 0] as Triple, radius: 1000, margin: 150 };
  let position: Triple = [-1200, 0, 0], state = 'moving', detoured = false;
  for (let n = 0; n < 5000 && state === 'moving'; n++) {
    const step = navigator.step(position, [10000, 0, 0], [obstacle], .02);
    const delta = step.position.map((v, i) => v - position[i]), lengthSq = delta.reduce((s, v) => s + v * v, 0);
    const t = lengthSq ? Math.max(0, Math.min(1, -position.reduce((s, v, i) => s + v * delta[i], 0) / lengthSq)) : 0;
    expect(Math.hypot(...position.map((v, i) => v + t * delta[i]))).toBeGreaterThan(1150);
    position = step.position; state = step.state; detoured ||= step.avoiding;
  }
  expect(state).toBe('arrived'); expect(detoured).toBe(true); expect(position).toEqual([10000, 0, 0]);
});

it('does not escape through an enclosing obstacle or an unsafe destination', () => {
  const obstacle = { position: [0, 0, 0] as Triple, radius: 1000, margin: 150 };
  for (const [start, end] of [[[0, 0, 0], [10000, 0, 0]], [[10000, 0, 0], [0, 0, 0]]] as [Triple, Triple][]) {
    const navigator = new CruiseNavigator(); let position = start, state = 'moving';
    for (let tick = 0; tick < 1000 && state === 'moving'; tick++) {
      const step = navigator.step(position, end, [obstacle], .02); position = step.position; state = step.state;
      if (start[0] !== 0) expect(Math.hypot(...position)).toBeGreaterThan(1150);
    }
    expect(state).toBe('obstructed');
    if (start[0] === 0) expect(position).toEqual(start);
  }
});

it('leaves a saved orbital position inside the safety margin without entering a planet', () => {
  const generated = buildSystem({ ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:1440825', title: 'Proxima Centauri', spectrum: 'M5 V' });
  for (const system of [SOLAR_SYSTEM, generated]) for (const [index, body] of system.bodies.entries()) {
    const target = bodyArrival(system.bodies[(index + 1) % system.bodies.length]);
    const obstacles = [{ position: [0, 0, 0] as Triple, radius: system.starRadius },
      ...system.bodies.map(b => ({ position: b.position, radius: b.radius })),
      ...system.bodies.flatMap(b => orbitalZones(b).map(s => ({ position: s.center, radius: s.bound, margin: 150 })))];
    let position = body.position.map((v, i) => v + (i === 2 ? body.radius + 1800 : 0)) as unknown as Triple;
    const nav = new CruiseNavigator(); let state = 'moving';
    for (let n = 0; n < 8000 && state === 'moving'; n++) {
      const step = nav.step(position, target, obstacles, .05);
      const delta = step.position.map((v, i) => v - position[i]), lengthSq = delta.reduce((sum, v) => sum + v*v, 0);
      for (const obstacle of obstacles) {
        const offset = position.map((v, i) => v - obstacle.position[i]);
        const t = lengthSq ? Math.max(0, Math.min(1, -offset.reduce((sum,v,i)=>sum+v*delta[i],0)/lengthSq)) : 0;
        expect(Math.hypot(...offset.map((v,i)=>v+t*delta[i])), body.name).toBeGreaterThan(obstacle.radius);
      }
      position = step.position; state = step.state;
    }
    expect(state, `${body.name} departure`).toBe('arrived'); expect(position).toEqual(target);
  }
}, 30000);

it('retains a waypoint when movement is held for a turn', () => {
  const nav = new CruiseNavigator(); nav.reset([150, 0, 0]);
  const position: Triple = [0,0,0];
  for (let i = 0; i < 20; i++) expect(nav.step(position, [0,10000,0], [], .1).heading).toEqual([150,0,0]);
});

it('reaches Mars after ordinary manual flight into the previously blocked departure corridor', () => {
  const game = new Simulation(() => null), p = game.add('pilot', 'Pilot');
  for (let seq = 1; seq <= 200; seq++) {
    game.input(p.id, { epoch: p.epoch, inputs: [{ ...idleInput(seq), z: 1, boost: true }] }); game.step();
  }
  for (let seq = 201; seq <= 250; seq++) {
    game.input(p.id, { epoch: p.epoch, inputs: [idleInput(seq)] }); game.step();
  }
  expect(game.action(p.id, 'cruise', { epoch: p.epoch, target: 'sol/mars' })).toBe(true);
  for (let n = 0; n < 3500 && p.cruise; n++) {
    game.step();
    for (const body of SOLAR_SYSTEM.bodies) expect(Math.hypot(...p.position.toArray().map((v, i) => v - body.position[i])))
      .toBeGreaterThan(body.radius + SYSTEM_CONFIG.cruiseMargin);
  }
  // Orbital scenery may change; successful, collision-safe arrival is the contract.
  expect(p.travelStatus).toContain('Destination reached');
  expect(p.position.toArray()).toEqual(bodyArrival(SOLAR_SYSTEM.bodies.find(body => body.id === 'sol/mars')!));
  expect(p.model.velocity.length()).toBe(0);
});

it('server cruise escapes the same safety margin and bounds every automatic turn through arrival', () => {
  const object = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:1440825', title: 'Proxima Centauri', spectrum: 'M5 V' };
  for (const generated of [false, true]) {
    const game = new Simulation(id => id === object.id ? object : null), p = game.add('pilot','Pilot');
    if (generated) {
      game.action(p.id,'warp',{epoch:p.epoch,systemId:object.id});for(let n=0;n<130;n++)game.step();
    }
    const system = generated ? buildSystem(object) : SOLAR_SYSTEM, start = system.bodies[generated ? 0 : 2];
    const target = system.bodies[generated ? 3 : 6];
    p.position.fromArray(start.position).z += start.radius+1800;
    const before = p.quaternion.clone();
    expect(game.action(p.id,'cruise',{epoch:p.epoch,target:target.id})).toBe(true);
    expect(p.quaternion.angleTo(before)).toBeLessThan(1e-6);
    for(let n=0;n<10000 && p.cruise;n++) {
      before.copy(p.quaternion);game.step();
      expect(p.quaternion.angleTo(before)).toBeLessThan(.02401);
    }
    expect(p.travelStatus).toContain('Destination reached');expect(p.position.toArray()).toEqual(bodyArrival(target));
  }
},30000);
