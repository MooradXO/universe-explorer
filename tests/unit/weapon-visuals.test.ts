import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Engine } from '../../src/core/Engine';
import type { SoundManager } from '../../src/core/SoundManager';
import type { UIManager } from '../../src/ui/UIManager';
import type { MultiplayerManager } from '../../src/network/MultiplayerManager';
import type { WorldSnapshot } from '../../src/network/shared/Protocol';
vi.mock('../../src/core/Settings', () => ({ Settings: { graphicsMode: 'HIGH' } }));
import { CombatSystem } from '../../src/world/CombatSystem';

for (const authoritative of [false, true]) for (const viewMode of ['first', 'third']) for (const weapon of ['laser', 'shotgun', 'missile']) {
  it(`${authoritative ? 'network' : 'offline'} ${viewMode} ${weapon} shows only moving projectiles, without a stationary line or muzzle flash`, () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const controller = { activeWeapon: weapon, viewMode, isDead: false, laserColor: 'red', subsystems: { weapons: 100 } };
    const engine = { scene, camera, shipController: controller } as unknown as Engine;
    const multiplayer = { authoritative, action: () => true, broadcastShoot: vi.fn(), toLocal: (p: number[]) => p, players: new Map() } as unknown as MultiplayerManager;
    const combat = new CombatSystem(engine, { playLaser: vi.fn(), playWeapon: vi.fn() } as unknown as SoundManager, {} as UIManager, multiplayer, new THREE.Texture());
    const ship = new THREE.Group();
    combat.shootLaser(ship, 'pilot', new THREE.Vector3());
    if (authoritative) {
      expect(scene.children).toHaveLength(0);
      combat.applyNetworkProjectiles({ self: { id: 'pilot' }, shotGone: [], shots: [{ id: 1, owner: 'pilot', weapon, color: 'red', p: [0, 0, -100], v: [0, 0, -4000], life: 2 }] } as unknown as WorldSnapshot);
    }
    expect(combat.lasers).toHaveLength(authoritative ? 1 : weapon === 'shotgun' ? 3 : 1);
    const projectileMeshes = new Set(combat.lasers.map(shot => shot.mesh));
    expect(scene.children.every(child => projectileMeshes.has(child))).toBe(true);
    const before = combat.lasers.map(shot => shot.mesh.position.clone());
    combat.update(.025, 'pilot', [], [], null);
    combat.lasers.forEach((shot, i) => expect(shot.mesh.position.distanceTo(before[i])).toBeGreaterThan(40));
    combat.cleanup();
  });
}

it('grows a rounded tail behind the collision tip without crossing back through the muzzle', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const combat = new CombatSystem({ scene, camera, shipController: {} } as Engine, {} as SoundManager, {} as UIManager, { authoritative: true } as MultiplayerManager, new THREE.Texture());
  const bolt = combat.createVolumetricLaser(0xff2222, 420, true);
  combat.placeProjectile(bolt, new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 420, 136);
  scene.add(bolt); combat.lasers.push({ mesh: bolt, velocity: new THREE.Vector3(0, 0, -4000), life: 2 });
  expect(bolt.position.z).toBe(-136);
  combat.update(.1, 'pilot', [], [], null);
  expect(bolt.position.z).toBe(-536);
  const core = bolt.children[0] as THREE.Mesh;
  expect(core.geometry.type).toBe('SphereGeometry');
  expect(core.position.y + core.scale.y).toBe(0);
  expect(core.scale.y * 2).toBe(400);
  combat.update(.1, 'pilot', [], [], null);
  expect(core.scale.y * 2).toBe(672);
  combat.cleanup();
  const missile = combat.createMissileOrTorpedo(false);
  expect(missile).toBe(bolt); expect(missile.userData.isLaserBolt).toBe(false);
  expect((missile.children[0] as THREE.Mesh).geometry.type).toBe('CylinderGeometry');
  expect(missile.children.every(child => child.position.length() === 0)).toBe(true);
  expect(missile.children[2].visible).toBe(false);
});

it('uses the same laser hit timing in both cameras and removes a confirmed network hit immediately', () => {
  const starts: number[] = [];
  for (const viewMode of ['first', 'third']) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const controller = { activeWeapon: 'laser', viewMode, laserColor: 'blue', subsystems: { weapons: 100 } };
    const combat = new CombatSystem({ scene, camera, shipController: controller } as unknown as Engine,
      { playLaser: vi.fn(), playWeapon: vi.fn() } as unknown as SoundManager, {} as UIManager, { broadcastShoot: vi.fn(), players: new Map() } as unknown as MultiplayerManager, new THREE.Texture());
    const impact = vi.spyOn(combat, 'createExplosionAt').mockImplementation(() => {}); vi.spyOn(combat, 'createSparksAt').mockImplementation(() => {});
    combat.shootLaser(new THREE.Group(), 'pilot', new THREE.Vector3()); starts.push(combat.lasers[0].mesh.position.z);
    expect(combat.lasers[0].lastPosition!.equals(combat.lasers[0].mesh.position)).toBe(true);
    const target = new THREE.Mesh(); target.position.z = -1000; target.userData.radius = 40; scene.add(target);
    combat.update(.1, 'pilot', [target], [], null); expect(combat.lasers).toHaveLength(1);
    combat.update(.15, 'pilot', [target], [], null); expect(combat.lasers).toHaveLength(0); expect(impact).toHaveBeenCalledOnce();
  }
  expect(starts).toEqual([-136, -136]);
  const scene = new THREE.Scene();
  const combat = new CombatSystem({ scene } as Engine, {} as SoundManager, {} as UIManager,
    { toLocal: (p: number[]) => p } as unknown as MultiplayerManager, new THREE.Texture());
  combat.applyNetworkProjectiles({ self: { id: 'pilot' }, shotGone: [], shots: [{ id: 3, owner: 'pilot', p: [0, 0, -296], v: [0, 0, -4000], life: 1.96, weapon: 'laser', color: 'red' }] } as unknown as WorldSnapshot);
  expect(combat.lasers[0].mesh.position.z).toBe(-296); expect(combat.snapshot().shots[0].tailLength).toBeCloseTo(160);
  combat.applyNetworkProjectiles({ self: { id: 'pilot' }, shotGone: [3], shots: [] } as unknown as WorldSnapshot);
  expect(scene.children).toHaveLength(0);
});

it('shows a missile from directly behind and uses the same launch position in both cameras', () => {
  const starts: number[] = [];
  for (const viewMode of ['first', 'third']) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const controller = { activeWeapon: 'missile', viewMode, laserColor: 'red', subsystems: { weapons: 100 } };
    const combat = new CombatSystem({ scene, camera, shipController: controller } as unknown as Engine,
      { playWeapon: vi.fn() } as unknown as SoundManager, {} as UIManager,
      { broadcastShoot: vi.fn(), players: new Map() } as unknown as MultiplayerManager, new THREE.Texture());
    combat.shootLaser(new THREE.Group(), 'pilot', new THREE.Vector3());
    const missile = combat.lasers[0]; starts.push(missile.mesh.position.z);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0,3,-60), new THREE.Vector3(0,0,-1));
    expect(ray.intersectObject(missile.mesh, true).length).toBeGreaterThan(0);
    combat.update(.2, 'pilot', [], [], null); scene.updateMatrixWorld(true);
    expect(ray.intersectObject(missile.mesh, true).length).toBeGreaterThan(0);
    expect(missile.mesh.position.z).toBeLessThan(-700);
    combat.cleanup();
  }
  expect(starts).toEqual([-176, -176]);
});

it('plays one spatial sound for a remote shotgun volley and preserves its network color', () => {
  const scene = new THREE.Scene(), sound = { playWeapon: vi.fn() };
  const multiplayer = { toLocal: (p: number[]) => p, players: new Map(), localPlayerPosition: new THREE.Vector3() };
  const combat = new CombatSystem({ scene } as Engine, sound as unknown as SoundManager, {} as UIManager, multiplayer as unknown as MultiplayerManager, new THREE.Texture());
  const data = { self: { id: 'pilot' }, shotGone: [], shots: [1, 2, 3].map(id => ({ id, owner: 'remote', p: [id, 0, -100], v: [0, 0, -3800], life: 1.4, weapon: 'shotgun', color: 'green' })) } as unknown as WorldSnapshot;
  combat.applyNetworkProjectiles(data); expect(sound.playWeapon).toHaveBeenCalledOnce(); expect(sound.playWeapon.mock.calls[0][0]).toBe('shotgun');
  expect(sound.playWeapon.mock.calls[0][3]).toBeInstanceOf(THREE.Vector3);
  expect(((combat.lasers[0].mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x55ff88);
  combat.applyNetworkProjectiles(data); expect(sound.playWeapon).toHaveBeenCalledOnce(); combat.cleanup();
});
