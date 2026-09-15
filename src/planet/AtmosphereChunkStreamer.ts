import * as THREE from 'three';
import { Settings } from '../core/Settings';
import { PlanetSurfaceManifest } from './PlanetSurfaceManifest';
import { TerrainChunk, TerrainHeightSampler } from './TerrainChunk';

export class AtmosphereChunkStreamer {
  public readonly group = new THREE.Group();
  private readonly chunks = new Map<string, TerrainChunk>();
  private readonly chunkSize = 400;
  private readonly radius: number;
  private readonly segments: number;
  private readonly maxVegetationPerChunk: number;
  private lastCenterKey = '';

  constructor(
    private readonly manifest: PlanetSurfaceManifest,
    private readonly heightSampler: TerrainHeightSampler,
  ) {
    const isLow = Settings.graphicsMode === 'LOW';
    const isMobile = navigator.maxTouchPoints > 0 || window.innerWidth <= 1024 || window.innerHeight <= 500;
    this.radius = isLow || isMobile ? 1 : 2;
    this.segments = isLow || isMobile ? 12 : 24;
    const baseVegetation = isLow || isMobile ? 36 : 96;
    this.maxVegetationPerChunk = Math.max(12, Math.floor(baseVegetation * manifest.assetProfile.scatterDensity));
  }

  public update(playerLocalPosition: THREE.Vector3, elapsed: number) {
    const centerX = Math.floor(playerLocalPosition.x / this.chunkSize);
    const centerZ = Math.floor(playerLocalPosition.z / this.chunkSize);
    const centerKey = `${centerX}:${centerZ}`;

    if (centerKey !== this.lastCenterKey) {
      this.lastCenterKey = centerKey;
      this.reconcileChunks(centerX, centerZ);
    }

    for (const chunk of this.chunks.values()) {
      chunk.update(elapsed, this.manifest.weatherProfile.windSpeed);
    }
  }

  public getHeightAt(x: number, z: number): number {
    return this.heightSampler(x, z);
  }

  public dispose() {
    for (const chunk of this.chunks.values()) {
      this.group.remove(chunk.group);
      chunk.dispose();
    }
    this.chunks.clear();
  }

  private reconcileChunks(centerX: number, centerZ: number) {
    const needed = new Set<string>();
    for (let z = centerZ - this.radius; z <= centerZ + this.radius; z++) {
      for (let x = centerX - this.radius; x <= centerX + this.radius; x++) {
        const key = `${x}:${z}`;
        needed.add(key);
        if (!this.chunks.has(key)) {
          const chunk = new TerrainChunk(
            this.manifest,
            x,
            z,
            this.chunkSize,
            this.segments,
            this.heightSampler,
            this.maxVegetationPerChunk,
          );
          this.group.add(chunk.group);
          this.chunks.set(key, chunk);
        }
      }
    }

    for (const [key, chunk] of this.chunks.entries()) {
      if (!needed.has(key)) {
        this.group.remove(chunk.group);
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }
}
