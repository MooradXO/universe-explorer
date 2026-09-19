import { expect, it } from 'vitest';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { EpicFX } from '../../src/vendor/epic-fx/epic-fx';
import { EpicEffectSpace } from '../../src/world/visuals/EpicEffectSpace';

it('simulates preset units unchanged across scaling, rotation and floating origin, restoring the render hierarchy', () => {
  const scene = new Scene(), space = new EpicEffectSpace(260), camera = new PerspectiveCamera();
  space.anchor.position.set(50000, -20000, 14000); space.anchor.rotation.y = .8; scene.add(space.anchor);
  camera.position.copy(space.anchor.position).add(new Vector3(300, 80, 500)); camera.rotation.y = -.4;
  const samples: number[][] = [], group = new Group(); space.anchor.add(group);
  const effect = { group, update: (_dt: number, eye: PerspectiveCamera) => {
    expect(group.parent).toBe(null); expect(group.position.toArray()).toEqual([0, 0, 0]);
    group.updateMatrixWorld(true); expect(group.matrixWorld.elements[12]).toBe(0);
    samples.push([...eye.position.toArray(), ...eye.quaternion.toArray()]);
  } } as unknown as EpicFX;
  space.update(effect, .016, camera); expect(group.parent).toBe(space.anchor);
  const shift = new Vector3(50000, -20000, 10000); camera.position.sub(shift); space.anchor.position.sub(shift);
  space.update(effect, .016, camera); expect(group.parent).toBe(space.anchor);
  samples[1].forEach((value, index) => expect(value).toBeCloseTo(samples[0][index], 9));
});
