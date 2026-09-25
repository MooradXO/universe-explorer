import * as THREE from 'three';
import { Engine, type EngineOverlayView } from '../core/Engine';
import { SoundManager } from '../core/SoundManager';
import { Settings } from '../core/Settings';
import { loadModelClone } from './ModelLoader';
import { ShipEngineVFX } from './ShipEngineVFX';
import { BASE_STATION_VISUAL, PLAYER_SHIP_VISUAL } from './ShipVisualConfig';
import { CinematicGeometryPool, CinematicPlanet } from './visuals/CinematicPlanet';
import { CinematicBackground } from './visuals/CinematicBackground';
import { SOLAR_SYSTEM } from './systems/SystemDescriptor';

/** A self-contained orbital departure scene, independent of gameplay landmarks/camera. */
export class CinematicSystem implements EngineOverlayView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 1, 160000);
  private base = new THREE.Group();
  private scout = new THREE.Group();
  private scoutStart = new THREE.Vector3();
  private baseBounds = new THREE.Box3();
  private scoutBounds = new THREE.Box3();
  private vfx: ShipEngineVFX | null = null;
  private pool = new CinematicGeometryPool(Settings.graphicsMode === 'LOW');
  private planet: CinematicPlanet;
  private background = new CinematicBackground('launch-orbit', Settings.graphicsMode === 'LOW');
  private stars: THREE.Points;
  private ready: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private elapsed = 0;
  private phase = 0;
  private launching = false;
  private finished?: () => void;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private engine: Engine, private soundManager: SoundManager) {
    this.scene.name = 'launch-orbit'; this.scene.background = new THREE.Color('#03080e');
    this.scene.add(new THREE.HemisphereLight(0xb4d9ff, 0x24212c, 2));
    const key = new THREE.DirectionalLight(0xffd5a3, 3.8); key.position.set(-1600, 2000, 1400); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5baeff, 2.5); rim.position.set(1500, 100, -900); this.scene.add(rim);
    const body = structuredClone(SOLAR_SYSTEM.bodies[2]); body.radius = 1150; body.position = [1100, -920, -2800];
    body.appearance.moonCount = 0;
    this.planet = new CinematicPlanet(body, this.pool, 0xffffff); this.planet.group.position.fromArray(body.position);
    this.scene.add(this.planet.group, this.background.mesh);
    const count = Settings.graphicsMode === 'LOW' ? 900 : 1800, points = new Float32Array(count * 3);
    let seed = 24571;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let i = 0; i < count; i++) { const z = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - z * z) * 30000; points.set([r * Math.cos(angle), r * Math.sin(angle), z * 30000], i * 3); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc3d7e6, size: 1.5, sizeAttenuation: false, transparent: true, opacity: .6 }));
    this.scene.add(this.stars, this.base, this.scout);
  }
  initCinematicObjects() {
    this.engine.shipController.setInputBlocked('launch', true);
    this.engine.setOverlayView(this);
    this.base.position.set(350, 140, -250); this.base.rotation.set(.03, .48, -.055);
    this.scout.visible = false;
    this.scout.rotation.y = Math.atan2(2900, 3000);
    this.ready = Promise.all([
      loadModelClone(BASE_STATION_VISUAL.modelPath).then(model => {
        if (this.disposed) return;
        const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        const scale = 1000 / Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(scale); model.position.addScaledVector(center, -scale); this.base.add(model);
      }),
      loadModelClone(PLAYER_SHIP_VISUAL.modelPath).then(model => {
        if (this.disposed) return;
        model.scale.setScalar(PLAYER_SHIP_VISUAL.scale); model.rotation.set(...PLAYER_SHIP_VISUAL.rotation); this.scout.add(model);
        this.scout.scale.setScalar(.86);
        this.vfx = new ShipEngineVFX(this.scout, PLAYER_SHIP_VISUAL.nozzles, PLAYER_SHIP_VISUAL.engineColor, PLAYER_SHIP_VISUAL.nozzleSizes);
      }),
    ]).then(() => {
      if (this.disposed) return;
      this.baseBounds.setFromObject(this.base).expandByScalar(40);
      // The whole departure remains below the carrier's expanded bounding box.
      const scoutSize = new THREE.Box3().setFromObject(this.scout).getSize(new THREE.Vector3());
      this.scoutStart.set(490, this.baseBounds.min.y - scoutSize.y - 80, 400);
      this.scout.position.copy(this.scoutStart);
      this.scout.visible = true;
    }).catch(error => { console.error('Launch models unavailable', error); this.scoutStart.set(490, -420, 400); this.scout.position.copy(this.scoutStart); });
  }
  resize(width: number, height: number) {
    const portrait = width < height;
    this.camera.aspect = width / height; this.camera.fov = portrait ? 57 : 43;
    this.camera.position.set(portrait ? 270 : -100, portrait ? 570 : 400, portrait ? 2200 : 2050);
    this.camera.lookAt(portrait ? 330 : height < 520 ? -480 : -120, portrait ? -500 : 0, -250); this.camera.updateProjectionMatrix();
  }
  update(dt: number) {
    if (this.disposed) return;
    this.elapsed += dt;
    if (!this.reducedMotion) this.base.rotation.y = .48 + Math.sin(this.elapsed * .11) * .025;
    if (this.launching) {
      this.phase = Math.min(1, this.phase + dt / (this.reducedMotion ? .3 : 1.8));
      if (!this.reducedMotion) { const t = this.phase ** 2.4; this.scout.position.set(this.scoutStart.x - 2900 * t, this.scoutStart.y, this.scoutStart.z - 3000 * t); }
      if (this.phase >= 1) { this.launching = false; this.finished?.(); this.finished = undefined; }
    } else if (!this.reducedMotion && this.phase === 0) this.scout.position.y = this.scoutStart.y + Math.sin(this.elapsed * .5) * 7;
    this.vfx?.update(dt, this.elapsed, this.launching ? 900 : 0, this.launching, PLAYER_SHIP_VISUAL.engineColor);
    this.planet.update(this.reducedMotion ? 0 : this.elapsed, this.camera); this.background.update(this.camera.position, this.elapsed);
  }
  async playStartCinematic() {
    await this.ready;
    if (this.disposed || this.launching) return;
    this.soundManager.startAmbient(); this.soundManager.playEngineStart(); this.phase = 0; this.launching = true;
    return new Promise<void>(resolve => { this.finished = resolve; });
  }
  resetStartCinematic() { this.launching = false; this.phase = 0; this.scout.position.copy(this.scoutStart); this.finished?.(); this.finished = undefined; }
  snapshot() {
    this.scoutBounds.setFromObject(this.scout);
    return { open: !this.disposed, type: 'launch', phase: this.phase, ready: !this.baseBounds.isEmpty(),
      intersectsCarrier: !this.baseBounds.isEmpty() && this.baseBounds.intersectsBox(this.scoutBounds),
      planetClearance: this.scout.position.distanceTo(this.planet.group.position) - this.planet.body.radius - 180,
      scout: this.scout.position.toArray(), carrier: { min: this.baseBounds.min.toArray(), max: this.baseBounds.max.toArray() } };
  }
  cleanup() {
    if (this.disposed) return; this.disposed = true;
    this.engine.setOverlayView(null); this.engine.shipController.setInputBlocked('launch', false);
    this.vfx?.dispose(); this.planet.dispose(); this.pool.dispose(); this.background.dispose();
    this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose();
    // Cached GLTF geometry/materials belong to ModelLoader and are reused in gameplay.
    this.scene.clear(); this.finished?.(); this.finished = undefined;
  }
}
