import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { Settings } from '../core/Settings';
import type { PlanetDescriptor } from './celestial/PlanetDescriptor';
import { PlanetGeometryPool, PlanetVisual } from './celestial/PlanetVisual';
import { WORLD_SEED } from './celestial/WorldSeed';
import type { SectorManifest } from './space/SectorManifest';
import type { FloatingOrigin } from './space/FloatingOrigin';
import { worldPosition, type WorldPosition } from './space/WorldPosition';
import { SPACE_CONFIG } from './space/SpaceConfig';

export interface OrbitObject { mesh: THREE.Object3D; center: THREE.Vector3; radius: number; speed: number; offset: number; }
export interface SpacePlanet {
  mesh: THREE.Mesh; planetId: string; name: string; type: string;
  position: THREE.Vector3; radius: number; descriptor: PlanetDescriptor;
}
interface Candidate { descriptor: PlanetDescriptor; world: WorldPosition; distance: number; }

export class PlanetBuilder {
  readonly worldSeed = WORLD_SEED;
  readonly activeIds = new Set<string>();
  public spacePlanets: SpacePlanet[] = [];
  public orbitObjects: OrbitObject[] = [];
  private readonly pool = new PlanetGeometryPool();
  private readonly active = new Map<string, PlanetVisual>();
  private desired: Candidate[] = [];
  private readonly vector = new THREE.Vector3();
  public created = 0;
  public disposed = 0;

  constructor(private readonly engine: Engine, private readonly targets: THREE.Mesh[]) {}

  select(manifests: readonly SectorManifest[], origin: FloatingOrigin, shipPosition: THREE.Vector3): void {
    const budget = Settings.graphicsMode === 'HIGH' ? SPACE_CONFIG.high : SPACE_CONFIG.low;
    const candidates: Candidate[] = [];
    for (const manifest of manifests) for (const descriptor of manifest.planets) {
      const world = worldPosition(manifest.sector, descriptor.position);
      this.vector.set(...origin.toLocal(world));
      const distance = this.vector.distanceToSquared(shipPosition);
      if (distance <= budget.planetRadius ** 2) candidates.push({ descriptor, world, distance });
    }
    this.desired = candidates.sort((a, b) => a.distance - b.distance || a.descriptor.planetId.localeCompare(b.descriptor.planetId)).slice(0, budget.maxPlanets);
    const ids = new Set(this.desired.map((candidate) => candidate.descriptor.planetId));
    let changed = false;
    for (const [id, planet] of this.active) {
      if (ids.has(id)) continue;
      const index = this.targets.indexOf(planet.sphere);
      if (index >= 0) this.targets.splice(index, 1);
      planet.dispose();
      this.active.delete(id); this.activeIds.delete(id); this.disposed += 1;
      changed = true;
    }
    if (changed) this.refreshLists();
  }

  buildNext(origin: FloatingOrigin): boolean {
    const next = this.desired.find((candidate) => !this.active.has(candidate.descriptor.planetId));
    if (!next) return false;
    const visual = new PlanetVisual(next.descriptor, this.pool);
    visual.group.position.set(...origin.toLocal(next.world));
    this.engine.scene.add(visual.group);
    this.targets.push(visual.sphere);
    this.active.set(next.descriptor.planetId, visual);
    this.activeIds.add(next.descriptor.planetId);
    this.created += 1;
    this.refreshLists();
    return true;
  }

  private refreshLists(): void {
    this.spacePlanets = [...this.active.values()].map((planet) => ({
      mesh: planet.sphere, planetId: planet.descriptor.planetId, name: planet.descriptor.name,
      type: planet.descriptor.className, position: planet.group.position,
      radius: planet.descriptor.radius, descriptor: planet.descriptor,
    }));
    this.orbitObjects = [...this.active.values()].flatMap((planet) => planet.moons.map((moon, i) => ({
      mesh: moon, center: planet.group.position, radius: planet.descriptor.moons[i].orbitRadius,
      speed: planet.descriptor.moons[i].speed, offset: planet.descriptor.moons[i].phase,
    })));
  }

  dispose() {
    for (const planet of this.active.values()) {
      const index = this.targets.indexOf(planet.sphere);
      if (index >= 0) this.targets.splice(index, 1);
      planet.dispose();
    }
    this.active.clear(); this.activeIds.clear(); this.desired = []; this.refreshLists(); this.pool.dispose();
  }

  update(elapsed: number) { for (const planet of this.active.values()) planet.update(elapsed); }
  snapshot() { return { active: this.active.size, queued: this.desired.filter((p) => !this.activeIds.has(p.descriptor.planetId)).length, created: this.created, disposed: this.disposed }; }
}
