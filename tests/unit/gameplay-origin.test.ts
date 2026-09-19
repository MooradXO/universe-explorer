import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { shiftSceneOrigin } from '../../src/world/space/shiftSceneOrigin';
import { FloatingOrigin } from '../../src/world/space/FloatingOrigin';
import { worldPosition } from '../../src/world/space/WorldPosition';
import type { Engine } from '../../src/core/Engine';
import type { SoundManager } from '../../src/core/SoundManager';
import type { UIManager } from '../../src/ui/UIManager';
import type { MultiplayerManager } from '../../src/network/MultiplayerManager';

vi.mock('../../src/core/Settings', () => ({ Settings: { graphicsMode: 'HIGH' } }));
import { CombatSystem } from '../../src/world/CombatSystem';

it('a live projectile neither sweeps across the old origin nor misses a nested celestial collider', () => {
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera();
  const engine = { scene, camera, shipController: {} } as Engine;
  const combat = new CombatSystem(engine, {} as SoundManager, {} as UIManager,
    { players: new Map() } as MultiplayerManager, new THREE.Texture());
  const explosion = vi.spyOn(combat, 'createExplosionAt').mockImplementation(() => {});
  vi.spyOn(combat, 'createSparksAt').mockImplementation(() => {});
  const laser = combat.createVolumetricLaser(0xff2222, 10, true);
  laser.position.set(10001, 0, 0); scene.add(laser);
  combat.lasers.push({ mesh: laser, velocity: new THREE.Vector3(100, 0, 0), lastPosition: laser.position.clone(), life: 4, ownerId: 'local' });
  const makeTarget = (x: number) => {
    const root = new THREE.Group(); root.position.x = x; scene.add(root);
    const mesh = new THREE.Mesh(); mesh.userData.radius = 5; root.add(mesh); return mesh;
  };
  const distant = makeTarget(15000); const nearby = makeTarget(10100);
  const delta = new THREE.Vector3(10000, 0, 0);
  shiftSceneOrigin(scene, camera, delta, []); combat.shiftOrigin(delta);
  combat.update(0.1, 'local', [distant, nearby], [], null);
  expect(combat.lasers).toHaveLength(1); expect(explosion).not.toHaveBeenCalled();
  combat.update(0.9, 'local', [distant, nearby], [], null);
  expect(combat.lasers).toHaveLength(0); expect(explosion).toHaveBeenCalledTimes(1);
  expect(explosion.mock.calls[0][0].x).toBeCloseTo(100);
});

it('respawn retains the global base after a recenter and a detached ship cannot be revived', async () => {
  vi.stubGlobal('window', { localPlayerBounty: 100, addEventListener: vi.fn(), dispatchEvent: vi.fn() });
  vi.useFakeTimers();
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    const { ShipController } = await import('../../src/core/ShipController');
    const controller = new ShipController(new THREE.PerspectiveCamera());
    const ship = new THREE.Group(); controller.setShip(ship);
    controller.setSpawn(new THREE.Vector3(0, 100, 8300), 1000);
    const frame = new FloatingOrigin();
    const delta = frame.moveTo(worldPosition([1000000, -1000000, 1000000], [0.125, 100.25, 9800.5]));
    controller.shiftOrigin(new THREE.Vector3(...delta)); ship.position.set(0, 0, 0);
    const respawn = vi.fn(); controller.onRespawn = respawn;
    controller.takeDamage(100000); await vi.advanceTimersByTimeAsync(5000);
    expect(frame.toAbsolute(ship.position.toArray())).toEqual([0, 100, 8300]);
    expect(respawn).toHaveBeenCalledTimes(1);
    controller.takeDamage(100000); controller.clearShip();
    const newShip = new THREE.Group(); controller.setShip(newShip);
    await vi.advanceTimersByTimeAsync(5000);
    expect(respawn).toHaveBeenCalledTimes(1);
    expect(newShip.position.toArray()).toEqual([0, 0, 0]);
  } finally { random.mockRestore(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
