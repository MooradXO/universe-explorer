import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addLocal, relativePosition, worldPosition } from '../../src/world/space/WorldPosition';
import { FloatingOrigin } from '../../src/world/space/FloatingOrigin';
import { createSectorManifest, type SectorManifest } from '../../src/world/space/SectorManifest';
import { SectorStream } from '../../src/world/space/SectorStream';
import { createPlanetCatalog } from '../../src/world/celestial/PlanetCatalog';
import { shiftSceneOrigin } from '../../src/world/space/shiftSceneOrigin';

describe('sector coordinates and floating origin', () => {
  it('normalizes both sides of centered boundaries, including multiple cells', () => {
    expect(worldPosition([0, 0, 0], [25000, -25000, -25000.125])).toEqual({ sector: [1, 0, -1], offset: [-25000, -25000, 24999.875] });
    expect(worldPosition([2, -2, 0], [125001.25, -125001.5, -0])).toEqual({ sector: [5, -5, 0], offset: [-24998.75, 24998.5, 0] });
    expect(() => worldPosition([Number.MAX_SAFE_INTEGER, 0, 0], [50000, 0, 0])).toThrow();
    expect(() => worldPosition([0, 0, 0], [Infinity, 0, 0])).toThrow();
  });

  it('retains fractional movement at very large cell coordinates without multiplying them into floats', () => {
    const position = worldPosition([1_000_000_000_000, -1_000_000_000_000, 4], [0.125, 0.25, 24999.75]);
    const moved = addLocal(position, [0.125, -0.125, 0.5]);
    expect(moved).toEqual({ sector: [1_000_000_000_000, -1_000_000_000_000, 5], offset: [0.25, 0.125, -24999.75] });
    expect(relativePosition(moved, position)).toEqual([0.125, -0.125, 0.5]);
    const frame = new FloatingOrigin(); frame.moveTo(position);
    expect(frame.toWorld([0.125, -0.125, 0.5])).toEqual(moved);
  });

  it('shifts scene roots and camera once while preserving relative geometry and authoritative position', () => {
    const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera();
    const ship = new THREE.Group(); ship.position.set(10001, 7, 40); scene.add(ship);
    camera.position.copy(ship.position).add(new THREE.Vector3(0, 125, 360));
    const root = new THREE.Group(); root.position.set(11000, 0, 0);
    const child = new THREE.Object3D(); child.position.set(25, 4, 8); root.add(child); scene.add(root);
    const light = new THREE.DirectionalLight(); light.position.set(1, 1, 1); scene.add(light);
    const rebuilt = new THREE.Group(); scene.add(rebuilt);
    const before = child.getWorldPosition(new THREE.Vector3()).sub(ship.position);
    const frame = new FloatingOrigin(); const global = frame.toWorld(ship.position.toArray());
    const delta = frame.recenter(ship.position.toArray())!;
    shiftSceneOrigin(scene, camera, new THREE.Vector3(...delta), [rebuilt]);
    expect(frame.toWorld(ship.position.toArray())).toEqual(global);
    expect(child.getWorldPosition(new THREE.Vector3()).sub(ship.position)).toEqual(before);
    expect(camera.position.clone().sub(ship.position).toArray()).toEqual([0, 125, 360]);
    expect(child.position.toArray()).toEqual([25, 4, 8]);
    expect(light.position.toArray()).toEqual([1, 1, 1]);
    expect(rebuilt.position.toArray()).toEqual([0, 0, 0]);
    expect(frame.recenter([9999, 0, 0])).toBeNull();
  });
});

describe('deterministic sector manifests', () => {
  it('preserves home v1 and generates frontier cells independently of load order', () => {
    expect(createSectorManifest([0, 0, 0]).planets).toEqual(createPlanetCatalog(50000));
    const first = createSectorManifest([-18, 4, 1]);
    createSectorManifest([1000000, 1000000, 1000000]);
    expect(createSectorManifest([-18, 4, 1])).toEqual(first);
    expect(first.planets).toHaveLength(6);
    expect(first.stars).toHaveLength(32);
    expect(createSectorManifest([-18, 4, 2])).not.toEqual(first);
    expect(first.planets.every((planet) => planet.planetId.startsWith('-18,4,1/'))).toBe(true);
  });

  it('bounds concurrent work, rejects stale results and does not resurrect disposed caches', async () => {
    const jobs: { resolve: (manifest: SectorManifest) => void; manifest: SectorManifest }[] = [];
    const stream = new SectorStream((cell) => new Promise((resolve) => jobs.push({ resolve, manifest: createSectorManifest(cell) })));
    stream.update([0, 0, 0]);
    expect(jobs).toHaveLength(2);
    stream.update([100, -100, 10]);
    expect(stream.snapshot().cached).toBe(0);
    jobs.splice(0).forEach(({ resolve, manifest }) => resolve(manifest));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stream.snapshot().discarded).toBe(2);
    expect(stream.snapshot().pending).toBe(2);
    expect(stream.snapshot().cached).toBe(0);
    stream.dispose();
    jobs.splice(0).forEach(({ resolve, manifest }) => resolve(manifest));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stream.snapshot().cached).toBe(0);
    expect(jobs).toHaveLength(0);
  });

  it('keeps at most 125 manifests through repeated travel and regenerates identical returns', async () => {
    const stream = new SectorStream(async (cell) => createSectorManifest(cell));
    const home = stream.manifests.get('0,0,0');
    for (const cell of [[0, 0, 0], [5, -8, 3], [-100, 1, 0], [0, 0, 0]] as const) {
      stream.update(cell);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(stream.snapshot().cached).toBe(125);
      expect(stream.visible(cell)).toHaveLength(27);
      expect(stream.snapshot().pending).toBe(0);
    }
    expect(stream.manifests.get('0,0,0')).toEqual(home);
    stream.dispose();
  });

  it('records failed workers without an unbounded retry loop', async () => {
    let requests = 0;
    const stream = new SectorStream(async () => { requests++; throw new Error('worker unavailable'); });
    stream.update([0, 0, 0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) stream.update([0, 0, 0]);
    expect(requests).toBe(124);
    expect(stream.snapshot()).toMatchObject({ pending: 0, queued: 0, failed: 124, cached: 1 });
    stream.dispose();
  });
});
