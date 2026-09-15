import { PlanetBiome } from './PlanetSurfaceManifest';

export interface PlanetSeed {
  id: string;
  seed: number;
  radius: number;
  biome: PlanetBiome;
}
