import * as THREE from 'three';
import { PlanetSurfaceManifest, createSeededRandom, hashString } from './PlanetSurfaceManifest';

function createSoftCloudTexture(manifest: PlanetSurfaceManifest): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const cloud = new THREE.Color(manifest.skyProfile.cloudColor);
  const r = Math.floor(cloud.r * 255);
  const g = Math.floor(cloud.g * 255);
  const b = Math.floor(cloud.b * 255);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 7; i++) {
    const cx = 42 + i * 28 + (i % 2) * 6;
    const cy = 58 + Math.sin(i) * 16;
    const radius = 34 + (i % 3) * 10;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.62)`);
    gradient.addColorStop(0.55, `rgba(${r},${g},${b},0.24)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class PlanetWeatherSystem {
  public readonly group = new THREE.Group();
  private readonly clouds: THREE.Sprite[] = [];
  private readonly cloudMaterials: THREE.SpriteMaterial[] = [];
  private readonly cloudTexture: THREE.CanvasTexture;
  private readonly rainGeometry: THREE.BufferGeometry | null = null;
  private readonly rainMaterial: THREE.LineBasicMaterial | null = null;
  private readonly rainLines: THREE.LineSegments | null = null;

  constructor(private readonly manifest: PlanetSurfaceManifest) {
    this.cloudTexture = createSoftCloudTexture(manifest);
    const rng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:atmo-clouds`));
    const cloudCount = manifest.biome === 'gas'
      ? 7
      : 3 + Math.floor(manifest.weatherProfile.cloudCoverage * 7);

    for (let i = 0; i < cloudCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.cloudTexture,
        color: manifest.skyProfile.cloudColor,
        transparent: true,
        opacity: manifest.biome === 'gas' ? 0.1 : 0.07 + manifest.weatherProfile.cloudCoverage * 0.1,
        depthWrite: false,
        depthTest: true,
      });
      const cloud = new THREE.Sprite(material);
      const angle = rng() * Math.PI * 2;
      const distance = 4600 + rng() * 7600;
      cloud.position.set(Math.cos(angle) * distance, 1900 + rng() * 1100, Math.sin(angle) * distance);
      cloud.scale.set(1400 + rng() * 2600, 320 + rng() * 760, 1);
      this.clouds.push(cloud);
      this.cloudMaterials.push(material);
      this.group.add(cloud);
    }

    if (manifest.weatherProfile.precipitation > 0.25) {
      const rainRng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:rain`));
      const drops = 180;
      const vertices: number[] = [];
      for (let i = 0; i < drops; i++) {
        const x = (rainRng() - 0.5) * 1400;
        const y = 120 + rainRng() * 900;
        const z = (rainRng() - 0.5) * 1400;
        vertices.push(x, y, z, x - 8, y - 46, z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0x88cfff,
        transparent: true,
        opacity: 0.26,
      });
      const lines = new THREE.LineSegments(geometry, material);
      this.rainGeometry = geometry;
      this.rainMaterial = material;
      this.rainLines = lines;
      this.group.add(lines);
    }
  }

  public update(elapsed: number, playerWorldPosition: THREE.Vector3) {
    this.group.position.x = playerWorldPosition.x;
    this.group.position.z = playerWorldPosition.z;

    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      cloud.position.x += Math.sin(elapsed * 0.07 + i) * this.manifest.weatherProfile.windSpeed * 0.08;
      cloud.position.z += Math.cos(elapsed * 0.05 + i) * this.manifest.weatherProfile.windSpeed * 0.08;
    }

    if (this.rainLines) {
      this.rainLines.position.y = -((elapsed * 220) % 160);
    }
  }

  public dispose() {
    for (const cloud of this.clouds) {
      this.group.remove(cloud);
    }
    for (const material of this.cloudMaterials) {
      material.dispose();
    }
    this.cloudTexture.dispose();
    if (this.rainLines && this.rainGeometry && this.rainMaterial) {
      this.group.remove(this.rainLines);
      this.rainGeometry.dispose();
      this.rainMaterial.dispose();
    }
  }
}
