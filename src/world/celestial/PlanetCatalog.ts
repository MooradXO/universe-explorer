import type { MoonDescriptor, PlanetBiome, PlanetDescriptor } from './PlanetDescriptor';
import { createPlanetPalette } from './PlanetPalette';
import { createSeededRandom, hashString, WORLD_SEED } from './WorldSeed';

export const PLANET_CATALOG_CONFIG = Object.freeze({ count: 80, extent: 0.75 });
const CLASSES: readonly { name: string; ringColor: number; biome: PlanetBiome }[] = [
  { name: 'Saturn-Class', ringColor: 0xccaa77, biome: 'gas' },
  { name: 'Neptune-Class', ringColor: 0x8899dd, biome: 'oceanic' },
  { name: 'Mars-Class', ringColor: 0, biome: 'desert' },
  { name: 'Brown Dwarf', ringColor: 0xddcc99, biome: 'volcanic' },
  { name: 'Rocky World', ringColor: 0, biome: 'volcanic' },
  { name: 'Jupiter-Class', ringColor: 0xeecc88, biome: 'gas' },
  { name: 'Ice Giant', ringColor: 0, biome: 'ice' },
  { name: 'Dusty Titan', ringColor: 0xbb9977, biome: 'desert' },
  { name: 'Terrestrial', ringColor: 0, biome: 'forest' },
  { name: 'Gas Colossus', ringColor: 0xddaa66, biome: 'gas' },
];

export function createPlanetCatalog(worldSize: number, worldSeed = WORLD_SEED, count: number = PLANET_CATALOG_CONFIG.count): readonly PlanetDescriptor[] {
  if (!Number.isFinite(worldSize) || worldSize <= 0) throw new RangeError('worldSize must be finite and positive');
  if (!Number.isSafeInteger(count) || count < 1 || count > PLANET_CATALOG_CONFIG.count) throw new RangeError('Invalid planet count');
  const numericSeed = hashString(worldSeed);
  const rng = createSeededRandom(numericSeed);
  const order = CLASSES.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Array.from({ length: count }, (_, index) => {
    const classIndex = index < order.length ? order[index] : Math.floor(rng() * CLASSES.length);
    const planetClass = CLASSES[classIndex];
    const planetId = `planet-${index + 1}`;
    const radius = 50 + rng() * 200;
    const coordinate = () => (rng() - 0.5) * worldSize * PLANET_CATALOG_CONFIG.extent;
    const position = [coordinate(), coordinate(), coordinate()] as const;
    const seed = hashString(`${planetId}:${planetClass.name}:${numericSeed}:${Math.floor(rng() * 0xffffffff)}`);
    const cloudRotation = [rng() * Math.PI, 0, rng() * Math.PI] as const;
    const ring = planetClass.ringColor ? {
      color: planetClass.ringColor,
      rotation: [Math.PI / 2 + (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.4] as const,
    } : null;
    const moonCount = 1 + Math.floor(rng() * 3);
    const moons: MoonDescriptor[] = Array.from({ length: moonCount }, (_, moon) => ({
      radius: 8 + rng() * 12,
      orbitRadius: radius * (2.5 + moon * 1.2 + rng()),
      speed: 0.3 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
    }));
    return {
      planetId, seed, name: `${planetClass.name}-${index + 1}`, classIndex,
      className: planetClass.name, biome: planetClass.biome, radius, position,
      visual: createPlanetPalette(planetClass.biome, seed), cloudRotation, ring, moons,
    };
  });
}
