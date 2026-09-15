import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { PlanetSurfaceManifest, createSeededRandom, hashString } from './PlanetSurfaceManifest';

export type TerrainHeightSampler = (x: number, z: number) => number;

export function createTerrainHeightSampler(manifest: PlanetSurfaceManifest): TerrainHeightSampler {
  const profile = manifest.terrainProfile;
  const macroNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:terrain-macro`)));
  const midNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:terrain-mid`)));
  const fineNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:terrain-fine`)));
  const warpNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:terrain-warp`)));
  const directionRng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:terrain-direction`));
  const duneAngle = directionRng() * Math.PI * 2;
  const bandAngle = directionRng() * Math.PI * 2;

  const craterField = (x: number, z: number): number => {
    const cellSize = profile.macroScale * 0.72;
    const cellX = Math.floor(x / cellSize);
    const cellZ = Math.floor(z / cellSize);
    let field = 0;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cellX + dx;
        const cz = cellZ + dz;
        const cellRng = createSeededRandom(hashString(`${manifest.seed}:crater:${cx}:${cz}`));
        if (cellRng() < 0.42) continue;

        const centerX = (cx + 0.18 + cellRng() * 0.64) * cellSize;
        const centerZ = (cz + 0.18 + cellRng() * 0.64) * cellSize;
        const radius = cellSize * (0.16 + cellRng() * 0.24);
        const dist = Math.hypot(x - centerX, z - centerZ);
        if (dist > radius * 1.18) continue;

        const t = dist / radius;
        const bowl = 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.92);
        const rim = THREE.MathUtils.smoothstep(t, 0.72, 0.98) * (1 - THREE.MathUtils.smoothstep(t, 0.98, 1.18));
        field += rim * 0.55 - bowl * 0.9;
      }
    }

    return field;
  };

  return (x: number, z: number) => {
    const warp = warpNoise(x / (profile.macroScale * 1.7), z / (profile.macroScale * 1.7)) * manifest.terrainScale * profile.warpStrength;
    const warpedX = x + warp;
    const warpedZ = z + warpNoise((x + 9300) / profile.macroScale, (z - 5100) / profile.macroScale) * manifest.terrainScale * profile.warpStrength;
    const broad = macroNoise(warpedX / profile.macroScale, warpedZ / profile.macroScale);
    const mid = midNoise(warpedX / profile.midScale, warpedZ / profile.midScale);
    const fine = fineNoise(warpedX / profile.fineScale, warpedZ / profile.fineScale);
    const ridge = Math.pow(1 - Math.abs(midNoise(warpedX / (profile.midScale * 1.35), warpedZ / (profile.midScale * 1.35))), 2.2);
    const duneAxis = Math.cos(duneAngle) * warpedX + Math.sin(duneAngle) * warpedZ;
    const dunes = Math.sin(duneAxis / (profile.midScale * 0.62)) * 0.34 + Math.sin(duneAxis / (profile.midScale * 1.45)) * 0.18;
    const canyon = THREE.MathUtils.smoothstep(Math.abs(macroNoise(warpedX / (profile.macroScale * 0.82), warpedZ / (profile.macroScale * 0.82))), 0.48, 0.9);

    let normalized = broad * 0.58 + mid * 0.2 + fine * 0.06;

    switch (profile.landform) {
      case 'bands': {
        const bandAxis = Math.cos(bandAngle) * warpedX + Math.sin(bandAngle) * warpedZ;
        const bands = Math.sin(bandAxis / (profile.midScale * 0.9) + manifest.seed * 0.00001) * 0.34;
        normalized = broad * 0.34 + mid * 0.12 + bands;
        break;
      }
      case 'dunes':
        normalized = broad * 0.28 + dunes * profile.duneStrength + fine * 0.04;
        break;
      case 'ridges':
        normalized = broad * 0.44 + ridge * profile.ridgeStrength + mid * 0.14 + fine * 0.05;
        break;
      case 'craters':
        normalized = broad * 0.42 + mid * 0.14 + craterField(warpedX, warpedZ) * profile.craterStrength + fine * 0.04;
        break;
      case 'terraces': {
        const terraced = Math.round((broad * 0.72 + mid * 0.24) * profile.terraceSteps) / profile.terraceSteps;
        normalized = terraced + fine * 0.04;
        break;
      }
      case 'canyons':
        normalized = broad * 0.56 + mid * 0.1 - canyon * profile.canyonStrength + ridge * profile.ridgeStrength * 0.36;
        break;
      case 'rolling':
      default:
        normalized = broad * 0.7 + mid * 0.22 + fine * 0.05;
        break;
    }

    if (manifest.biome === 'oceanic') normalized -= 0.12;
    if (manifest.biome === 'gas') normalized += 0.28;
    return normalized * manifest.terrainAmplitude;
  };
}

export function colorForTerrainHeight(manifest: PlanetSurfaceManifest, height: number): THREE.Color {
  const base = new THREE.Color(manifest.levelDesign.palette.mid);
  const tint = new THREE.Color(manifest.levelDesign.palette.low);
  const water = new THREE.Color(manifest.levelDesign.palette.water);
  const high = base.clone().lerp(new THREE.Color(manifest.levelDesign.palette.high), manifest.biome === 'ice' ? 0.72 : 0.34);
  const low = manifest.biome === 'gas'
    ? tint.clone().lerp(new THREE.Color(manifest.skyProfile.cloudColor), 0.42)
    : base.clone().lerp(tint, 0.55);

  if (height < manifest.waterLevel + 3 && manifest.biome !== 'gas') {
    return water.clone().lerp(base, 0.34);
  }

  const normalized = THREE.MathUtils.clamp((height + manifest.terrainAmplitude) / (manifest.terrainAmplitude * 2), 0, 1);
  return low.lerp(high, normalized);
}

export class TerrainChunk {
  public readonly group = new THREE.Group();
  private terrainMaterial: THREE.MeshStandardMaterial;
  private waterMaterial: THREE.MeshStandardMaterial;
  private vegetationMaterial: THREE.MeshStandardMaterial;
  private rockMaterial: THREE.MeshStandardMaterial;
  private terrainGeometry: THREE.BufferGeometry;
  private waterGeometry: THREE.PlaneGeometry;
  private vegetationGeometry: THREE.BufferGeometry;
  private rockGeometry: THREE.DodecahedronGeometry;
  private terrainMesh: THREE.Mesh;
  private waterMesh: THREE.Mesh;
  private vegetationMesh: THREE.InstancedMesh;
  private rockMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(
    manifest: PlanetSurfaceManifest,
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    segments: number,
    heightSampler: TerrainHeightSampler,
    maxVegetation: number,
  ) {
    this.group.position.set(chunkX * chunkSize, 0, chunkZ * chunkSize);

    this.terrainGeometry = this.createTerrainGeometry(manifest, chunkX, chunkZ, chunkSize, segments, heightSampler);
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: manifest.terrainColor,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
      vertexColors: true,
    });
    this.terrainMesh = new THREE.Mesh(this.terrainGeometry, this.terrainMaterial);
    this.terrainMesh.receiveShadow = false;
    this.group.add(this.terrainMesh);

    this.waterGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize, 1, 1);
    this.waterGeometry.rotateX(-Math.PI / 2);
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: manifest.waterColor,
      emissive: manifest.waterColor,
      emissiveIntensity: manifest.biome === 'volcanic' ? 0.42 : 0.08,
      transparent: true,
      opacity: manifest.biome === 'gas' ? 0.16 : 0.48,
      roughness: 0.38,
      metalness: 0.08,
    });
    this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    this.waterMesh.position.y = manifest.waterLevel;
    this.group.add(this.waterMesh);

    const rng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:${chunkX}:${chunkZ}:instances`));
    this.vegetationGeometry = this.createVegetationGeometry(manifest);
    this.vegetationMaterial = new THREE.MeshStandardMaterial({ color: manifest.assetProfile.vegetationColor, roughness: 0.86, flatShading: true });
    this.vegetationMesh = new THREE.InstancedMesh(this.vegetationGeometry, this.vegetationMaterial, maxVegetation);
    this.vegetationMesh.count = this.placeVegetation(manifest, rng, chunkSize, heightSampler, maxVegetation);
    this.vegetationMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.vegetationMesh);

    const maxRocks = Math.max(8, Math.floor(maxVegetation * (0.18 + manifest.assetProfile.scatterDensity * 0.28)));
    this.rockGeometry = new THREE.DodecahedronGeometry(7, 0);
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: manifest.assetProfile.rockColor, roughness: 0.94, flatShading: true });
    this.rockMesh = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, maxRocks);
    this.rockMesh.count = this.placeRocks(manifest, rng, chunkSize, heightSampler, maxRocks);
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.rockMesh);
  }

  public update(elapsed: number, windSpeed: number) {
    this.waterMesh.position.y += Math.sin(elapsed * (0.8 + windSpeed * 0.4) + this.group.position.x * 0.002) * 0.018;
  }

  public dispose() {
    this.group.remove(this.terrainMesh, this.waterMesh, this.vegetationMesh, this.rockMesh);
    this.terrainGeometry.dispose();
    this.waterGeometry.dispose();
    this.vegetationGeometry.dispose();
    this.rockGeometry.dispose();
    this.terrainMaterial.dispose();
    this.waterMaterial.dispose();
    this.vegetationMaterial.dispose();
    this.rockMaterial.dispose();
  }

  private createTerrainGeometry(
    manifest: PlanetSurfaceManifest,
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    segments: number,
    heightSampler: TerrainHeightSampler,
  ): THREE.BufferGeometry {
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const half = chunkSize / 2;
    const step = chunkSize / segments;

    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const localX = -half + x * step;
        const localZ = -half + z * step;
        const worldX = chunkX * chunkSize + localX;
        const worldZ = chunkZ * chunkSize + localZ;
        const height = heightSampler(worldX, worldZ);
        const color = colorForTerrainHeight(manifest, height);
        vertices.push(localX, height, localZ);
        colors.push(color.r, color.g, color.b);
      }
    }

    for (let z = 0; z < segments; z++) {
      for (let x = 0; x < segments; x++) {
        const a = z * (segments + 1) + x;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createVegetationGeometry(manifest: PlanetSurfaceManifest): THREE.BufferGeometry {
    switch (manifest.assetProfile.vegetationShape) {
      case 'broad':
        return new THREE.ConeGeometry(9, 34, 7);
      case 'cactus':
        return new THREE.CylinderGeometry(4, 5, 30, 6);
      case 'crystal':
        return new THREE.OctahedronGeometry(9, 0);
      case 'spire':
        return new THREE.ConeGeometry(6, 44, 5);
      case 'needle':
      case 'none':
      default:
        return new THREE.ConeGeometry(4, 36, 5);
    }
  }

  private placeVegetation(
    manifest: PlanetSurfaceManifest,
    rng: () => number,
    chunkSize: number,
    heightSampler: TerrainHeightSampler,
    maxVegetation: number,
  ): number {
    const count = manifest.assetProfile.vegetationShape === 'none'
      ? 0
      : Math.min(maxVegetation, Math.floor(maxVegetation * manifest.vegetationDensity * manifest.assetProfile.scatterDensity));
    if (count <= 0) return 0;
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const localX = (rng() - 0.5) * chunkSize;
      const localZ = (rng() - 0.5) * chunkSize;
      const worldX = this.group.position.x + localX;
      const worldZ = this.group.position.z + localZ;
      const y = heightSampler(worldX, worldZ);
      if (y < manifest.waterLevel + 4 && manifest.biome !== 'gas') continue;

      const scale = (0.7 + rng() * 1.9) * manifest.assetProfile.objectScale;
      const heightOffset = manifest.assetProfile.vegetationShape === 'crystal' ? 7 * scale : 13 * scale;
      this.dummy.position.set(localX, y + heightOffset, localZ);
      this.dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      if (manifest.assetProfile.vegetationShape === 'cactus') {
        this.dummy.scale.set(scale * (0.75 + rng() * 0.35), scale * (0.95 + rng() * 0.8), scale * (0.75 + rng() * 0.35));
      } else if (manifest.assetProfile.vegetationShape === 'broad') {
        this.dummy.scale.set(scale * (1.25 + rng() * 0.6), scale * (0.75 + rng() * 0.45), scale * (1.25 + rng() * 0.6));
      } else {
        this.dummy.scale.set(scale * (0.75 + rng() * 0.5), scale * (1.05 + rng() * 0.9), scale * (0.75 + rng() * 0.5));
      }
      this.dummy.updateMatrix();
      this.vegetationMesh.setMatrixAt(placed, this.dummy.matrix);
      placed++;
    }
    return placed;
  }

  private placeRocks(
    manifest: PlanetSurfaceManifest,
    rng: () => number,
    chunkSize: number,
    heightSampler: TerrainHeightSampler,
    maxRocks: number,
  ): number {
    for (let i = 0; i < maxRocks; i++) {
      const localX = (rng() - 0.5) * chunkSize;
      const localZ = (rng() - 0.5) * chunkSize;
      const worldX = this.group.position.x + localX;
      const worldZ = this.group.position.z + localZ;
      const y = heightSampler(worldX, worldZ);
      const scale = (0.7 + rng() * 2.4) * manifest.assetProfile.objectScale;
      this.dummy.position.set(localX, y + 3 * scale, localZ);
      this.dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.dummy.scale.set(scale, scale * (0.45 + rng()), scale);
      this.dummy.updateMatrix();
      this.rockMesh.setMatrixAt(i, this.dummy.matrix);
    }
    return maxRocks;
  }
}
