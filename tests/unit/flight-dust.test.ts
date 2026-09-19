import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FlightDust } from '../../src/world/visuals/FlightDust';

for (const low of [false, true]) {
  it(`dust follows actual translation, survives origin shifts and resets without warp trails (${low ? 'LOW' : 'HIGH'})`, () => {
    const dust = new FlightDust(low), position = new Vector3(12, 5, -30);
    dust.reset(position); dust.update(.016, position, false);
    const idle = dust.snapshot();
    for (let frame = 0; frame < 100; frame++) dust.update(.016, position, false);
    expect(dust.snapshot().sample).toEqual(idle.sample); expect(dust.snapshot().speed).toBe(0);
    // Rotation has no input to this class: only world-space position translates grains.
    const offset = new Vector3(8, -3, -12); position.add(offset); dust.update(.02, position, false);
    const moved = dust.snapshot();
    for (let axis = 0; axis < 3; axis++) expect(moved.sample[axis]).toBeCloseTo(idle.sample[axis] - offset.getComponent(axis), 3);
    position.sub(offset); dust.update(.02, position, false);
    for (let axis = 0; axis < 3; axis++) expect(dust.snapshot().sample[axis]).toBeCloseTo(idle.sample[axis], 3);
    const shift = new Vector3(50000, -100000, 50000); position.sub(shift); dust.shiftOrigin(shift);
    const beforeShift = dust.snapshot().sample; dust.update(.016, position, false);
    expect(dust.snapshot().speed).toBe(0); expect(dust.snapshot().sample).toEqual(beforeShift);
    position.add(new Vector3(3e8, -1e8, 2e8)); dust.update(.05, position, false);
    expect(dust.snapshot().maxOffset).toBeLessThanOrEqual(620);
    dust.update(.05, position, true); expect(dust.snapshot().visible).toBe(false);
    position.set(0, 0, 0); dust.reset(position); dust.update(.016, position, false);
    expect(dust.snapshot().speed).toBe(0); expect(dust.snapshot().visible).toBe(true);
    expect(dust.snapshot().count).toBe(low ? 420 : 900); dust.dispose();
  });
}
