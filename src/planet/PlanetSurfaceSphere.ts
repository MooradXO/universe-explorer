import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Settings } from '../core/Settings';
import { PlanetSurfaceManifest, createSeededRandom, hashString } from './PlanetSurfaceManifest';
import { PlanetPropKind } from './PlanetLevelDesign';
import { planetEnvironmentAssetLoader } from './PlanetEnvironmentAssetLoader';
import { createSpaceCloudTexture } from './SpacePlanetSurface';
import { TerrainHeightSampler, colorForTerrainHeight } from './TerrainChunk';

export interface SphericalSurfaceSample {
  normal: THREE.Vector3;
  surfaceRadius: number;
  terrainHeight: number;
  altitude: number;
}

const UP = new THREE.Vector3(0, 1, 0);

interface PlanetAssetPlacement {
  assetPath: string;
  kind: PlanetPropKind;
  normal: THREE.Vector3;
  surfaceRadius: number;
  scale: number;
  rotation: number;
  colorTint?: number;
}

export class PlanetSurfaceSphere {
  public readonly group = new THREE.Group();
  public readonly radius: number;

  private readonly heightScale: number;
  private readonly surfaceGeometry: THREE.SphereGeometry;
  private readonly surfaceMaterial: THREE.MeshStandardMaterial;
  private readonly surfaceMesh: THREE.Mesh;
  private readonly surfaceTexture: THREE.CanvasTexture;
  private readonly waterGeometry: THREE.SphereGeometry | null = null;
  private readonly waterMaterial: THREE.MeshPhysicalMaterial | null = null;
  private readonly waterBumpTexture: THREE.CanvasTexture | null = null;
  private readonly waterMesh: THREE.Mesh | null = null;
  private readonly cloudGeometry: THREE.SphereGeometry;
  private readonly cloudMaterial: THREE.MeshStandardMaterial;
  private readonly cloudTexture: THREE.Texture;
  private readonly cloudMesh: THREE.Mesh;
  private readonly vegetationGeometry: THREE.BufferGeometry | null = null;
  private readonly vegetationMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly vegetationMesh: THREE.InstancedMesh | null = null;
  private readonly rockGeometry: THREE.DodecahedronGeometry;
  private readonly rockMaterial: THREE.MeshStandardMaterial;
  private readonly rockMesh: THREE.InstancedMesh;
  private readonly assetPlacements: PlanetAssetPlacement[];
  private readonly assetInstanceMeshes: THREE.InstancedMesh[] = [];
  private readonly sphereMacroNoise: (x: number, y: number) => number;
  private readonly sphereMidNoise: (x: number, y: number) => number;
  private readonly sphereFineNoise: (x: number, y: number) => number;
  private readonly sphereMaskNoise: (x: number, y: number) => number;
  private readonly landscapeAngle: number;
  private readonly debugSummary: {
    archetype: string;
    propSetCount: number;
    landmarkSetCount: number;
    plannedAssetInstances: number;
    loadedAssetBatches: number;
    radius: number;
  };
  private disposed = false;
  private readonly dummy = new THREE.Object3D();

  constructor(
    private readonly manifest: PlanetSurfaceManifest,
    private readonly heightSampler: TerrainHeightSampler,
  ) {
    const isLow = Settings.graphicsMode === 'LOW';
    const levelDesign = manifest.levelDesign;
    const landscapeRng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:sphere-landscape`));
    this.sphereMacroNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:sphere-macro`)));
    this.sphereMidNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:sphere-mid`)));
    this.sphereFineNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:sphere-fine`)));
    this.sphereMaskNoise = createNoise2D(createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:sphere-mask`)));
    this.landscapeAngle = landscapeRng() * Math.PI * 2;
    this.radius = isLow ? 18000 : 26000;
    this.heightScale = manifest.biome === 'gas' ? 10.5 : 8.4;

    const widthSegments = isLow ? levelDesign.lodBudget.surfaceSegmentsLow : levelDesign.lodBudget.surfaceSegmentsHigh;
    const heightSegments = Math.floor(widthSegments / 2);
    const textureWidth = isLow ? levelDesign.lodBudget.textureSizeLow : levelDesign.lodBudget.textureSizeHigh;
    this.surfaceTexture = this.createSurfaceTexture(textureWidth, Math.floor(textureWidth / 2));
    this.surfaceGeometry = this.createSurfaceGeometry(widthSegments, heightSegments);
    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      map: this.surfaceTexture,
      color: 0xffffff,
      roughness: levelDesign.surfaceMaterials.groundRoughness,
      metalness: 0.02,
      flatShading: false,
      emissive: levelDesign.palette.accent,
      emissiveIntensity: levelDesign.surfaceMaterials.emissiveIntensity,
    });
    this.surfaceMesh = new THREE.Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.frustumCulled = false;
    this.group.add(this.surfaceMesh);

    if (manifest.biome !== 'gas' && manifest.biome !== 'volcanic') {
      const waterRadius = this.radius + manifest.waterLevel * this.heightScale + 10;
      this.waterGeometry = new THREE.SphereGeometry(waterRadius, isLow ? 64 : 112, isLow ? 32 : 56);
      this.waterBumpTexture = this.createWaterBumpTexture(isLow ? 192 : 384);
      this.waterMaterial = new THREE.MeshPhysicalMaterial({
        color: manifest.waterColor,
        emissive: manifest.waterColor,
        emissiveIntensity: 0.015,
        transparent: true,
        opacity: levelDesign.surfaceMaterials.waterOpacity,
        roughness: manifest.biome === 'oceanic' ? 0.32 : manifest.biome === 'ice' ? 0.44 : 0.38,
        metalness: 0.02,
        clearcoat: manifest.biome === 'oceanic' ? 0.38 : manifest.biome === 'ice' ? 0.22 : 0.3,
        clearcoatRoughness: 0.3,
        ior: 1.333,
        reflectivity: 0.32,
        bumpMap: this.waterBumpTexture,
        bumpScale: manifest.biome === 'oceanic' ? 1.2 : manifest.biome === 'ice' ? 0.4 : 0.8,
        depthWrite: false,
      });
      this.waterMesh = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
      this.waterMesh.frustumCulled = false;
      this.group.add(this.waterMesh);
    }

    this.cloudTexture = createSpaceCloudTexture(manifest);
    this.cloudGeometry = new THREE.SphereGeometry(this.radius + levelDesign.weatherSet.cloudShellOffset, isLow ? 64 : 128, isLow ? 32 : 64);
    this.cloudMaterial = new THREE.MeshStandardMaterial({
      map: this.cloudTexture,
      color: 0xffffff,
      emissive: manifest.skyProfile.cloudColor,
      emissiveIntensity: 0.035,
      transparent: true,
      opacity: levelDesign.surfaceMaterials.cloudOpacity,
      roughness: 1,
      metalness: 0,
      alphaTest: 0.008,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.cloudMesh = new THREE.Mesh(this.cloudGeometry, this.cloudMaterial);
    this.cloudMesh.frustumCulled = false;
    this.group.add(this.cloudMesh);

    const rockCount = Math.floor((isLow ? 180 : 420) * Math.max(0.45, levelDesign.propSets[0]?.density ?? 1));
    this.rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    this.rockMaterial = new THREE.MeshStandardMaterial({ color: manifest.assetProfile.rockColor, roughness: 0.94, flatShading: true });
    this.rockMesh = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, rockCount);
    this.rockMesh.count = this.placeRocks(rockCount);
    this.rockMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.rockMesh);

    if (manifest.assetProfile.vegetationShape !== 'none') {
      const vegetationCount = Math.floor((isLow ? 180 : 620) * manifest.vegetationDensity * manifest.assetProfile.scatterDensity);
      this.vegetationGeometry = this.createVegetationGeometry();
      this.vegetationMaterial = new THREE.MeshStandardMaterial({
        color: manifest.assetProfile.vegetationColor,
        roughness: 0.86,
        flatShading: true,
      });
      this.vegetationMesh = new THREE.InstancedMesh(this.vegetationGeometry, this.vegetationMaterial, Math.max(1, vegetationCount));
      this.vegetationMesh.count = this.placeVegetation(vegetationCount);
      this.vegetationMesh.instanceMatrix.needsUpdate = true;
      this.group.add(this.vegetationMesh);
    }

    this.assetPlacements = this.createAssetPlacements(isLow);
    this.debugSummary = {
      archetype: levelDesign.archetype,
      propSetCount: levelDesign.propSets.length,
      landmarkSetCount: levelDesign.landmarkSets.length,
      plannedAssetInstances: this.assetPlacements.length,
      loadedAssetBatches: 0,
      radius: this.radius,
    };
    void this.populateAssetPlacements();
  }

  public update(elapsed: number) {
    this.cloudMesh.rotation.y = elapsed * this.manifest.levelDesign.weatherSet.cloudSpeed;
    if (this.waterBumpTexture) {
      this.waterBumpTexture.offset.set((elapsed * 0.0024) % 1, (elapsed * 0.0011) % 1);
    }
  }

  public getEntryPosition(altitude: number): THREE.Vector3 {
    return new THREE.Vector3(0, this.radius + altitude, 0);
  }

  public getDebugSummary() {
    return { ...this.debugSummary };
  }

  public sampleAtPosition(position: THREE.Vector3): SphericalSurfaceSample {
    const normal = position.lengthSq() > 0.0001
      ? position.clone().normalize()
      : UP.clone();
    const terrainHeight = this.sampleTerrainHeight(normal);
    const surfaceRadius = this.radius + terrainHeight * this.heightScale;
    return {
      normal,
      surfaceRadius,
      terrainHeight,
      altitude: position.length() - surfaceRadius,
    };
  }

  public dispose() {
    this.disposed = true;
    this.group.remove(this.surfaceMesh, this.cloudMesh, this.rockMesh);
    this.surfaceGeometry.dispose();
    this.surfaceMaterial.dispose();
    this.surfaceTexture.dispose();
    this.cloudGeometry.dispose();
    this.cloudMaterial.dispose();
    this.cloudTexture.dispose();
    this.rockGeometry.dispose();
    this.rockMaterial.dispose();

    if (this.waterMesh && this.waterGeometry && this.waterMaterial) {
      this.group.remove(this.waterMesh);
      this.waterGeometry.dispose();
      this.waterMaterial.dispose();
      this.waterBumpTexture?.dispose();
    }

    if (this.vegetationMesh && this.vegetationGeometry && this.vegetationMaterial) {
      this.group.remove(this.vegetationMesh);
      this.vegetationGeometry.dispose();
      this.vegetationMaterial.dispose();
    }

    for (const mesh of this.assetInstanceMeshes) {
      this.group.remove(mesh);
      this.disposeMaterial(mesh.material);
    }
  }

  private createSurfaceGeometry(widthSegments: number, heightSegments: number): THREE.SphereGeometry {
    const geometry = new THREE.SphereGeometry(this.radius, widthSegments, heightSegments);
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
      normal.fromBufferAttribute(positions, i).normalize();
      const terrainHeight = this.sampleTerrainHeight(normal);
      const surfaceRadius = this.radius + terrainHeight * this.heightScale;
      positions.setXYZ(i, normal.x * surfaceRadius, normal.y * surfaceRadius, normal.z * surfaceRadius);

    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private createSurfaceTexture(width: number, height: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const imageData = ctx.createImageData(width, height);
    const normal = new THREE.Vector3();
    let offset = 0;

    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      const latitude = (0.5 - v) * Math.PI;
      const cosLat = Math.cos(latitude);
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        const longitude = (u - 0.5) * Math.PI * 2;
        normal.set(
          Math.cos(longitude) * cosLat,
          Math.sin(latitude),
          Math.sin(longitude) * cosLat,
        );

        const terrainHeight = this.sampleTerrainHeight(normal);
        const color = colorForTerrainHeight(this.manifest, terrainHeight);
        const albedoNoise = this.sphereFineNoise(normal.x * 14 + normal.y * 2.6, normal.z * 14 - normal.y * 3.1);
        const shade = 0.9 + albedoNoise * 0.1;
        imageData.data[offset++] = Math.min(255, Math.floor(color.r * 255 * shade));
        imageData.data[offset++] = Math.min(255, Math.floor(color.g * 255 * shade));
        imageData.data[offset++] = Math.min(255, Math.floor(color.b * 255 * shade));
        imageData.data[offset++] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  private createWaterBumpTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    const imageData = ctx.createImageData(size, size);
    let offset = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const primary = Math.sin(x * 0.12 + y * 0.045);
        const crossing = Math.sin(x * 0.035 - y * 0.11 + Math.sin(y * 0.025) * 2.2);
        const ripples = Math.sin((x + y) * 0.19) * 0.34;
        const value = Math.max(0, Math.min(255, Math.round(128 + primary * 30 + crossing * 22 + ripples * 16)));
        imageData.data[offset++] = value;
        imageData.data[offset++] = value;
        imageData.data[offset++] = value;
        imageData.data[offset++] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(14, 7);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  }

  private createVegetationGeometry(): THREE.BufferGeometry {
    switch (this.manifest.assetProfile.vegetationShape) {
      case 'broad':
        return new THREE.ConeGeometry(0.36, 1, 7);
      case 'cactus':
        return new THREE.CylinderGeometry(0.2, 0.25, 1, 6);
      case 'crystal':
        return new THREE.OctahedronGeometry(0.52, 0);
      case 'spire':
        return new THREE.ConeGeometry(0.24, 1, 5);
      case 'needle':
      default:
        return new THREE.ConeGeometry(0.16, 1, 5);
    }
  }

  private createAssetPlacements(isLow: boolean): PlanetAssetPlacement[] {
    const rng = createSeededRandom(hashString(`${this.manifest.planetId}:${this.manifest.seed}:planet-level-layout`));
    const placements: PlanetAssetPlacement[] = [];
    const propBudget = isLow
      ? this.manifest.levelDesign.lodBudget.propInstancesLow
      : this.manifest.levelDesign.lodBudget.propInstancesHigh;
    const landmarkBudget = isLow
      ? this.manifest.levelDesign.lodBudget.landmarkInstancesLow
      : this.manifest.levelDesign.lodBudget.landmarkInstancesHigh;

    for (const propSet of this.manifest.levelDesign.propSets) {
      if (propSet.assetPaths.length === 0) continue;
      const targetCount = Math.floor(propBudget * propSet.density / Math.max(1, this.manifest.levelDesign.propSets.length));
      this.createPlacementsForAssets(placements, rng, propSet.assetPaths, targetCount, propSet.kind, propSet.scaleMin, propSet.scaleMax, propSet.minHeightOffset, propSet.maxHeightOffset, propSet.colorTint);
    }

    for (const landmarkSet of this.manifest.levelDesign.landmarkSets) {
      const count = Math.min(landmarkBudget, landmarkSet.count);
      this.createPlacementsForAssets(placements, rng, landmarkSet.assetPaths, count, 'landmark', landmarkSet.scaleMin, landmarkSet.scaleMax, -9999, 9999);
    }

    return placements;
  }

  private createPlacementsForAssets(
    placements: PlanetAssetPlacement[],
    rng: () => number,
    assetPaths: string[],
    targetCount: number,
    kind: PlanetPropKind,
    scaleMin: number,
    scaleMax: number,
    minHeightOffset: number,
    maxHeightOffset: number,
    colorTint?: number,
  ) {
    let placed = 0;
    const maxAttempts = Math.max(80, targetCount * 5);
    for (let i = 0; i < maxAttempts && placed < targetCount; i++) {
      const normal = this.randomNormal(rng);
      const terrainHeight = this.sampleTerrainHeight(normal);
      const heightOffset = terrainHeight - this.manifest.waterLevel;
      if (heightOffset < minHeightOffset || heightOffset > maxHeightOffset) continue;

      const assetPath = assetPaths[Math.floor(rng() * assetPaths.length) % assetPaths.length];
      placements.push({
        assetPath,
        kind,
        normal,
        surfaceRadius: this.radius + terrainHeight * this.heightScale,
        scale: scaleMin + rng() * (scaleMax - scaleMin),
        rotation: rng() * Math.PI * 2,
        colorTint,
      });
      placed++;
    }
  }

  private async populateAssetPlacements() {
    const grouped = new Map<string, PlanetAssetPlacement[]>();
    for (const placement of this.assetPlacements) {
      const group = grouped.get(placement.assetPath) || [];
      group.push(placement);
      grouped.set(placement.assetPath, group);
    }

    for (const [assetPath, placements] of grouped.entries()) {
      const prototype = await planetEnvironmentAssetLoader.loadPrototype(assetPath);
      if (!prototype || this.disposed) continue;

      const material = this.cloneMaterial(prototype.material, placements[0]?.colorTint);
      const mesh = new THREE.InstancedMesh(prototype.geometry, material, placements.length);
      mesh.frustumCulled = false;

      for (let i = 0; i < placements.length; i++) {
        const placement = placements[i];
        const baseScale = placement.kind === 'landmark' ? 32 : placement.kind === 'rock' ? 18 : 24;
        const scale = placement.scale * baseScale;
        this.dummy.position.copy(placement.normal).multiplyScalar(placement.surfaceRadius + scale * 0.28);
        this.dummy.quaternion.setFromUnitVectors(UP, placement.normal);
        this.dummy.rotateY(placement.rotation);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.assetInstanceMeshes.push(mesh);
      this.group.add(mesh);
      this.debugSummary.loadedAssetBatches = this.assetInstanceMeshes.length;
    }
  }

  private cloneMaterial(material: THREE.Material | THREE.Material[], tint?: number): THREE.Material | THREE.Material[] {
    if (Array.isArray(material)) {
      return material.map((item) => this.cloneMaterial(item, tint) as THREE.Material);
    }

    const cloned = material.clone();
    const colorMaterial = cloned as THREE.Material & { color?: THREE.Color };
    if (tint !== undefined && colorMaterial.color) {
      colorMaterial.color.lerp(new THREE.Color(tint), 0.42);
    }
    return cloned;
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
      return;
    }
    material.dispose();
  }

  private placeVegetation(maxCount: number): number {
    if (maxCount <= 0) return 0;
    const rng = createSeededRandom(hashString(`${this.manifest.planetId}:${this.manifest.seed}:sphere-vegetation`));
    let placed = 0;

    for (let i = 0; i < maxCount * 2 && placed < maxCount; i++) {
      const normal = this.randomNormal(rng);
      const terrainHeight = this.sampleTerrainHeight(normal);
      if (terrainHeight < this.manifest.waterLevel + 4 && this.manifest.biome !== 'gas') continue;

      const surfaceRadius = this.radius + terrainHeight * this.heightScale;
      const width = (18 + rng() * 28) * this.manifest.assetProfile.objectScale;
      const height = (70 + rng() * 150) * this.manifest.assetProfile.objectScale;
      this.dummy.position.copy(normal).multiplyScalar(surfaceRadius + height * 0.5);
      this.dummy.quaternion.setFromUnitVectors(UP, normal);
      this.dummy.rotateY(rng() * Math.PI * 2);
      this.dummy.scale.set(width, height, width);
      this.dummy.updateMatrix();
      this.vegetationMesh?.setMatrixAt(placed, this.dummy.matrix);
      placed++;
    }

    return placed;
  }

  private placeRocks(maxCount: number): number {
    const rng = createSeededRandom(hashString(`${this.manifest.planetId}:${this.manifest.seed}:sphere-rocks`));
    for (let i = 0; i < maxCount; i++) {
      const normal = this.randomNormal(rng);
      const terrainHeight = this.sampleTerrainHeight(normal);
      const surfaceRadius = this.radius + terrainHeight * this.heightScale;
      const scale = (28 + rng() * 84) * this.manifest.assetProfile.objectScale;
      this.dummy.position.copy(normal).multiplyScalar(surfaceRadius + scale * 0.45);
      this.dummy.quaternion.setFromUnitVectors(UP, normal);
      this.dummy.rotateY(rng() * Math.PI * 2);
      this.dummy.scale.set(scale, scale * (0.45 + rng()), scale);
      this.dummy.updateMatrix();
      this.rockMesh.setMatrixAt(i, this.dummy.matrix);
    }
    return maxCount;
  }

  private randomNormal(rng: () => number): THREE.Vector3 {
    const z = rng() * 2 - 1;
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(Math.cos(angle) * r, z, Math.sin(angle) * r);
  }

  private sampleTerrainHeight(normal: THREE.Vector3): number {
    const longitude = Math.atan2(normal.z, normal.x);
    const latitude = Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1));
    const u = longitude / Math.PI;
    const v = latitude / (Math.PI * 0.5);
    const nx = normal.x;
    const ny = normal.y;
    const nz = normal.z;
    const macro = (
      this.sphereMacroNoise(nx * 1.4 + this.manifest.seed * 0.0001, nz * 1.4 - ny * 0.45) +
      this.sphereMacroNoise(u * 1.1 + 19.7, v * 0.9 - 8.3)
    ) * 0.5;
    const mid = this.sphereMidNoise(nx * 4.2 + ny * 0.7, nz * 4.2 - this.manifest.seed * 0.00013);
    const fine = this.sphereFineNoise(u * 18.0 + this.manifest.seed * 0.00031, v * 10.0 - 4.2);
    const mask = this.sphereMaskNoise(nx * 2.2 - 12.4, nz * 2.2 + ny * 0.9);
    const ridge = Math.pow(1 - Math.abs(this.sphereMidNoise(nx * 6.0 + 31.4, nz * 6.0 - ny * 1.2)), 2.1);
    const bandAxis = Math.cos(this.landscapeAngle) * u + Math.sin(this.landscapeAngle) * v;
    const bands = Math.sin(bandAxis * Math.PI * 8 + this.manifest.seed * 0.00001);
    const dunes = Math.sin(bandAxis * Math.PI * 16 + mid * 1.8) * 0.32 + Math.sin(bandAxis * Math.PI * 31) * 0.1;
    const islandMask = THREE.MathUtils.smoothstep(mask, -0.18, 0.58);
    const canyonCut = THREE.MathUtils.smoothstep(Math.abs(mask), 0.58, 0.92);
    const pole = Math.abs(ny);

    let normalized: number;
    switch (this.manifest.levelDesign.archetype) {
      case 'oceanic':
        normalized = (macro * 0.42 + mid * 0.18 + fine * 0.04) * islandMask - 0.2;
        break;
      case 'forest':
        normalized = macro * 0.72 + mid * 0.2 + ridge * 0.18 + fine * 0.06;
        break;
      case 'desert':
        normalized = macro * 0.28 + dunes * 0.74 - canyonCut * 0.32 + fine * 0.03;
        break;
      case 'volcanic':
        normalized = macro * 0.48 + ridge * 0.78 - canyonCut * 0.2 + fine * 0.07;
        break;
      case 'ice': {
        const shelves = Math.round((macro * 0.7 + mid * 0.24) * 7) / 7;
        normalized = shelves * 0.82 + pole * 0.18 + fine * 0.04;
        break;
      }
      case 'rocky':
        normalized = macro * 0.44 + ridge * 0.34 - canyonCut * 0.28 + this.craterAt(normal) * 0.46 + fine * 0.04;
        break;
      case 'gas':
        normalized = bands * 0.34 + macro * 0.12 + mid * 0.08 + 0.24;
        break;
      default: {
        const scale = this.radius * 0.22;
        return this.heightSampler(
          longitude * scale + this.manifest.seed * 0.013,
          latitude * scale + this.manifest.seed * 0.007,
        );
      }
    }

    return normalized * this.manifest.terrainAmplitude * this.getLandscapeAmplitudeMultiplier();
  }

  private craterAt(normal: THREE.Vector3): number {
    const cells = 9;
    const x = Math.floor((normal.x * 0.5 + 0.5) * cells);
    const y = Math.floor((normal.y * 0.5 + 0.5) * cells);
    const z = Math.floor((normal.z * 0.5 + 0.5) * cells);
    const rng = createSeededRandom(hashString(`${this.manifest.seed}:sphere-crater:${x}:${y}:${z}`));
    if (rng() < 0.45) return 0;

    const center = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    const angularDist = Math.acos(THREE.MathUtils.clamp(normal.dot(center), -1, 1));
    const radius = 0.055 + rng() * 0.08;
    if (angularDist > radius * 1.7) return 0;

    const t = angularDist / radius;
    const bowl = 1 - THREE.MathUtils.smoothstep(t, 0.08, 0.95);
    const rim = THREE.MathUtils.smoothstep(t, 0.72, 1.0) * (1 - THREE.MathUtils.smoothstep(t, 1.0, 1.7));
    return rim * 0.45 - bowl * 0.85;
  }

  private getLandscapeAmplitudeMultiplier(): number {
    switch (this.manifest.levelDesign.archetype) {
      case 'volcanic':
        return 2.25;
      case 'rocky':
        return 1.95;
      case 'desert':
        return 1.55;
      case 'forest':
        return 1.45;
      case 'ice':
        return 1.34;
      case 'oceanic':
        return 1.65;
      case 'gas':
        return 1.1;
      default:
        return 1;
    }
  }
}
