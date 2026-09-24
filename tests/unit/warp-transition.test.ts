import { expect, it, vi } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { WarpTimeline } from '../../src/world/visuals/WarpTimeline';
import { WarpTransition } from '../../src/world/visuals/WarpTransition';

it('waits for acknowledgement and arrival, holds for delayed snapshots, and finishes the exit', () => {
  const warp = new WarpTimeline();
  warp.update(.5, false); expect(warp.phase).toBe('idle');
  warp.update(.3, true); expect(warp.phase).toBe('charge'); expect(warp.intensity).toBeGreaterThan(0);
  warp.update(.4, true); expect(warp.phase).toBe('entry');
  warp.update(1, true); expect(warp.phase).toBe('tunnel');
  warp.update(15, true); expect(warp.phase).toBe('tunnel'); expect(warp.intensity).toBe(1);
  warp.arrive(); expect(warp.phase).toBe('exit');
  warp.update(.3, false); expect(warp.phase).toBe('exit'); expect(warp.aperture).toBeGreaterThan(0);
  warp.update(.7, false); expect(warp.phase).toBe('idle'); expect(warp.intensity).toBe(0);
  warp.arrive(); expect(warp.phase).toBe('idle');
});

it('cancels without an arrival flash and permits a fresh confirmed warp after cancellation', () => {
  const warp = new WarpTimeline(); warp.update(1, true); const intensity = warp.intensity;
  warp.update(.1, false); expect(warp.phase).toBe('cancel'); expect(warp.intensity).toBeLessThan(intensity); expect(warp.aperture).toBe(0);
  warp.update(.2, false); expect(warp.phase).toBe('idle');
  warp.update(.1, true); expect(warp.phase).toBe('charge'); warp.clear(); expect(warp.requested).toBe(false);
});

it('uses one immediately ready bounded mesh in both qualities without rotating the ship', () => {
  for (const low of [false, true]) {
    const warp = new WarpTransition(low), camera = new PerspectiveCamera(75, 16 / 9, 1, 200000);
    const rotation = new Quaternion(), position = new Vector3(1e6, -4e5, 100);
    camera.position.copy(position).add(new Vector3(0, 125, 360)); camera.lookAt(position.clone().add(new Vector3(0, 120, -680)));
    warp.update(1.6, camera, position, rotation, true);
    expect(warp.snapshot().drawCalls).toBe(1); expect(warp.snapshot().streaks).toBe(low ? 140 : 320); expect(warp.snapshot().ready).toBe(true);
    expect(rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(warp.group.children[0].position.distanceTo(camera.position)).toBeCloseTo(900);
    const mesh = warp.group.children[0] as any, dispose = vi.spyOn(mesh.geometry, 'dispose');
    warp.arrive(); warp.update(1, camera, position, rotation, false); expect(warp.snapshot().visible).toBe(false);
    warp.dispose(); expect(dispose).toHaveBeenCalledOnce();
  }
});
