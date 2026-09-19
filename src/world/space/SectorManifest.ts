import { createPlanetCatalog } from '../celestial/PlanetCatalog';
import type { PlanetDescriptor } from '../celestial/PlanetDescriptor';
import { createSeededRandom, hashString, WORLD_SEED } from '../celestial/WorldSeed';
import { sectorKey, type Triple } from './WorldPosition';
import { SPACE_CONFIG } from './SpaceConfig';

export interface NavigationStar { readonly id: string; readonly position: Triple; readonly color: number; readonly radius: number; }
export interface SectorManifest {
  readonly key: string;
  readonly sector: Triple;
  readonly version: 1;
  readonly stars: readonly NavigationStar[];
  readonly planets: readonly PlanetDescriptor[];
}

/** Pure worker-safe generator. Home retains the v1 planetary layout. */
export function createSectorManifest(sector: Triple, seed = WORLD_SEED): SectorManifest {
  if (!sector.every(Number.isSafeInteger)) throw new RangeError('Invalid sector coordinates');
  const key = sectorKey(sector);
  const home = key === '0,0,0';
  const rng = createSeededRandom(hashString(`${seed}:sector:v1:${key}:stars`));
  const colors = [0xdceaff, 0xffd7a0, 0x84baff, 0xff8f6f, 0xeeeaff];
  const stars = Array.from({ length: 32 }, (_, index) => ({
    id: `${key}/star-${index}`,
    position: [0, 0, 0].map(() => (rng() - 0.5) * SPACE_CONFIG.sectorSize * 0.98) as unknown as Triple,
    color: colors[Math.floor(rng() * colors.length)], radius: 40 + rng() * 110,
  }));
  const planets = createPlanetCatalog(SPACE_CONFIG.sectorSize, home ? seed : `${seed}:sector:v1:${key}`, home ? 80 : 6)
    .map((planet) => home ? planet : ({ ...planet, planetId: `${key}/${planet.planetId}` }));
  return { key, sector: [...sector], version: 1, stars, planets };
}
