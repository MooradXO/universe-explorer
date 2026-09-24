import * as THREE from 'three';
import { Settings } from '../core/Settings';

interface EngineNode {
  plumeA: THREE.Mesh;
  plumeB: THREE.Mesh;
  core: THREE.Mesh;
  idle: THREE.Mesh;
  halo: THREE.Sprite;
  size: number;
}

const textureLoader = new THREE.TextureLoader();
let plumeGeometry: THREE.PlaneGeometry | null = null;
let coreGeometry: THREE.PlaneGeometry | null = null;
let plumeTexture: THREE.Texture | null = null;
let coreTexture: THREE.Texture | null = null;
let idleTexture: THREE.Texture | null = null;
let haloTexture: THREE.Texture | null = null;

function prepareTexture(texture: THREE.Texture, rotate = false) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (rotate) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  return texture;
}

function getPlumeTexture() {
  if (!plumeTexture) {
    plumeTexture = prepareTexture(textureLoader.load('/textures/vfx/thruster_plume.png'), true);
  }
  return plumeTexture;
}

function getCoreTexture() {
  if (!coreTexture) {
    coreTexture = prepareTexture(textureLoader.load('/textures/vfx/thruster_core.png'));
  }
  return coreTexture;
}

function getIdleTexture() {
  if (!idleTexture) {
    idleTexture = prepareTexture(textureLoader.load('/textures/vfx/thruster_idle.png'));
  }
  return idleTexture;
}

function getPlumeGeometry() {
  if (!plumeGeometry) {
    plumeGeometry = new THREE.PlaneGeometry(1, 1);
    plumeGeometry.rotateX(Math.PI / 2);
    plumeGeometry.translate(0, 0, 0.5);
  }
  return plumeGeometry;
}

function getCoreGeometry() {
  if (!coreGeometry) {
    coreGeometry = new THREE.PlaneGeometry(1, 1);
  }
  return coreGeometry;
}

function getHaloTexture() {
  if (!haloTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.18, 'rgba(100,220,255,0.55)');
    gradient.addColorStop(0.45, 'rgba(20,90,255,0.16)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    haloTexture = new THREE.CanvasTexture(canvas);
  }
  return haloTexture;
}

export class ShipEngineVFX {
  private group = new THREE.Group();
  private nodes: EngineNode[] = [];
  private plumeMaterial: THREE.MeshBasicMaterial;
  private coreMaterial: THREE.MeshBasicMaterial;
  private idleMaterial: THREE.MeshBasicMaterial;
  private haloMaterial: THREE.SpriteMaterial;
  private isLow = Settings.graphicsMode === 'LOW';

  constructor(
    private parent: THREE.Object3D,
    nozzles: readonly (readonly [number, number, number])[],
    colorHex: number,
    nozzleSizes: readonly number[] = [],
    previewLow?:boolean
  ) {
    if(previewLow!==undefined)this.isLow=previewLow;
    this.plumeMaterial = new THREE.MeshBasicMaterial({
      map: getPlumeTexture(),
      color: colorHex,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      alphaTest: 0.01,
    });
    this.coreMaterial = new THREE.MeshBasicMaterial({
      map: getCoreTexture(),
      color: colorHex,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      alphaTest: 0.01,
    });
    this.idleMaterial = new THREE.MeshBasicMaterial({
      map: getIdleTexture(),
      color: colorHex,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      alphaTest: 0.01,
    });
    this.haloMaterial = new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color: colorHex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    for (let i = 0; i < nozzles.length; i += 1) {
      const nozzle = nozzles[i];
      const size = Math.max(0.2, nozzleSizes[i] ?? 1);
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(nozzle[0], nozzle[1], nozzle[2]);

      const plumeA = new THREE.Mesh(getPlumeGeometry(), this.plumeMaterial);
      const plumeB = new THREE.Mesh(getPlumeGeometry(), this.plumeMaterial);
      const core = new THREE.Mesh(getCoreGeometry(), this.coreMaterial);
      const idle = new THREE.Mesh(getCoreGeometry(), this.idleMaterial);
      const halo = new THREE.Sprite(this.haloMaterial);

      plumeA.position.z = 2;
      plumeB.position.z = 2;
      plumeB.rotation.z = Math.PI / 2;
      plumeA.scale.set(6, 1, 16);
      plumeB.scale.set(6, 1, 16);
      core.position.z = 1.2;
      idle.position.z = 1.4;
      core.scale.set(5.5, 5.5, 1);
      idle.scale.set(8, 8, 1);
      halo.position.z = 2;
      halo.scale.set(16, 16, 1);

      nodeGroup.add(plumeA, plumeB);
      nodeGroup.add(core);
      nodeGroup.add(idle);
      if (!this.isLow) nodeGroup.add(halo);

      this.group.add(nodeGroup);
      this.nodes.push({ plumeA, plumeB, core, idle, halo, size });
    }

    this.parent.add(this.group);
  }

  public update(dt: number, elapsed: number, speed: number, isBoosting: boolean, colorHex: number, cruise = 0) {
    if (this.plumeMaterial.color.getHex() !== colorHex) {
      this.plumeMaterial.color.setHex(colorHex);
      this.coreMaterial.color.setHex(colorHex);
      this.idleMaterial.color.setHex(colorHex);
      this.haloMaterial.color.setHex(colorHex);
    }

    const speedRatio = Math.min(1, speed / 900);
    const moving = speed > 8;
    const idlePulse = 0.5 + Math.sin(elapsed * 7.5) * 0.5;
    const flicker = 0.88 + Math.sin(elapsed * 67.0) * 0.09 + Math.sin(elapsed * 143.0) * 0.035;

    const targetLength = cruise > .01 ? 100 + cruise * 85 : isBoosting
      ? 118 + idlePulse * 24
      : moving
        ? 38 + speedRatio * 58
        : 16 + idlePulse * 7;
    const targetWidth = cruise > .01 ? 11 + cruise * 3 : isBoosting
      ? 16
      : moving
        ? 7 + speedRatio * 4
        : 3.6 + idlePulse * 1.2;
    const plumeOpacity = cruise > .01 ? .62 + cruise * .16 : isBoosting
      ? 0.74
      : moving
        ? 0.42 + speedRatio * 0.2
        : 0.17 + idlePulse * 0.08;
    const coreScale = cruise > .01 ? 8.5 + cruise * 1.5 : isBoosting ? 9.5 : moving ? 6.8 + speedRatio * 2 : 4.8 + idlePulse * 0.9;
    const idleScale = coreScale * (isBoosting ? 1.45 : moving ? 1.35 : 1.28);
    const haloScale = isBoosting ? 38 : moving ? 22 + speedRatio * 10 : 13 + idlePulse * 4;

    this.plumeMaterial.opacity = THREE.MathUtils.lerp(this.plumeMaterial.opacity, plumeOpacity, dt * 9);
    this.coreMaterial.opacity = THREE.MathUtils.lerp(this.coreMaterial.opacity, isBoosting ? 0.78 : 0.38 + idlePulse * 0.16, dt * 8);
    this.idleMaterial.opacity = THREE.MathUtils.lerp(this.idleMaterial.opacity, isBoosting ? 0.28 : 0.12 + idlePulse * 0.08, dt * 8);
    this.haloMaterial.opacity = THREE.MathUtils.lerp(this.haloMaterial.opacity, this.isLow ? 0 : plumeOpacity * 0.42, dt * 7);

    for (const node of this.nodes) {
      const width = THREE.MathUtils.lerp(node.plumeA.scale.x, targetWidth * node.size * flicker, dt * 14);
      const length = THREE.MathUtils.lerp(node.plumeA.scale.z, targetLength * node.size * flicker, dt * 14);
      node.plumeA.scale.set(width, 1, length);
      node.plumeB.scale.set(width * 0.85, 1, length * 0.92);
      node.core.scale.setScalar(THREE.MathUtils.lerp(node.core.scale.x, coreScale * node.size * flicker, dt * 12));
      node.idle.scale.setScalar(THREE.MathUtils.lerp(node.idle.scale.x, idleScale * node.size * flicker, dt * 10));
      node.halo.scale.setScalar(THREE.MathUtils.lerp(node.halo.scale.x, haloScale * node.size * flicker, dt * 9));
    }
  }

  public dispose() {
    this.parent.remove(this.group);
    this.group.clear();
    this.nodes = [];
    this.plumeMaterial.dispose();
    this.coreMaterial.dispose();
    this.idleMaterial.dispose();
    this.haloMaterial.dispose();
  }
  public snapshot() { return { plumeLength: this.nodes[0]?.plumeA.scale.z ?? 0, opacity: this.plumeMaterial.opacity }; }
}
