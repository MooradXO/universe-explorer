import * as THREE from 'three';
import gsap from 'gsap';
import { Engine } from '../core/Engine';
import { SoundManager } from '../core/SoundManager';
import { loadModelClone } from './ModelLoader';
import { ShipEngineVFX } from './ShipEngineVFX';
import { BASE_STATION_VISUAL, PLAYER_SHIP_VISUAL } from './ShipVisualConfig';

export class CinematicSystem {
  private engine: Engine;
  private soundManager: SoundManager;

  public demoBaseShip: THREE.Group | null = null;
  public demoPlayerShip: THREE.Group | null = null;
  public demoEngineVFX: ShipEngineVFX | null = null;
  private demoBoosting = false;

  constructor(engine: Engine, soundManager: SoundManager) {
    this.engine = engine;
    this.soundManager = soundManager;
  }

  public initCinematicObjects() {
    // Spawn demo Base Ship for cinematic pre-login screen
    const demoGroup = new THREE.Group();
    demoGroup.position.set(0, -450, -2500);
    this.demoBaseShip = demoGroup;
    this.engine.scene.add(demoGroup);

    loadModelClone(BASE_STATION_VISUAL.modelPath).then((model) => {
      model.scale.setScalar(BASE_STATION_VISUAL.scale);
      model.rotation.set(
        BASE_STATION_VISUAL.rotation[0],
        BASE_STATION_VISUAL.rotation[1],
        BASE_STATION_VISUAL.rotation[2]
      );
      demoGroup.add(model);
    }).catch((err: any) => {
      console.error('Error loading demo base ship:', err);
    });

    // Spawn demo player ship next to the base ship.
    const demoPlayerGroup = new THREE.Group();
    demoPlayerGroup.position.set(220, -420, -2300);
    this.demoPlayerShip = demoPlayerGroup;
    this.engine.scene.add(demoPlayerGroup);

    this.demoEngineVFX = new ShipEngineVFX(
      demoPlayerGroup,
      PLAYER_SHIP_VISUAL.nozzles,
      PLAYER_SHIP_VISUAL.engineColor,
      PLAYER_SHIP_VISUAL.nozzleSizes
    );

    loadModelClone(PLAYER_SHIP_VISUAL.modelPath).then((model) => {
      model.scale.setScalar(PLAYER_SHIP_VISUAL.scale);
      model.rotation.set(
        PLAYER_SHIP_VISUAL.rotation[0],
        PLAYER_SHIP_VISUAL.rotation[1],
        PLAYER_SHIP_VISUAL.rotation[2]
      );
      demoPlayerGroup.add(model);
    }).catch((err: any) => {
      console.error('Error loading demo player ship:', err);
    });

    // Scenic cinematic camera at startup looking directly at our magnificent Base Ship
    this.engine.camera.position.set(1100, -250, -1800);
    this.engine.camera.lookAt(new THREE.Vector3(0, -400, -2500));
  }

  public update(dt: number, elapsed: number) {
    if (this.demoBaseShip) {
      this.demoBaseShip.rotation.y += dt * 0.025;
    }

    if (this.demoPlayerShip) {
      this.demoPlayerShip.rotation.y += dt * 0.04;
      this.demoPlayerShip.position.y = -420 + Math.sin(elapsed * 1.2) * 12;

      this.demoEngineVFX?.update(dt, elapsed, this.demoBoosting ? 900 : 0, this.demoBoosting, PLAYER_SHIP_VISUAL.engineColor);
    }
  }

  public playStartCinematic() {
    if (this.demoPlayerShip) {
      // 1. Play thruster sound
      this.soundManager.playEngineStart();
      this.demoBoosting = true;
      
      // 2. Animate the player ship zooming forward with rocket exhaust
      gsap.to(this.demoPlayerShip.position, {
        z: -5000,
        x: 180,
        y: -380,
        duration: 1.8,
        ease: 'power2.in',
        onComplete: () => {
          if (this.demoPlayerShip) {
            this.demoPlayerShip.visible = false;
          }
          this.demoBoosting = false;
        }
      });

      // 3. Pan camera dynamically to feel ship's speed and drift
      gsap.to(this.engine.camera.position, {
        x: 800,
        y: -150,
        z: -1700,
        duration: 1.8,
        ease: 'power1.inOut'
      });
    }
  }

  public resetStartCinematic() {
    if (this.demoPlayerShip) {
      gsap.killTweensOf(this.demoPlayerShip.position);
      gsap.killTweensOf(this.engine.camera.position);

      this.demoPlayerShip.position.set(220, -420, -2300);
      this.demoPlayerShip.visible = true;
      this.demoBoosting = false;

      this.engine.camera.position.set(1100, -250, -1800);
      this.engine.camera.lookAt(new THREE.Vector3(0, -400, -2500));
    }
  }

  public cleanup() {
    if (this.demoBaseShip) {
      this.engine.scene.remove(this.demoBaseShip);
      this.demoBaseShip.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.demoBaseShip = null;
    }

    if (this.demoPlayerShip) {
      if (this.demoEngineVFX) {
        this.demoEngineVFX.dispose();
        this.demoEngineVFX = null;
      }
      this.engine.scene.remove(this.demoPlayerShip);
      this.demoPlayerShip.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.demoPlayerShip = null;
    }
  }
}
