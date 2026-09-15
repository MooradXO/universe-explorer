import { PlanetLevelDesign, createPlanetLevelDesign } from './PlanetLevelDesign';

export type PlanetBiome =
  | 'gas'
  | 'forest'
  | 'desert'
  | 'volcanic'
  | 'ice'
  | 'rocky'
  | 'toxic'
  | 'oceanic';

export type WeatherKind = 'clear' | 'cloudy' | 'rainy' | 'foggy';
export type TerrainLandform = 'bands' | 'rolling' | 'ridges' | 'dunes' | 'craters' | 'terraces' | 'canyons';
export type VegetationShape = 'none' | 'needle' | 'broad' | 'cactus' | 'crystal' | 'spire';

export interface WeatherProfile {
  kind: WeatherKind;
  cloudCoverage: number;
  precipitation: number;
  windSpeed: number;
}

export interface SkyProfile {
  zenithColor: number;
  horizonColor: number;
  fogColor: number;
  fogDensity: number;
  fogNear: number;
  fogFar: number;
  cloudColor: number;
}

export interface TerrainProfile {
  landform: TerrainLandform;
  macroScale: number;
  midScale: number;
  fineScale: number;
  ridgeStrength: number;
  duneStrength: number;
  craterStrength: number;
  terraceSteps: number;
  canyonStrength: number;
  warpStrength: number;
  curvatureRadius: number;
  horizonDrop: number;
}

export interface SurfaceAssetProfile {
  vegetationShape: VegetationShape;
  vegetationColor: number;
  rockColor: number;
  accentColor: number;
  objectScale: number;
  scatterDensity: number;
}

export interface PlanetSurfaceManifest {
  planetId: string;
  seed: number;
  classIndex: number;
  className: string;
  biome: PlanetBiome;
  radius: number;
  waterLevel: number;
  terrainScale: number;
  terrainAmplitude: number;
  vegetationDensity: number;
  terrainColor: number;
  waterColor: number;
  surfaceTint: number;
  terrainProfile: TerrainProfile;
  assetProfile: SurfaceAssetProfile;
  levelDesign: PlanetLevelDesign;
  weatherProfile: WeatherProfile;
  skyProfile: SkyProfile;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBiome(classIndex: number): PlanetBiome {
  switch (classIndex) {
    case 0:
    case 5:
    case 9:
      return 'gas';
    case 1:
      return 'oceanic';
    case 2:
    case 7:
      return 'desert';
    case 3:
    case 4:
      return 'volcanic';
    case 6:
      return 'ice';
    case 8:
      return 'forest';
    default:
      return 'rocky';
  }
}

function pick<T>(rng: () => number, values: T[]): T {
  return values[Math.floor(rng() * values.length) % values.length];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (clampByte(ar + (br - ar) * t) << 16) |
    (clampByte(ag + (bg - ag) * t) << 8) |
    clampByte(ab + (bb - ab) * t)
  );
}

function jitterHex(color: number, rng: () => number, amount: number): number {
  const delta = 255 * amount;
  const r = clampByte(((color >> 16) & 255) + (rng() - 0.5) * delta);
  const g = clampByte(((color >> 8) & 255) + (rng() - 0.5) * delta);
  const b = clampByte((color & 255) + (rng() - 0.5) * delta);
  return (r << 16) | (g << 8) | b;
}

function landformsForBiome(biome: PlanetBiome): TerrainLandform[] {
  switch (biome) {
    case 'gas':
      return ['bands', 'terraces', 'rolling'];
    case 'forest':
      return ['rolling', 'ridges', 'canyons'];
    case 'desert':
      return ['dunes', 'canyons', 'terraces'];
    case 'volcanic':
      return ['ridges', 'craters', 'canyons'];
    case 'ice':
      return ['terraces', 'craters', 'rolling'];
    case 'oceanic':
      return ['rolling', 'terraces', 'ridges'];
    case 'toxic':
    case 'rocky':
    default:
      return ['craters', 'ridges', 'canyons'];
  }
}

function vegetationShapeForBiome(biome: PlanetBiome, landform: TerrainLandform, rng: () => number): VegetationShape {
  if (biome === 'gas') return 'none';
  if (biome === 'forest') return pick(rng, ['broad', 'needle']);
  if (biome === 'desert') return pick(rng, ['cactus', 'spire']);
  if (biome === 'volcanic') return pick(rng, ['spire', 'crystal']);
  if (biome === 'ice') return pick(rng, ['crystal', 'spire']);
  if (biome === 'oceanic') return pick(rng, ['broad', 'crystal']);
  return landform === 'craters' ? 'crystal' : pick(rng, ['spire', 'needle']);
}

function biomeDefaults(biome: PlanetBiome) {
  switch (biome) {
    case 'gas':
      return {
        waterLevel: -70,
        terrainScale: 760,
        terrainAmplitude: 42,
        vegetationDensity: 0,
        terrainColor: 0x8f765c,
        waterColor: 0x6fb8ff,
        surfaceTint: 0xa98252,
        skyProfile: {
          zenithColor: 0x2a1938,
          horizonColor: 0xb17345,
          fogColor: 0x7d5846,
          fogDensity: 0.00016,
          fogNear: 12000,
          fogFar: 42000,
          cloudColor: 0xd9b27c,
        },
        weatherProfile: { kind: 'foggy' as WeatherKind, cloudCoverage: 0.9, precipitation: 0.05, windSpeed: 1.2 },
      };
    case 'forest':
      return {
        waterLevel: 8,
        terrainScale: 520,
        terrainAmplitude: 82,
        vegetationDensity: 0.75,
        terrainColor: 0x2f5d36,
        waterColor: 0x1f7fb0,
        surfaceTint: 0x5d7d3c,
        skyProfile: {
          zenithColor: 0x195c9f,
          horizonColor: 0x8ad1ff,
          fogColor: 0x8cbfbe,
          fogDensity: 0.00008,
          fogNear: 14000,
          fogFar: 46000,
          cloudColor: 0xe8f4ff,
        },
        weatherProfile: { kind: 'cloudy' as WeatherKind, cloudCoverage: 0.55, precipitation: 0.15, windSpeed: 0.65 },
      };
    case 'desert':
      return {
        waterLevel: -22,
        terrainScale: 620,
        terrainAmplitude: 58,
        vegetationDensity: 0.22,
        terrainColor: 0xb6783d,
        waterColor: 0x2c8cb5,
        surfaceTint: 0xbe7b3f,
        skyProfile: {
          zenithColor: 0x214c78,
          horizonColor: 0xe4aa6a,
          fogColor: 0xd79b6a,
          fogDensity: 0.0001,
          fogNear: 15000,
          fogFar: 48000,
          cloudColor: 0xf0c98f,
        },
        weatherProfile: { kind: 'foggy' as WeatherKind, cloudCoverage: 0.28, precipitation: 0, windSpeed: 1.0 },
      };
    case 'volcanic':
      return {
        waterLevel: -58,
        terrainScale: 380,
        terrainAmplitude: 112,
        vegetationDensity: 0.06,
        terrainColor: 0x2a2420,
        waterColor: 0xff4b16,
        surfaceTint: 0x3a2823,
        skyProfile: {
          zenithColor: 0x190b12,
          horizonColor: 0xd85b2c,
          fogColor: 0x5c2b22,
          fogDensity: 0.00014,
          fogNear: 11000,
          fogFar: 38000,
          cloudColor: 0x6c564d,
        },
        weatherProfile: { kind: 'foggy' as WeatherKind, cloudCoverage: 0.74, precipitation: 0.02, windSpeed: 0.8 },
      };
    case 'ice':
      return {
        waterLevel: -12,
        terrainScale: 560,
        terrainAmplitude: 72,
        vegetationDensity: 0.05,
        terrainColor: 0xb8d5df,
        waterColor: 0x78d6f7,
        surfaceTint: 0xa9cbd8,
        skyProfile: {
          zenithColor: 0x143a68,
          horizonColor: 0xbedff6,
          fogColor: 0xaed6e4,
          fogDensity: 0.0001,
          fogNear: 13000,
          fogFar: 44000,
          cloudColor: 0xf6fbff,
        },
        weatherProfile: { kind: 'cloudy' as WeatherKind, cloudCoverage: 0.65, precipitation: 0.05, windSpeed: 0.75 },
      };
    case 'oceanic':
      return {
        waterLevel: 28,
        terrainScale: 610,
        terrainAmplitude: 80,
        vegetationDensity: 0.28,
        terrainColor: 0x315f57,
        waterColor: 0x155fc4,
        surfaceTint: 0x2b7790,
        skyProfile: {
          zenithColor: 0x103b75,
          horizonColor: 0x5fbce6,
          fogColor: 0x5c9fc0,
          fogDensity: 0.00009,
          fogNear: 13000,
          fogFar: 45000,
          cloudColor: 0xdcecff,
        },
        weatherProfile: { kind: 'rainy' as WeatherKind, cloudCoverage: 0.82, precipitation: 0.55, windSpeed: 1.05 },
      };
    case 'toxic':
    case 'rocky':
    default:
      return {
        waterLevel: -35,
        terrainScale: 460,
        terrainAmplitude: 115,
        vegetationDensity: 0.16,
        terrainColor: 0x6b6554,
        waterColor: 0x405f69,
        surfaceTint: 0x686151,
        skyProfile: {
          zenithColor: 0x20283b,
          horizonColor: 0x8d8870,
          fogColor: 0x686151,
          fogDensity: 0.0001,
          fogNear: 13000,
          fogFar: 43000,
          cloudColor: 0xb8b099,
        },
        weatherProfile: { kind: 'clear' as WeatherKind, cloudCoverage: 0.34, precipitation: 0, windSpeed: 0.55 },
      };
  }
}

export function createPlanetSurfaceManifest(
  planetId: string,
  seed: number,
  classIndex: number,
  className: string,
  radius: number,
): PlanetSurfaceManifest {
  const biome = pickBiome(classIndex);
  const defaults = biomeDefaults(biome);
  const rng = createSeededRandom(hashString(`${planetId}:${seed}:${classIndex}:surface`));
  const landform = pick(rng, landformsForBiome(biome));
  const terrainScale = defaults.terrainScale * (0.68 + rng() * 0.72);
  const terrainAmplitude = defaults.terrainAmplitude * (0.72 + rng() * 0.9);
  const terrainColor = jitterHex(defaults.terrainColor, rng, 0.16);
  const waterColor = jitterHex(defaults.waterColor, rng, 0.12);
  const surfaceTint = mixHex(jitterHex(defaults.surfaceTint, rng, 0.18), terrainColor, 0.22 + rng() * 0.28);
  const vegetationShape = vegetationShapeForBiome(biome, landform, rng);
  const vegetationBase = biome === 'ice'
    ? 0xd7f4ff
    : biome === 'volcanic'
      ? 0x3b312b
      : biome === 'desert'
        ? 0x78914a
        : biome === 'oceanic'
          ? 0x2f9f86
          : 0x2f8f4a;
  const skyProfile = {
    ...defaults.skyProfile,
    zenithColor: jitterHex(defaults.skyProfile.zenithColor, rng, 0.08),
    horizonColor: jitterHex(defaults.skyProfile.horizonColor, rng, 0.1),
    fogColor: jitterHex(defaults.skyProfile.fogColor, rng, 0.07),
    fogNear: defaults.skyProfile.fogNear * (0.9 + rng() * 0.25),
    fogFar: defaults.skyProfile.fogFar * (0.92 + rng() * 0.28),
    cloudColor: jitterHex(defaults.skyProfile.cloudColor, rng, 0.08),
  };

  const manifest = {
    planetId,
    seed,
    classIndex,
    className,
    biome,
    radius,
    waterLevel: defaults.waterLevel + (rng() - 0.5) * 16,
    terrainScale,
    terrainAmplitude,
    vegetationDensity: Math.max(0, Math.min(1, defaults.vegetationDensity * (0.75 + rng() * 0.55))),
    terrainColor,
    waterColor,
    surfaceTint,
    terrainProfile: {
      landform,
      macroScale: terrainScale * (2.4 + rng() * 4.2),
      midScale: terrainScale * (0.55 + rng() * 0.75),
      fineScale: Math.max(42, terrainScale * (0.14 + rng() * 0.26)),
      ridgeStrength: biome === 'volcanic' || landform === 'ridges' ? 0.38 + rng() * 0.44 : 0.08 + rng() * 0.24,
      duneStrength: biome === 'desert' || landform === 'dunes' ? 0.32 + rng() * 0.5 : 0.04 + rng() * 0.16,
      craterStrength: landform === 'craters' ? 0.28 + rng() * 0.5 : 0.03 + rng() * 0.18,
      terraceSteps: 4 + Math.floor(rng() * 7),
      canyonStrength: landform === 'canyons' ? 0.32 + rng() * 0.5 : 0.04 + rng() * 0.18,
      warpStrength: 0.12 + rng() * 0.75,
      curvatureRadius: 190000 + rng() * 240000,
      horizonDrop: 0.42 + rng() * 0.58,
    },
    assetProfile: {
      vegetationShape,
      vegetationColor: jitterHex(vegetationBase, rng, 0.16),
      rockColor: jitterHex(mixHex(terrainColor, 0x9b9286, 0.42), rng, 0.12),
      accentColor: jitterHex(mixHex(surfaceTint, skyProfile.horizonColor, 0.22), rng, 0.12),
      objectScale: 0.7 + rng() * 1.6,
      scatterDensity: Math.max(0.08, Math.min(1.3, 0.65 + (rng() - 0.5) * 0.9)),
    },
    weatherProfile: {
      ...defaults.weatherProfile,
      cloudCoverage: Math.max(0, Math.min(1, defaults.weatherProfile.cloudCoverage + (rng() - 0.5) * 0.2)),
      windSpeed: defaults.weatherProfile.windSpeed * (0.8 + rng() * 0.45),
    },
    skyProfile,
  };

  return {
    ...manifest,
    levelDesign: createPlanetLevelDesign(manifest),
  };
}
