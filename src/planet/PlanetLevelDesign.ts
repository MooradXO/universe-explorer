export type PlanetLevelArchetype =
  | 'oceanic'
  | 'forest'
  | 'desert'
  | 'volcanic'
  | 'ice'
  | 'rocky'
  | 'gas';

export type PlanetPropKind = 'vegetation' | 'rock' | 'landmark' | 'water' | 'cloud';

export interface PlanetPalette {
  low: number;
  mid: number;
  high: number;
  accent: number;
  water: number;
  sky: number;
  haze: number;
}

export interface PlanetSurfaceMaterialSet {
  groundRoughness: number;
  waterOpacity: number;
  cloudOpacity: number;
  emissiveIntensity: number;
}

export interface PlanetPropSet {
  id: string;
  kind: PlanetPropKind;
  assetPaths: string[];
  density: number;
  scaleMin: number;
  scaleMax: number;
  minHeightOffset: number;
  maxHeightOffset: number;
  maxSlope: number;
  colorTint?: number;
}

export interface PlanetLandmarkSet {
  id: string;
  assetPaths: string[];
  count: number;
  scaleMin: number;
  scaleMax: number;
}

export interface PlanetWeatherSet {
  cloudBandCount: number;
  cloudShellOffset: number;
  cloudSpeed: number;
  hazeStrength: number;
}

export interface PlanetLodBudget {
  textureSizeHigh: number;
  textureSizeLow: number;
  surfaceSegmentsHigh: number;
  surfaceSegmentsLow: number;
  propInstancesHigh: number;
  propInstancesLow: number;
  landmarkInstancesHigh: number;
  landmarkInstancesLow: number;
}

export interface PlanetLevelDesign {
  archetype: PlanetLevelArchetype;
  palette: PlanetPalette;
  surfaceMaterials: PlanetSurfaceMaterialSet;
  propSets: PlanetPropSet[];
  landmarkSets: PlanetLandmarkSet[];
  weatherSet: PlanetWeatherSet;
  lodBudget: PlanetLodBudget;
}

export interface PlanetLevelDesignInput {
  planetId: string;
  seed: number;
  biome: string;
  terrainColor: number;
  waterColor: number;
  surfaceTint: number;
  vegetationDensity: number;
  terrainAmplitude: number;
  skyProfile: {
    zenithColor: number;
    horizonColor: number;
    fogColor: number;
    cloudColor: number;
  };
  terrainProfile: {
    landform: string;
  };
  weatherProfile: {
    cloudCoverage: number;
    windSpeed: number;
  };
}

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bValue = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bValue;
}

function resolveArchetype(biome: string): PlanetLevelArchetype {
  switch (biome) {
    case 'oceanic':
      return 'oceanic';
    case 'forest':
      return 'forest';
    case 'desert':
      return 'desert';
    case 'volcanic':
      return 'volcanic';
    case 'ice':
      return 'ice';
    case 'gas':
      return 'gas';
    case 'toxic':
    case 'rocky':
    default:
      return 'rocky';
  }
}

function commonRocks(density = 0.24): PlanetPropSet {
  return {
    id: 'common-rocks',
    kind: 'rock',
    assetPaths: [
      '/assets/planet/common/rock_largeA.glb',
      '/assets/planet/common/rock_largeB.glb',
      '/assets/planet/common/rock_smallA.glb',
      '/assets/planet/common/stone_largeA.glb',
      '/assets/planet/common/stone_smallA.glb',
    ],
    density,
    scaleMin: 0.6,
    scaleMax: 1.8,
    minHeightOffset: -220,
    maxHeightOffset: 9999,
    maxSlope: 0.95,
  };
}

export function createPlanetLevelDesign(manifest: PlanetLevelDesignInput): PlanetLevelDesign {
  const archetype = resolveArchetype(manifest.biome);
  const waterOpacity = archetype === 'oceanic' ? 0.66 : archetype === 'ice' ? 0.34 : 0.48;
  const cloudOpacity = archetype === 'gas' ? 0.38 : 0.14 + manifest.weatherProfile.cloudCoverage * 0.2;
  const palette: PlanetPalette = {
    low: mixHex(manifest.terrainColor, manifest.surfaceTint, 0.56),
    mid: manifest.terrainColor,
    high: mixHex(manifest.terrainColor, manifest.skyProfile.horizonColor, 0.28),
    accent: mixHex(manifest.surfaceTint, manifest.skyProfile.cloudColor, 0.24),
    water: manifest.waterColor,
    sky: manifest.skyProfile.zenithColor,
    haze: manifest.skyProfile.fogColor,
  };

  switch (archetype) {
    case 'desert':
      palette.low = mixHex(manifest.terrainColor, 0x32150d, 0.62);
      palette.mid = mixHex(manifest.terrainColor, manifest.surfaceTint, 0.28);
      palette.high = mixHex(manifest.surfaceTint, 0xf5d49f, 0.62);
      palette.accent = mixHex(manifest.surfaceTint, 0xffb15f, 0.48);
      break;
    case 'oceanic':
      palette.low = mixHex(manifest.terrainColor, 0x0b2732, 0.58);
      palette.mid = mixHex(manifest.terrainColor, 0x3f806d, 0.3);
      palette.high = mixHex(manifest.terrainColor, 0xc8d8ad, 0.5);
      palette.accent = mixHex(manifest.waterColor, 0x65e0d2, 0.35);
      break;
    case 'ice':
      palette.low = mixHex(manifest.terrainColor, 0x234b72, 0.48);
      palette.mid = mixHex(manifest.terrainColor, 0xe2f3ff, 0.28);
      palette.high = mixHex(manifest.terrainColor, 0xffffff, 0.78);
      palette.accent = mixHex(manifest.waterColor, 0x9cf1ff, 0.58);
      break;
    case 'forest':
      palette.low = mixHex(manifest.terrainColor, 0x102d20, 0.58);
      palette.mid = mixHex(manifest.terrainColor, 0x3d7d45, 0.24);
      palette.high = mixHex(manifest.terrainColor, 0xa4bd72, 0.38);
      break;
    case 'volcanic':
      palette.low = mixHex(manifest.terrainColor, 0x08070a, 0.72);
      palette.mid = mixHex(manifest.terrainColor, 0x241515, 0.44);
      palette.high = mixHex(manifest.terrainColor, 0x735046, 0.36);
      palette.accent = 0xff4f1f;
      break;
    case 'gas':
      palette.low = mixHex(manifest.terrainColor, 0x2d1f35, 0.5);
      palette.high = mixHex(manifest.surfaceTint, manifest.skyProfile.cloudColor, 0.5);
      break;
    case 'rocky':
      palette.low = mixHex(manifest.terrainColor, 0x20202a, 0.52);
      palette.high = mixHex(manifest.terrainColor, 0xc6bba8, 0.42);
      break;
  }

  const baseBudget: PlanetLodBudget = {
    textureSizeHigh: 1024,
    textureSizeLow: 512,
    surfaceSegmentsHigh: 176,
    surfaceSegmentsLow: 96,
    propInstancesHigh: archetype === 'gas' ? 120 : 720,
    propInstancesLow: archetype === 'gas' ? 54 : 220,
    landmarkInstancesHigh: 0,
    landmarkInstancesLow: 0,
  };

  const design: PlanetLevelDesign = {
    archetype,
    palette,
    surfaceMaterials: {
      groundRoughness: archetype === 'oceanic' ? 0.74 : 0.9,
      waterOpacity,
      cloudOpacity,
      emissiveIntensity: archetype === 'volcanic' ? 0.22 : archetype === 'gas' ? 0.06 : 0,
    },
    propSets: [commonRocks()],
    landmarkSets: [],
    weatherSet: {
      cloudBandCount: archetype === 'gas' ? 9 : Math.max(2, Math.round(2 + manifest.weatherProfile.cloudCoverage * 6)),
      cloudShellOffset: archetype === 'gas' ? 2400 : 1500 + manifest.weatherProfile.cloudCoverage * 700,
      cloudSpeed: manifest.weatherProfile.windSpeed * (archetype === 'gas' ? 0.012 : 0.006),
      hazeStrength: archetype === 'desert'
        ? 0.62
        : archetype === 'volcanic'
          ? 0.58
          : archetype === 'oceanic'
            ? 0.38
            : archetype === 'ice'
              ? 0.3
              : 0.34,
    },
    lodBudget: baseBudget,
  };

  switch (archetype) {
    case 'forest':
      design.propSets.push({
        id: 'forest-canopy',
        kind: 'vegetation',
        assetPaths: [
          '/assets/planet/forest/tree_default.glb',
          '/assets/planet/forest/tree_oak.glb',
          '/assets/planet/forest/tree_pineTallA.glb',
          '/assets/planet/forest/tree_simple.glb',
        ],
        density: 0.72 * manifest.vegetationDensity,
        scaleMin: 1.0,
        scaleMax: 2.7,
        minHeightOffset: -80,
        maxHeightOffset: 9999,
        maxSlope: 0.72,
      });
      design.propSets.push({
        id: 'forest-understory',
        kind: 'vegetation',
        assetPaths: [
          '/assets/planet/forest/plant_bushDetailed.glb',
          '/assets/planet/forest/plant_bushLarge.glb',
          '/assets/planet/forest/grass_large.glb',
          '/assets/planet/forest/mushroom_redGroup.glb',
        ],
        density: 0.58,
        scaleMin: 0.7,
        scaleMax: 1.8,
        minHeightOffset: -120,
        maxHeightOffset: 9999,
        maxSlope: 0.82,
      });
      break;
    case 'desert':
      design.propSets.push({
        id: 'desert-cactus-spires',
        kind: 'vegetation',
        assetPaths: [
          '/assets/planet/desert/cactus_short.glb',
          '/assets/planet/desert/cactus_tall.glb',
          '/assets/planet/desert/plant_flatShort.glb',
          '/assets/planet/desert/plant_flatTall.glb',
        ],
        density: 0.34,
        scaleMin: 0.9,
        scaleMax: 2.4,
        minHeightOffset: -120,
        maxHeightOffset: 9999,
        maxSlope: 0.78,
      });
      design.propSets.push({
        id: 'desert-rock-fields',
        kind: 'rock',
        assetPaths: [
          '/assets/planet/desert/rock_tallA.glb',
          '/assets/planet/desert/rock_tallB.glb',
          '/assets/planet/desert/stone_tallA.glb',
          '/assets/planet/desert/stone_tallB.glb',
        ],
        density: 0.18,
        scaleMin: 0.7,
        scaleMax: 1.7,
        minHeightOffset: -140,
        maxHeightOffset: 9999,
        maxSlope: 0.82,
      });
      break;
    case 'oceanic':
      design.propSets.push({
        id: 'oceanic-reefs',
        kind: 'water',
        assetPaths: [
          '/assets/planet/oceanic/lily_large.glb',
          '/assets/planet/oceanic/lily_small.glb',
          '/assets/planet/oceanic/rock_smallFlatC.glb',
          '/assets/planet/oceanic/rock_largeD.glb',
        ],
        density: 0.32,
        scaleMin: 0.8,
        scaleMax: 2.6,
        minHeightOffset: -280,
        maxHeightOffset: 110,
        maxSlope: 0.84,
      });
      break;
    case 'ice':
      design.propSets.push({
        id: 'ice-pines-crystals',
        kind: 'vegetation',
        assetPaths: [
          '/assets/planet/ice/tree_pineDefaultA.glb',
          '/assets/planet/ice/tree_pineDefaultB.glb',
          '/assets/planet/ice/stone_tallC.glb',
          '/assets/planet/ice/stone_tallD.glb',
        ],
        density: 0.26,
        scaleMin: 0.8,
        scaleMax: 2.2,
        minHeightOffset: -160,
        maxHeightOffset: 9999,
        maxSlope: 0.78,
        colorTint: 0xcff4ff,
      });
      break;
    case 'volcanic':
      design.propSets = [commonRocks(0.48)];
      design.propSets.push({
        id: 'volcanic-basalt-fields',
        kind: 'rock',
        assetPaths: [
          '/assets/planet/volcanic/rock_tallG.glb',
          '/assets/planet/volcanic/rock_tallH.glb',
          '/assets/planet/volcanic/rock_largeE.glb',
          '/assets/planet/volcanic/rock_smallG.glb',
        ],
        density: 0.36,
        scaleMin: 0.8,
        scaleMax: 2.2,
        minHeightOffset: -160,
        maxHeightOffset: 9999,
        maxSlope: 0.9,
      });
      break;
    case 'rocky':
      design.propSets = [commonRocks(0.56)];
      design.propSets.push({
        id: 'rocky-mineral-fields',
        kind: 'rock',
        assetPaths: [
          '/assets/planet/rocky/stone_tallE.glb',
          '/assets/planet/rocky/stone_tallF.glb',
          '/assets/planet/rocky/rock_tallI.glb',
          '/assets/planet/rocky/rock_tallJ.glb',
        ],
        density: 0.42,
        scaleMin: 0.7,
        scaleMax: 2.1,
        minHeightOffset: -180,
        maxHeightOffset: 9999,
        maxSlope: 0.95,
      });
      break;
    case 'gas':
      design.propSets = [{
        id: 'gas-cloud-islands',
        kind: 'cloud',
        assetPaths: [],
        density: 0.2,
        scaleMin: 12,
        scaleMax: 38,
        minHeightOffset: -9999,
        maxHeightOffset: 9999,
        maxSlope: 1,
        colorTint: manifest.skyProfile.cloudColor,
      }];
      break;
  }

  return design;
}
