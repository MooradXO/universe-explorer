import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { UIManager } from '../ui/UIManager';
import { PlanetCollision } from './PlanetCollision';
import { PlanetSkybox } from './PlanetSkybox';
import { PlanetSurfaceSphere } from './PlanetSurfaceSphere';
import { PlanetSurfaceManifest } from './PlanetSurfaceManifest';
import { createTerrainHeightSampler } from './TerrainChunk';

export interface AtmosphereReturnState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export class AtmosphereMode {
  private scene: THREE.Scene | null = null;
  private surface: PlanetSurfaceSphere | null = null;
  private skybox: PlanetSkybox | null = null;
  private collision: PlanetCollision | null = null;
  private shipGroup: THREE.Group | null = null;
  private previousShipParent: THREE.Object3D | null = null;
  private returnState: AtmosphereReturnState | null = null;
  private previousActiveScene: THREE.Scene | null = null;
  private previousToneMappingExposure: number | null = null;
  private elapsed = 0;

  constructor(
    private readonly engine: Engine,
    private readonly ui: UIManager,
  ) {}

  public get isActive(): boolean {
    return this.scene !== null;
  }

  public getLevelDebugSummary() {
    return this.surface?.getDebugSummary() || null;
  }

  public enter(manifest: PlanetSurfaceManifest, shipGroup: THREE.Group, returnState: AtmosphereReturnState) {
    if (this.isActive) this.exit();

    this.ui.showAtmosphereLoading(`LOADING ${manifest.className.toUpperCase()} ATMOSPHERE`);
    this.shipGroup = shipGroup;
    this.returnState = {
      position: returnState.position.clone(),
      quaternion: returnState.quaternion.clone(),
    };
    this.previousActiveScene = this.engine.activeScene;
    this.previousShipParent = shipGroup.parent;
    this.elapsed = 0;

    const heightSampler = createTerrainHeightSampler(manifest);
    this.surface = new PlanetSurfaceSphere(manifest, heightSampler);
    const lighting = this.getLightingProfile(manifest);
    const scene = new THREE.Scene();
    scene.name = `AtmosphereScene:${manifest.planetId}`;
    scene.background = new THREE.Color(manifest.skyProfile.zenithColor);
    scene.fog = new THREE.FogExp2(manifest.skyProfile.fogColor, lighting.fogDensity);

    this.skybox = new PlanetSkybox(manifest);
    scene.add(this.skybox.group);

    scene.add(this.surface.group);

    const hemi = new THREE.HemisphereLight(
      manifest.skyProfile.horizonColor,
      manifest.levelDesign.palette.low,
      lighting.hemisphereIntensity,
    );
    const sun = new THREE.DirectionalLight(lighting.sunColor, lighting.sunIntensity);
    sun.position.set(9000, 14000, -18000);
    sun.target.position.set(0, 0, 0);
    const fill = new THREE.DirectionalLight(manifest.skyProfile.zenithColor, lighting.fillIntensity);
    fill.position.set(-12000, 6500, 9000);
    const ambientIntensity = manifest.biome === 'volcanic'
      ? 0.1
      : manifest.biome === 'oceanic' || manifest.biome === 'ice'
        ? 0.24
        : 0.18;
    const ambient = new THREE.AmbientLight(0xc8dcf2, ambientIntensity);
    scene.add(hemi, sun, sun.target, fill, ambient);

    this.scene = scene;
    this.previousToneMappingExposure = this.engine.renderer.toneMappingExposure;
    this.engine.renderer.toneMappingExposure = lighting.exposure;
    this.engine.setActiveScene(scene);
    scene.add(shipGroup);

    shipGroup.position.copy(this.surface.getEntryPosition(this.getEntryAltitude(manifest)));
    shipGroup.quaternion.setFromEuler(new THREE.Euler(this.getEntryPitch(manifest), 0, 0));
    this.engine.shipController.velocity.set(0, -24, -260);

    this.collision = new PlanetCollision(this.engine.shipController, this.ui, (position) => this.surface!.sampleAtPosition(position), 24);
    this.ui.showAtmosphereStatus(manifest.className);

    window.setTimeout(() => this.ui.hideAtmosphereLoading(), 450);
  }

  public exit() {
    if (!this.scene) return;

    this.ui.hideAtmosphereLoading();
    this.ui.hideAtmosphereStatus();

    if (this.shipGroup && this.returnState) {
      if (this.previousShipParent) {
        this.previousShipParent.add(this.shipGroup);
      } else {
        this.engine.scene.add(this.shipGroup);
      }
      this.shipGroup.position.copy(this.returnState.position);
      this.shipGroup.quaternion.copy(this.returnState.quaternion);
      this.engine.shipController.velocity.set(0, 0, 0);
    }

    this.skybox?.dispose();
    this.surface?.dispose();
    if (this.previousToneMappingExposure !== null) {
      this.engine.renderer.toneMappingExposure = this.previousToneMappingExposure;
    }
    this.engine.setActiveScene(this.previousActiveScene || this.engine.scene);
    this.scene.clear();

    this.scene = null;
    this.surface = null;
    this.skybox = null;
    this.collision = null;
    this.shipGroup = null;
    this.previousShipParent = null;
    this.returnState = null;
    this.previousActiveScene = null;
    this.previousToneMappingExposure = null;
  }

  public update(dt: number) {
    if (!this.scene || !this.shipGroup || !this.surface || !this.collision) return;

    this.elapsed += dt;
    this.skybox?.update(this.engine.camera.position);
    this.surface.update(this.elapsed);

    if (this.collision.update(this.shipGroup, this.shipGroup.position)) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ReturnToOrbit'));
      }, 650);
    }
  }

  private getEntryAltitude(manifest: PlanetSurfaceManifest): number {
    const reliefBonus = Math.min(950, manifest.terrainAmplitude * 4);
    switch (manifest.biome) {
      case 'gas':
        return 4200 + reliefBonus;
      case 'volcanic':
        return 3400 + reliefBonus;
      case 'oceanic':
      case 'forest':
        return 3100 + reliefBonus;
      default:
        return 3200 + reliefBonus;
    }
  }

  private getEntryPitch(manifest: PlanetSurfaceManifest): number {
    return manifest.biome === 'gas' ? -0.12 : -0.18;
  }

  private getLightingProfile(manifest: PlanetSurfaceManifest) {
    const fogBase = manifest.skyProfile.fogDensity;
    switch (manifest.biome) {
      case 'desert':
        return { exposure: 0.9, hemisphereIntensity: 0.72, sunIntensity: 2.1, fillIntensity: 0.48, fogDensity: fogBase * 0.44, sunColor: 0xffd2a0 };
      case 'oceanic':
        return { exposure: 0.88, hemisphereIntensity: 0.94, sunIntensity: 1.8, fillIntensity: 0.62, fogDensity: fogBase * 0.5, sunColor: 0xfff2d6 };
      case 'ice':
        return { exposure: 0.82, hemisphereIntensity: 0.98, sunIntensity: 1.5, fillIntensity: 0.7, fogDensity: fogBase * 0.36, sunColor: 0xe6f4ff };
      case 'forest':
        return { exposure: 0.86, hemisphereIntensity: 0.76, sunIntensity: 1.9, fillIntensity: 0.52, fogDensity: fogBase * 0.42, sunColor: 0xffedcf };
      case 'volcanic':
        return { exposure: 0.94, hemisphereIntensity: 0.42, sunIntensity: 1.55, fillIntensity: 0.26, fogDensity: fogBase * 0.58, sunColor: 0xff9b63 };
      case 'gas':
        return { exposure: 0.9, hemisphereIntensity: 0.62, sunIntensity: 1.45, fillIntensity: 0.44, fogDensity: fogBase * 0.55, sunColor: 0xffc98f };
      case 'toxic':
      case 'rocky':
      default:
        return { exposure: 0.86, hemisphereIntensity: 0.64, sunIntensity: 1.8, fillIntensity: 0.5, fogDensity: fogBase * 0.42, sunColor: 0xffe6c4 };
    }
  }
}
