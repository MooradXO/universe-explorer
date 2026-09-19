import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StarMapClient } from '../../catalog/StarMapClient';
import { selectStarTiles, StarTileCache } from '../../catalog/StarMapLod';
import type { MapVector, StarMapManifest, StarTileNode } from '../../catalog/StarMapData';

type Tile = { points: THREE.Points; ids: Uint32Array; positions: Float32Array };
export class StarMapView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.001, 5e6);
  readonly origin = new THREE.Vector3();
  readonly controls: OrbitControls;
  private nodes: Map<string, StarTileNode>;
  private cache: StarTileCache<Tile>;
  private material: THREE.ShaderMaterial;
  private elapsed = 1;
  private width = 1;
  private height = 1;
  private selected: { id: string; position: MapVector } | null = null;
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private projected = new THREE.Vector3();
  private pointerStart: [number, number] | null = null;
  private events = new AbortController();
  private maxTiles: number;
  private maxPoints: number;

  constructor(readonly manifest: StarMapManifest, private surface: HTMLElement, low: boolean,
    private onPick: (id: string) => void, private onMarker: (x: number, y: number, visible: boolean) => void) {
    this.nodes = new Map(manifest.nodes.map(node => [node.key, node]));
    this.maxTiles = low ? 20 : 32;
    this.maxPoints = low ? 45000 : 90000;
    this.scene.background = new THREE.Color(0x04070c);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(15, -23, 15);
    this.controls = new OrbitControls(this.camera, surface);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.minDistance = 0.03;
    this.controls.maxDistance = 4e6;
    this.controls.zoomSpeed = 1.6;
    this.material = new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 1 } },
      vertexShader: `attribute float magnitude; uniform float pixelScale; varying float lightness;
        void main() { lightness=clamp(1.15-magnitude*0.035,0.38,1.0);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          gl_PointSize=clamp(5.5-magnitude*0.2,2.2,7.0)*pixelScale; }`,
      fragmentShader: `varying float lightness; void main() {
        float r=length(gl_PointCoord-0.5)*2.0; if(r>1.0) discard;
        float glow=exp(-r*r*4.0)*(1.0-smoothstep(0.7,1.0,r));
        gl_FragColor=vec4(vec3(0.77,0.87,1.0)*lightness,glow); }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    this.cache = new StarTileCache<Tile>(low ? 48 : 80, async (key, signal) => {
      const tile = await StarMapClient.tile(key, manifest.datasetSha256, signal);
      const node = this.nodes.get(key)!;
      if (tile.ids.length !== node.points) throw new Error('Star tile count mismatch');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(tile.positions, 3));
      geometry.setAttribute('magnitude', new THREE.BufferAttribute(tile.magnitudes, 1));
      const points = new THREE.Points(geometry, this.material);
      points.frustumCulled = false;
      points.visible = false;
      this.scene.add(points);
      return { points, ids: tile.ids, positions: tile.positions };
    }, tile => { tile.points.removeFromParent(); tile.points.geometry.dispose(); });
    this.cache.setDesired([manifest.root]);
    const signal = this.events.signal;
    surface.addEventListener('pointerdown', event => { this.pointerStart = [event.clientX, event.clientY]; }, { signal });
    surface.addEventListener('pointerup', event => {
      if (this.pointerStart && Math.hypot(event.clientX - this.pointerStart[0], event.clientY - this.pointerStart[1]) < 5) this.pick(event.clientX, event.clientY);
      this.pointerStart = null;
    }, { signal });
    surface.addEventListener('pointercancel', () => { this.pointerStart = null; }, { signal });
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.pixelScale.value = Math.min(window.devicePixelRatio || 1, 1.5);
  }
  focus(position: MapVector, distance = 12) {
    this.origin.fromArray(position);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0.48, -0.74, 0.48).normalize().multiplyScalar(distance);
    this.controls.update(); this.elapsed = 1;
  }
  overview() {
    const root = this.nodes.get(this.manifest.root)!;
    this.focus(root.center, Math.min(root.radius * 2.6, this.controls.maxDistance));
  }
  select(id: string, position: MapVector | null) {
    this.selected = position ? { id, position } : null;
    if (!position) this.onMarker(0, 0, false);
  }
  zoom(factor: number) {
    this.camera.position.sub(this.controls.target).multiplyScalar(factor).clampLength(this.controls.minDistance, this.controls.maxDistance).add(this.controls.target);
    this.controls.update(); this.elapsed = 1;
  }
  retry() { this.cache.retry(); }
  update(dt: number) {
    this.controls.update();
    if (this.controls.target.length() > 1000) {
      this.origin.add(this.controls.target);
      this.camera.position.sub(this.controls.target);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
    this.camera.updateMatrixWorld();
    this.projection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.elapsed += dt;
    if (this.elapsed >= 0.2 && this.cache.active.length) {
      this.elapsed = 0;
      const eye = this.camera.position.clone().add(this.origin);
      this.cache.setDesired(selectStarTiles(this.manifest.root, this.nodes,
        node => node.radius * this.height / (Math.max(0.001, eye.distanceTo(new THREE.Vector3(...node.center))) * 100),
        node => { this.sphere.center.fromArray(node.center).sub(this.origin); this.sphere.radius = node.radius; return this.frustum.intersectsSphere(this.sphere); },
        this.maxTiles, this.maxPoints));
    }
    const active = new Set(this.cache.active);
    for (const [key, tile] of this.cache.entries) {
      tile.points.visible = active.has(key);
      if (tile.points.visible) tile.points.position.fromArray(this.nodes.get(key)!.center).sub(this.origin);
    }
    if (this.selected) {
      this.projected.fromArray(this.selected.position).sub(this.origin).project(this.camera);
      this.onMarker((this.projected.x + 1) * this.width / 2, (1 - this.projected.y) * this.height / 2,
        Math.abs(this.projected.x) < 1 && Math.abs(this.projected.y) < 1 && Math.abs(this.projected.z) < 1);
    }
  }
  private pick(x: number, y: number) {
    const rect = this.surface.getBoundingClientRect();
    let closest = 11 * 11, id = 0;
    for (const key of this.cache.active) {
      const tile = this.cache.entries.get(key)!;
      const center = this.nodes.get(key)!.center;
      for (let i = 0; i < tile.ids.length; i++) {
        this.projected.set(tile.positions[i * 3] + center[0] - this.origin.x,
          tile.positions[i * 3 + 1] + center[1] - this.origin.y,
          tile.positions[i * 3 + 2] + center[2] - this.origin.z).project(this.camera);
        if (Math.abs(this.projected.z) >= 1) continue;
        const dx = (this.projected.x + 1) * this.width / 2 - (x - rect.left);
        const dy = (1 - this.projected.y) * this.height / 2 - (y - rect.top);
        const distance = dx * dx + dy * dy;
        if (distance < closest) { closest = distance; id = tile.ids[i]; }
      }
    }
    if (id) this.onPick(`athyg:4.0:${id}`);
  }
  snapshot() {
    return { open: true, selectedId: this.selected?.id ?? null, tiles: this.cache.active.length,
      cachedTiles: this.cache.entries.size, pending: this.cache.pending, errors: this.cache.errors,
      points: this.cache.active.reduce((sum, key) => sum + this.nodes.get(key)!.points, 0),
      maxTiles: this.maxTiles, maxPoints: this.maxPoints,
      activeTileKeys: [...this.cache.active],
      radiusParsecs: this.camera.position.distanceTo(this.controls.target),
      parsecsPer100Pixels: this.camera.position.distanceTo(this.controls.target) * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 100 / this.height,
      camera: this.camera.position.toArray(), target: this.controls.target.toArray(), origin: this.origin.toArray() };
  }
  dispose() {
    this.events.abort(); this.controls.dispose(); this.cache.close(); this.material.dispose(); this.scene.clear();
  }
}
