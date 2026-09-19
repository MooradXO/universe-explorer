import { expect, it } from 'vitest';
import { keplerPosition } from '../../src/world/systems/KeplerOrbit';
import { SOLAR_SYSTEM, SOLAR_CATALOG_OBJECT, buildSystem, bodyArrival } from '../../src/world/systems/SystemDescriptor';
import { SYSTEM_CONFIG as config } from '../../src/world/systems/SystemConfig';
import { cruiseStep } from '../../src/world/systems/CruiseMotion';
import { flightSaveKey, readFlightSave, systemFromSave } from '../../src/world/systems/FlightSave';
import { stellarAddress } from '../../src/world/space/StellarAddress';
import { worldPosition, type Triple } from '../../src/world/space/WorldPosition';

it('preserves elliptical radial limits and a single scale for all eight Solar planets', () => {
  expect(SOLAR_SYSTEM.bodies).toHaveLength(8);
  for (const body of SOLAR_SYSTEM.bodies) {
    const { semiMajorAu: a, eccentricity: e } = body.orbit;
    expect(Math.hypot(...keplerPosition(body.orbit, 0))).toBeCloseTo(a * (1 - e), 8);
    expect(Math.hypot(...keplerPosition(body.orbit, Math.PI))).toBeCloseTo(a * (1 + e), 8);
    const radial = Math.hypot(...body.position) / config.unitsPerAu;
    expect(radial).toBeGreaterThanOrEqual(a * (1 - e) - 1e-9);
    expect(radial).toBeLessThanOrEqual(a * (1 + e) + 1e-9);
    expect(body.origin).toBe('catalogue');
  }
  expect(SOLAR_SYSTEM.bodies[2].radius * config.kilometersPerUnit).toBe(6371.0084);
  expect(SOLAR_SYSTEM.bodies[7].orbit.semiMajorAu / SOLAR_SYSTEM.bodies[2].orbit.semiMajorAu).toBeCloseTo(30.069844, 4);
});

it('generates stable gameplay planets by catalogue identity with explicit provenance', () => {
  const star = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:1440825', title: 'Proxima Centauri', spectrum: 'M5 Ve' };
  const first = buildSystem(star), repeat = buildSystem(star);
  expect(first).toEqual(repeat);
  expect(first.starRadiusIsIllustrative).toBe(true);
  expect(first.bodies.every(body => body.origin === 'procedural' && body.source === null && body.name.includes('generated'))).toBe(true);
  expect(buildSystem({ ...star, id: 'athyg:4.0:1440826' }).bodies[0].position).not.toEqual(first.bodies[0].position);
});

it('cruises from Earth to Mars without skipping a safety sphere and stops at a bounded arrival', () => {
  const target = bodyArrival(SOLAR_SYSTEM.bodies[3]);
  let current: Triple = bodyArrival(SOLAR_SYSTEM.bodies[2]);
  const obstacles = [{ position: [0, 0, 0] as Triple, radius: SOLAR_SYSTEM.starRadius }, ...SOLAR_SYSTEM.bodies];
  let state = '';
  for (let i = 0; i < 3600; i++) {
    const step = cruiseStep(current, target, obstacles, 1 / 60); current = step.position; state = step.state;
    for (const body of obstacles) expect(Math.hypot(...current.map((v, axis) => v - body.position[axis]))).toBeGreaterThan(body.radius + config.cruiseMargin);
    if (state !== 'moving') break;
  }
  expect(state).toBe('arrived'); expect(current).toEqual(target);
  const blocked = cruiseStep([0, 0, 0], [100000, 0, 0], [{ position: [5000, 0, 0], radius: 2500 }], 100);
  expect(blocked.state).toBe('obstructed'); expect(blocked.position).toEqual([0, 0, 0]);
});

it('saves a system address separately from legacy XYZ, validates rotation, and restores offline', () => {
  const save = { version: 1, address: stellarAddress(SOLAR_SYSTEM.anchor, worldPosition([1, 2, 3], [.125, .25, .5])),
    spectrum: 'G2 V', rotation: [0, 0, 0, 1], visited: ['sol/earth'] };
  const parsed = readFlightSave(JSON.stringify(save))!;
  expect(parsed.address).toEqual(save.address); expect(systemFromSave(parsed)).toEqual(SOLAR_SYSTEM);
  expect(flightSaveKey('guest_123')).toBe(flightSaveKey('guest_456'));
  expect(readFlightSave('{"position_x":12}')).toBeNull();
  expect(readFlightSave(JSON.stringify({ ...save, rotation: [1, 2, 3, 4] }))).toBeNull();
});
