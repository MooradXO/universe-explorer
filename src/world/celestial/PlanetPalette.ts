import type { PlanetBiome, PlanetVisual } from './PlanetDescriptor';
import { createSeededRandom, hashString } from './WorldSeed';

const PALETTES: Record<PlanetBiome, PlanetVisual> = {
  gas: { landColor: 0x8f765c, waterColor: 0x6fb8ff, surfaceTint: 0xa98252, rimColor: 0xb17345, cloudColor: 0xd9b27c, cloudCoverage: 0.9, cloudSpeed: 0.0244 },
  forest: { landColor: 0x2f5d36, waterColor: 0x1f7fb0, surfaceTint: 0x5d7d3c, rimColor: 0x8ad1ff, cloudColor: 0xe8f4ff, cloudCoverage: 0.55, cloudSpeed: 0.0178 },
  desert: { landColor: 0xb6783d, waterColor: 0x2c8cb5, surfaceTint: 0xbe7b3f, rimColor: 0xe4aa6a, cloudColor: 0xf0c98f, cloudCoverage: 0.28, cloudSpeed: 0.022 },
  volcanic: { landColor: 0x2a2420, waterColor: 0xff4b16, surfaceTint: 0x3a2823, rimColor: 0xd85b2c, cloudColor: 0x6c564d, cloudCoverage: 0.74, cloudSpeed: 0.0196 },
  ice: { landColor: 0xb8d5df, waterColor: 0x78d6f7, surfaceTint: 0xa9cbd8, rimColor: 0xbedff6, cloudColor: 0xf6fbff, cloudCoverage: 0.65, cloudSpeed: 0.019 },
  oceanic: { landColor: 0x315f57, waterColor: 0x155fc4, surfaceTint: 0x2b7790, rimColor: 0x5fbce6, cloudColor: 0xdcecff, cloudCoverage: 0.82, cloudSpeed: 0.0226 },
  rocky: { landColor: 0x6b6554, waterColor: 0x405f69, surfaceTint: 0x686151, rimColor: 0x8d8870, cloudColor: 0xb8b099, cloudCoverage: 0.34, cloudSpeed: 0.0166 },
};

export function createPlanetPalette(biome: PlanetBiome, seed: number): PlanetVisual {
  // Independent stream: visual changes never shift any planet's coordinates.
  const rng = createSeededRandom(hashString(`${seed}:orbital-palette:v1`));
  const jitter = (color: number, amount: number) => {
    const channel = (shift: number) => Math.max(0, Math.min(255,
      Math.round(((color >> shift) & 255) + (rng() - 0.5) * 255 * amount)));
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
  };
  const base = PALETTES[biome];
  return {
    landColor: jitter(base.landColor, 0.16), waterColor: jitter(base.waterColor, 0.12),
    surfaceTint: jitter(base.surfaceTint, 0.18), rimColor: jitter(base.rimColor, 0.1),
    cloudColor: jitter(base.cloudColor, 0.08),
    cloudCoverage: Math.max(0, Math.min(1, base.cloudCoverage + (rng() - 0.5) * 0.2)),
    cloudSpeed: base.cloudSpeed * (0.8 + rng() * 0.45),
  };
}
