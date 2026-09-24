import type { SystemDescriptor } from '../systems/SystemDescriptor';
import { orbitalZones } from '../systems/OrbitalSite';
import { hashString } from '../celestial/WorldSeed';
import type { FlightObstacle } from '../systems/CruiseMotion';

/** Shared by server authority and offline cruise; render detail never enters this list. */
export function systemObstacles(system: SystemDescriptor): FlightObstacle[] {
  return [{ position: [0,0,0], radius: system.starRadius },
    ...system.bodies.map(b => ({position:b.position,radius:b.radius})),
    ...system.bodies.flatMap(b => orbitalZones(b).map(z => ({position:z.center,radius:z.bound,margin:150})))];
}
export function physicsFingerprint(system: SystemDescriptor): string {
  return hashString(JSON.stringify({ id:system.anchor.catalogId, version:1, obstacles:systemObstacles(system),
    profiles:system.bodies.map(b=>b.environment) })).toString(16).padStart(8,'0');
}
