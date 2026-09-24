import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { faceFlightDirection, levelFlightDirection, steerFlightDirection } from '../../src/world/systems/FlightOrientation';
import { Simulation } from '../../server/Simulation';
import { SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';

it('keeps automatic flight upright in all quadrants, including vertical headings', () => {
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (!x && !y && !z) continue;
    const direction = new Vector3(x, y, z).normalize(), q = new Quaternion();
    faceFlightDirection(q, direction);
    expect(new Vector3(0, 0, -1).applyQuaternion(q).distanceTo(direction)).toBeLessThan(1e-7);
    expect(q.toArray().every(Number.isFinite)).toBe(true);
    if (x || z) expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(q).y)).toBeLessThan(1e-7);
    const rolled = q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.1));
    levelFlightDirection(rolled); expect(rolled.angleTo(q)).toBeLessThan(1e-7);
  }
});

it('server warp removes roll while preserving heading and keeps it stable until arrival', () => {
  const object = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:22', title: 'Fixture' };
  const game = new Simulation(id => id === object.id ? object : null), p = game.add('pilot', 'Pilot');
  const direction = new Vector3(1, .3, -1).normalize();
  faceFlightDirection(p.quaternion, direction);
  p.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .7));
  expect(game.action(p.id, 'warp', { epoch: p.epoch, systemId: object.id })).toBe(true);
  const charging = p.quaternion.clone();
  expect(new Vector3(0, 0, -1).applyQuaternion(charging).distanceTo(direction)).toBeLessThan(1e-7);
  expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(charging).y)).toBeLessThan(1e-7);
  for (let i = 0; i < 110; i++) { game.step(); expect(p.quaternion.angleTo(charging)).toBeLessThan(1e-7); }
  for (let i = 0; i < 20; i++) game.step();
  expect(p.systemId).toBe(object.id); expect(p.warp).toBeNull();
  expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(p.quaternion).y)).toBeLessThan(1e-7);
});

it('turns through an opposite cruise heading at a bounded rate instead of snapping', () => {
  for (const dt of [1/120, 1/60, .05]) {
    const rotation = new Quaternion(), direction = new Vector3(0,0,1), target = new Quaternion();
    faceFlightDirection(target, direction);
    for (let t = 0; t < 4; t += dt) {
      const before = rotation.clone(); steerFlightDirection(rotation, direction, dt);
      expect(before.angleTo(rotation)).toBeLessThanOrEqual(1.2*dt+1e-6);
    }
    expect(rotation.angleTo(target)).toBeLessThan(1e-6);
  }
});
