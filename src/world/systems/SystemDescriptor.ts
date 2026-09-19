import type { MapObject } from '../../catalog/StarMapData';
import { anchorFromCatalog, type StellarAnchor } from '../space/StellarAddress';
import type { Triple } from '../space/WorldPosition';
import type { PlanetDescriptor } from '../celestial/PlanetDescriptor';
import { createPlanetCatalog } from '../celestial/PlanetCatalog';
import { createPlanetPalette } from '../celestial/PlanetPalette';
import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import { keplerPosition, type KeplerElements } from './KeplerOrbit';
import { SYSTEM_CONFIG } from './SystemConfig';
import { SOLAR_PLANETS, SOLAR_SOURCES } from './SolarSystemData';
import { systemEnvironmentProfiles, type EnvironmentProfile } from '../environments/EnvironmentProfile';

export interface SystemBody {
  id: string; name: string; position: Triple; radius: number; origin: 'catalogue' | 'procedural';
  source: string | null; note: string; orbit: KeplerElements; visual: PlanetDescriptor; environment: EnvironmentProfile;
}
export interface SystemDescriptor {
  version: 1; anchor: StellarAnchor; spectrum: string | null; starColor: number; starRadius: number;
  starRadiusIsIllustrative: boolean; bodies: readonly SystemBody[];
}
export const SOLAR_CATALOG_OBJECT: MapObject = {
  id: SYSTEM_CONFIG.homeSystemId, title: 'Sol', names: ['Sol'], position: [0.00000485, 0, 0], distance: 0.00000485,
  positioned: true, raHours: 0, decDegrees: 0, magnitude: -26.74, spectrum: 'G2 V', identifiers: [{ catalog: 'hyg', release: null, value: '0' }],
  distanceSource: 'OTHER', positionSource: 'OTHER', flags: ['source-solar-reference-preserved'], gaiaMatches: 0,
};
const spectralColors: Record<string, number> = { O: 0x91b7ff, B: 0xb3cbff, A: 0xe5ecff, F: 0xfff2d7, G: 0xffd881, K: 0xffae65, M: 0xff734a };
const auPosition = (orbit: KeplerElements) => keplerPosition(orbit).map(value => value * SYSTEM_CONFIG.unitsPerAu) as unknown as Triple;

export function buildSystem(object: MapObject): SystemDescriptor {
  const anchor = anchorFromCatalog(object), solar = object.id === SYSTEM_CONFIG.homeSystemId;
  const templates = createPlanetCatalog(50000, `catalogue-systems:v1:${anchor.catalogId}`, solar ? 8 : 4);
  let bodies: Omit<SystemBody, 'environment'>[];
  if (solar) bodies = SOLAR_PLANETS.map((body, index) => {
    const id = `sol/${body.id}`, radius = body.radiusKm / SYSTEM_CONFIG.kilometersPerUnit, position = auPosition(body.orbit);
    const seed = hashString(id), palette = createPlanetPalette(body.biome, seed);
    const visual = { ...templates[index], planetId: id, name: body.name, className: 'Solar System planet', biome: body.biome,
      radius, position, seed, moons: [], ring: body.id === 'saturn' ? { color: 0xd3be8c, rotation: [Math.PI / 2 - 0.47, 0, 0] as Triple } : null,
      cloudRotation: [0, 0, 0] as Triple, visual: { ...palette, surfaceTint: body.color, landColor: body.id === 'earth' ? 0x5f7952 : body.color,
        waterColor: body.id === 'earth' ? 0x164477 : body.color, cloudCoverage: ['mercury', 'mars'].includes(body.id) ? 0 : palette.cloudCoverage } };
    return { id, name: body.name, radius, position, visual, orbit: body.orbit, origin: 'catalogue', source: SOLAR_SOURCES.orbits,
      note: body.note || 'JPL orbit at J2000; illustrative surface.' };
  });
  else {
    const rng = createSeededRandom(hashString(`${anchor.catalogId}:orbits:v1`));
    bodies = templates.map((template, index) => {
      const orbit: KeplerElements = { semiMajorAu: 0.35 * 2.8 ** index * (0.9 + rng() * 0.2), eccentricity: 0.03 + rng() * 0.18,
        inclinationDegrees: rng() * 7, meanLongitudeDegrees: rng() * 360, perihelionDegrees: rng() * 360, ascendingNodeDegrees: rng() * 360 };
      const id = `${anchor.catalogId}/generated-${index + 1}`, name = `World ${index + 1} · generated`, position = auPosition(orbit);
      const radius = template.biome === 'gas' ? 3000 + rng() * 4000 : 300 + rng() * 650;
      return { id, name, position, radius, orbit, origin: 'procedural', source: null, note: 'Procedural game object; this planet is not observationally confirmed.',
        visual: { ...template, name, planetId: id, radius, position, moons: [] } };
    });
  }
  const spectral = /^\s*([OBAFGKM])/i.exec(object.spectrum ?? '')?.[1].toUpperCase() ?? 'G';
  const profiles = systemEnvironmentProfiles(anchor.catalogId, bodies);
  // Unknown stellar radii use an explicitly illustrative proxy, not an inferred measurement.
  return { version: 1, anchor, spectrum: object.spectrum, starColor: spectralColors[spectral], starRadius: solar ? 69570 : (spectral === 'M' ? 15000 : 70000),
    starRadiusIsIllustrative: !solar, bodies: bodies.map((body, i) => ({ ...body, environment: profiles[i] })) };
}

export function bodyArrival(body: SystemBody): Triple {
  return [body.position[0], body.position[1], body.position[2] + body.radius * 3 + SYSTEM_CONFIG.arrivalMargin];
}
export function systemArrival(system: SystemDescriptor): Triple {
  return bodyArrival(system.bodies[system.anchor.catalogId === SYSTEM_CONFIG.homeSystemId ? 2 : 0]);
}
export const SOLAR_SYSTEM = buildSystem(SOLAR_CATALOG_OBJECT);
