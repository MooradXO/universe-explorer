import * as THREE from 'three';
import { Settings } from '../../core/Settings';
import type { Engine } from '../../core/Engine';
import { PlanetBuilder } from '../PlanetBuilder';
import { FloatingOrigin } from './FloatingOrigin';
import { SectorWorkerClient } from './SectorWorkerClient';
import { SectorStream } from './SectorStream';
import { SectorNavigation } from './SectorNavigation';
import { DeepSpaceBackground } from './DeepSpaceBackground';
import { sectorKey, type Triple } from './WorldPosition';
import { SystemScene } from '../systems/SystemScene';
import type { SystemDescriptor } from '../systems/SystemDescriptor';

/** Owns streamed celestial resources; gameplay remains in WorldBuilder. */
export class SpaceWorld {
  readonly origin = new FloatingOrigin();
  readonly planets: PlanetBuilder;
  readonly navigation: SectorNavigation;
  readonly background: DeepSpaceBackground;
  systemScene: SystemScene | null = null;
  private readonly worker = new SectorWorkerClient();
  private readonly stream = new SectorStream(this.worker.generate);
  private center: Triple = [0, 0, 0];
  private selectionTimer = 1;
  private readonly jobs = { total: 0, lastMs: 0, maxMs: 0 };

  constructor(private readonly engine: Engine, private targets: THREE.Mesh[]) {
    this.planets = new PlanetBuilder(engine, targets);
    this.navigation = new SectorNavigation(engine.scene);
    this.background = new DeepSpaceBackground(engine.scene, Settings.graphicsMode === 'LOW');
  }

  update(dt: number, elapsed: number, focus: THREE.Vector3, shifted: boolean) {
    if (this.systemScene) {
      this.systemScene.update(dt, elapsed, this.origin, focus);
      this.background.update(this.engine.camera.position);
      this.background.group.visible = this.systemScene.sky.status !== 'ready';
      return;
    }
    const center = this.origin.toWorld(focus.toArray() as [number, number, number]).sector;
    this.selectionTimer += dt;
    const changed = sectorKey(center) !== sectorKey(this.center);
    this.center = center;
    this.stream.update(center);
    const manifests = this.stream.visible(center);
    if (changed || shifted || this.selectionTimer >= 0.15) {
      this.planets.select(manifests, this.origin, focus);
      this.selectionTimer = 0;
    }
    const screenScale = this.engine.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov / 2)));
    const start = performance.now();
    const builtNavigation = this.navigation.update(manifests, this.origin, this.planets.activeIds, screenScale);
    const built = builtNavigation || this.planets.buildNext(this.origin);
    if (built) {
      this.jobs.total++;
      this.jobs.lastMs = performance.now() - start;
      this.jobs.maxMs = Math.max(this.jobs.maxMs, this.jobs.lastMs);
    }
    this.planets.update(elapsed);
    this.background.update(this.engine.camera.position);
  }

  setSystem(descriptor: SystemDescriptor) {
    if (!this.systemScene) { this.stream.dispose(); this.worker.dispose(); this.navigation.dispose(); this.planets.dispose(); }
    this.systemScene?.dispose(); this.systemScene = new SystemScene(descriptor, this.engine, this.targets);
  }
  descriptors() { return this.systemScene?.descriptor.bodies.map(body => body.visual) ?? this.stream.manifests.get(sectorKey(this.center))?.planets ?? []; }
  snapshot() {
    return { origin: this.origin.snapshot(), system: this.systemScene?.snapshot() ?? null, stream: this.stream.snapshot(),
      navigation: this.navigation.snapshot(), planets: this.planets.snapshot(), jobs: { ...this.jobs } };
  }
  dispose() { this.systemScene?.dispose(); this.stream.dispose(); this.worker.dispose(); this.navigation.dispose(); this.planets.dispose(); this.background.dispose(); }
}
