import * as THREE from 'three';
import { PlanetSurfaceManifest, createSeededRandom, hashString } from './PlanetSurfaceManifest';

function colorToCss(colorHex: number): string {
  return `#${new THREE.Color(colorHex).getHexString()}`;
}

function jitterColor(colorHex: number, amount: number): string {
  const color = new THREE.Color(colorHex).addScalar(amount);
  return colorToCss(color.getHex());
}

export function createSpacePlanetTexture(manifest: PlanetSurfaceManifest, baseColorHex: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const rng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:space-surface`));
  ctx.fillStyle = colorToCss(baseColorHex);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (manifest.biome === 'gas') {
    for (let y = 0; y < canvas.height; y++) {
      const shade = Math.sin(y * 0.055 + rng() * 0.8) * 0.12 + Math.cos(y * 0.021) * 0.08;
      ctx.fillStyle = jitterColor(baseColorHex, shade);
      ctx.fillRect(0, y, canvas.width, 1);
    }
    for (let s = 0; s < 3; s++) {
      const spotX = canvas.width * (0.25 + rng() * 0.55);
      const spotY = canvas.height * (0.28 + rng() * 0.45);
      const rx = 22 + rng() * 30;
      const ry = 10 + rng() * 16;
      const grad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, rx);
      grad.addColorStop(0, 'rgba(255,205,128,0.45)');
      grad.addColorStop(1, 'rgba(255,205,128,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(spotX, spotY, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const oceanLike = manifest.biome === 'forest' || manifest.biome === 'oceanic' || manifest.biome === 'ice';
    if (oceanLike) {
      ctx.fillStyle = colorToCss(manifest.waterColor);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const landCount = 6 + Math.floor(rng() * 6);
    for (let land = 0; land < landCount; land++) {
      const cx = rng() * canvas.width;
      const cy = canvas.height * (0.16 + rng() * 0.68);
      const rx = 28 + rng() * 68;
      const ry = 16 + rng() * 42;
      ctx.fillStyle = colorToCss(manifest.terrainColor);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = jitterColor(manifest.surfaceTint, (rng() - 0.5) * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx + (rng() - 0.5) * rx * 0.45, cy + (rng() - 0.5) * ry * 0.45, rx * 0.36, ry * 0.38, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    if (manifest.biome === 'volcanic') {
      ctx.strokeStyle = '#ff3b16';
      ctx.shadowColor = '#ff6b22';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      for (let c = 0; c < 14; c++) {
        ctx.beginPath();
        let x = rng() * canvas.width;
        let y = rng() * canvas.height;
        ctx.moveTo(x, y);
        for (let step = 0; step < 5; step++) {
          x += (rng() - 0.5) * 54;
          y += (rng() - 0.5) * 34;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    if (manifest.biome === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillRect(0, 0, canvas.width, 18);
      ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createSpaceCloudTexture(manifest: PlanetSurfaceManifest): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const rng = createSeededRandom(hashString(`${manifest.planetId}:${manifest.seed}:space-clouds`));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cloud = new THREE.Color(manifest.skyProfile.cloudColor);
  const alpha = manifest.weatherProfile.cloudCoverage * (manifest.biome === 'gas' ? 0.55 : 0.72);

  ctx.fillStyle = `rgba(${Math.floor(cloud.r * 255)},${Math.floor(cloud.g * 255)},${Math.floor(cloud.b * 255)},${alpha})`;
  const count = 8 + Math.floor(manifest.weatherProfile.cloudCoverage * 16);
  for (let i = 0; i < count; i++) {
    const cx = rng() * canvas.width;
    const cy = canvas.height * (0.12 + rng() * 0.76);
    const cw = 18 + rng() * 48;
    const ch = 4 + rng() * 9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, ch, (rng() - 0.5) * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
