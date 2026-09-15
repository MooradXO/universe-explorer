import * as THREE from 'three';
import { Settings } from '../core/Settings';
import { PlanetSurfaceManifest } from './PlanetSurfaceManifest';
import { colorForTerrainHeight, TerrainHeightSampler } from './TerrainChunk';

export class PlanetHorizonSurface {
  public readonly group = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly localXZ: { x: number; z: number }[] = [];
  private readonly size: number;
  private readonly segments: number;
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;

  constructor(
    private readonly manifest: PlanetSurfaceManifest,
    private readonly heightSampler: TerrainHeightSampler,
  ) {
    const isLow = Settings.graphicsMode === 'LOW';
    this.size = isLow ? 22000 : 34000;
    this.segments = isLow ? 56 : 92;
    this.geometry = this.createGeometry();
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
      vertexColors: true,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  public update(playerLocalPosition: THREE.Vector3) {
    const snap = 900;
    const centerX = Math.round(playerLocalPosition.x / snap) * snap;
    const centerZ = Math.round(playerLocalPosition.z / snap) * snap;
    if (centerX === this.lastCenterX && centerZ === this.lastCenterZ) return;

    this.lastCenterX = centerX;
    this.lastCenterZ = centerZ;
    this.group.position.set(centerX, 0, centerZ);

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const farStart = this.size * 0.52;

    for (let i = 0; i < this.localXZ.length; i++) {
      const local = this.localXZ[i];
      const worldX = centerX + local.x;
      const worldZ = centerZ + local.z;
      const dist = Math.sqrt(local.x * local.x + local.z * local.z);
      const fade = THREE.MathUtils.clamp((dist - farStart) / (this.size * 0.5 - farStart), 0, 1);
      const sampled = this.heightSampler(worldX, worldZ);
      const curveDrop = (dist * dist) / (2 * this.manifest.terrainProfile.curvatureRadius) * this.manifest.terrainProfile.horizonDrop;
      const softened = THREE.MathUtils.lerp(sampled, this.manifest.waterLevel - 18, fade * 0.24);
      positions.setY(i, softened - 3 - curveDrop);

      const color = colorForTerrainHeight(this.manifest, softened);
      const haze = new THREE.Color(this.manifest.skyProfile.fogColor);
      color.lerp(haze, fade * 0.22);
      colors.setXYZ(i, color.r, color.g, color.b);
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  public dispose() {
    this.group.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  private createGeometry(): THREE.BufferGeometry {
    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const half = this.size / 2;
    const step = this.size / this.segments;

    for (let z = 0; z <= this.segments; z++) {
      for (let x = 0; x <= this.segments; x++) {
        const localX = -half + x * step;
        const localZ = -half + z * step;
        this.localXZ.push({ x: localX, z: localZ });
        vertices.push(localX, 0, localZ);
        colors.push(1, 1, 1);
      }
    }

    for (let z = 0; z < this.segments; z++) {
      for (let x = 0; x < this.segments; x++) {
        const a = z * (this.segments + 1) + x;
        const b = a + 1;
        const c = a + this.segments + 1;
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
}
