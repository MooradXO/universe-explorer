export type PlanetBiome = 'gas' | 'forest' | 'desert' | 'volcanic' | 'ice' | 'rocky' | 'oceanic';
export type Coordinates = readonly [number, number, number];

/** Parameters consumed by the orbital texture/shell renderer only. */
export interface PlanetVisual {
  readonly landColor: number;
  readonly waterColor: number;
  readonly surfaceTint: number;
  readonly rimColor: number;
  readonly cloudColor: number;
  readonly cloudCoverage: number;
  readonly cloudSpeed: number;
}

export interface MoonDescriptor {
  readonly radius: number;
  readonly orbitRadius: number;
  readonly speed: number;
  readonly phase: number;
}

/** Serializable catalog data: no Three.js objects, textures, DOM or local clock. */
export interface PlanetDescriptor {
  readonly planetId: string;
  readonly seed: number;
  readonly name: string;
  readonly classIndex: number;
  readonly className: string;
  readonly biome: PlanetBiome;
  readonly radius: number;
  readonly position: Coordinates;
  readonly visual: PlanetVisual;
  readonly cloudRotation: Coordinates;
  readonly ring: { readonly color: number; readonly rotation: Coordinates } | null;
  readonly moons: readonly MoonDescriptor[];
}
