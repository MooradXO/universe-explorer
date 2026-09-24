import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { NetworkAttitude } from '../../src/network/NetworkAttitude';
import { createModelInstances } from '../../src/world/ModelInstances';
import { PLAYER_SHIP_VISUAL } from '../../src/world/ShipVisualConfig';

const yaw = (radians: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), radians);

describe('network cruise presentation', () => {
  it.each([20, 30, 60, 120])('smooths 10Hz turns at %i FPS without changing the authoritative pose', fps => {
    const view = new NetworkAttitude(), target = yaw(0); view.reset(target);
    const dt = 1 / fps; let travelled = 0, movingFrames = 0;
    for (let i = 1; i <= fps * 2; i++) {
      target.copy(yaw(Math.floor((i / fps + 1e-8) * 10) / 10 * 1.2));
      const server = target.clone(), before = view.rotation.clone();
      view.update(target, dt, true);
      const step = view.rotation.angleTo(before); travelled += step; if (step > 1e-5) movingFrames++;
      expect(step).toBeLessThanOrEqual(1.2 * dt + 1e-7);
      expect(target.equals(server)).toBe(true);
    }
    expect(travelled).toBeGreaterThan(2.25);
    expect(movingFrames).toBeGreaterThan(fps * 1.7);
    expect(view.rotation.angleTo(target)).toBeLessThanOrEqual(.121);
  });

  it('handles left/right reversals and equivalent quaternion signs on the short arc', () => {
    const view = new NetworkAttitude(); view.reset(yaw(3.1));
    const target = yaw(-3.1), before = view.rotation.clone();
    view.update(new Quaternion(-target.x, -target.y, -target.z, -target.w), 1 / 60, true);
    expect(before.angleTo(view.rotation)).toBeCloseTo(.02, 6);
    for (const angle of [-2.8, 2.8, -2.9, 2.9]) {
      const prior = view.rotation.clone(); view.update(yaw(angle), 1 / 30, true);
      expect(prior.angleTo(view.rotation)).toBeLessThanOrEqual(.0400001);
    }
  });

  it('preserves continuity when cruise stops while applying manual turns immediately', () => {
    const view = new NetworkAttitude(); view.reset(yaw(0));view.update(yaw(.12), 1 / 60, true);
    const before = view.rotation.clone();view.update(yaw(.12), 0, false);
    expect(view.rotation.angleTo(before)).toBeLessThan(1e-7);
    view.update(yaw(.42), 0, false);
    expect(before.angleTo(view.rotation)).toBeCloseTo(.3, 6);
    for (let i = 0; i < 60; i++) view.update(yaw(.42), 1 / 60, false);
    expect(view.rotation.angleTo(yaw(.42))).toBeLessThan(1e-5);
    view.reset(yaw(-2));view.update(yaw(-2), 1 / 60, false);
    expect(view.rotation.angleTo(yaw(-2))).toBeLessThan(1e-7);
  });
});

describe('remote model transforms', () => {
  it('preserves nested GLB transforms while excluding world/instance transforms', () => {
    const root = new Group(), parent = new Group(), source = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial());
    parent.position.set(3, -5, 7);parent.scale.setScalar(100);parent.rotation.z = .3;
    source.position.set(.1, .2, .3);parent.add(source);root.add(parent);
    root.position.set(1e6, 2e6, -3e6);root.scale.setScalar(28);root.rotation.y = Math.PI;
    const original = Array.from(source.geometry.getAttribute('position').array);
    const instances = createModelInstances(root, 4)!;
    const relative = new Matrix4().copy(root.matrixWorld).invert().multiply(source.matrixWorld);
    const expected = source.geometry.clone().applyMatrix4(relative);expected.computeBoundingBox();
    expect(instances.geometry.boundingBox!.min.distanceTo(expected.boundingBox!.min)).toBeLessThan(1e-6);
    expect(instances.geometry.boundingBox!.max.distanceTo(expected.boundingBox!.max)).toBeLessThan(1e-6);
    expect(Array.from(source.geometry.getAttribute('position').array)).toEqual(original);
    expect(instances.geometry).not.toBe(source.geometry);
    instances.geometry.dispose();expected.dispose();source.geometry.dispose();
  });

  it('retains the actual player GLB node scale and matches the local ship size', () => {
    const bytes = readFileSync('public/models/player_ship.glb');
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const node = gltf.nodes.find((n: any) => n.mesh !== undefined);
    const position = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
    const bounds = new Box3(new Vector3().fromArray(position.min), new Vector3().fromArray(position.max));
    const size = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
    const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z), new MeshBasicMaterial());
    mesh.scale.fromArray(node.scale);const root = new Group();root.add(mesh);
    root.scale.setScalar(PLAYER_SHIP_VISUAL.scale);root.rotation.set(...PLAYER_SHIP_VISUAL.rotation);
    const expected = new Box3().setFromObject(root).getSize(new Vector3());
    const instances = createModelInstances(root, 4)!;
    const actual = instances.geometry.boundingBox!.getSize(new Vector3()).multiplyScalar(PLAYER_SHIP_VISUAL.scale);
    expect(actual.distanceTo(expected)).toBeLessThan(1e-4);
    expect(actual.x).toBeGreaterThan(200);expect(actual.x).toBeLessThan(210);
    instances.geometry.dispose();mesh.geometry.dispose();
  });
});
