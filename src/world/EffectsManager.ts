import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Settings } from '../core/Settings';
import { FlightDust } from './visuals/FlightDust';

export class EffectsManager {
  private engine: Engine;
  
  readonly motion: FlightDust;

  // Ion Trail
  public ionTrailPoints: THREE.Points | null = null;
  private ionParticles: { pos: THREE.Vector3; vel: THREE.Vector3; age: number; maxAge: number }[] = [];
  private maxIonParticles = 450;
  private lastParticleSpawnTime = 0;
  
  private bgDotTexture: THREE.Texture;

  constructor(engine: Engine, bgDotTexture: THREE.Texture) {
    this.engine = engine;
    this.motion = new FlightDust(Settings.graphicsMode === 'LOW');
    engine.scene.add(this.motion.group);
    this.bgDotTexture = bgDotTexture;
    if (Settings.graphicsMode === 'LOW') {
      this.maxIonParticles = 200;
    }
  }

  public shiftOrigin(delta: THREE.Vector3) {
    this.motion.shiftOrigin(delta);
    for (const particle of this.ionParticles) particle.pos.sub(delta);
  }

  public init() {
    this.buildIonTrail();
  }

  private buildIonTrail() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxIonParticles * 3);
    const colors = new Float32Array(this.maxIonParticles * 3);

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: Settings.graphicsMode === 'LOW' ? 3.0 : 5.0,
      map: this.bgDotTexture,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false
    });

    this.ionTrailPoints = new THREE.Points(geo, mat);
    this.engine.scene.add(this.ionTrailPoints);
  }

  public spawnIonParticle(pos: THREE.Vector3, vel: THREE.Vector3, isBoosting: boolean) {
    const isLow = Settings.graphicsMode === 'LOW';
    const maxAge = isBoosting
      ? (isLow ? 0.12 : 0.18) + Math.random() * (isLow ? 0.04 : 0.08)
      : (isLow ? 0.07 : 0.11) + Math.random() * (isLow ? 0.025 : 0.045);
    const p = {
      pos: pos.clone(),
      vel: vel.clone(),
      age: 0,
      maxAge: maxAge
    };
    
    if (this.ionParticles.length < this.maxIonParticles) {
      this.ionParticles.push(p);
    } else {
      let oldestIdx = 0;
      let maxAgeVal = -1;
      for (let i = 0; i < this.ionParticles.length; i++) {
        const ageRatio = this.ionParticles[i].age / this.ionParticles[i].maxAge;
        if (ageRatio > maxAgeVal) {
          maxAgeVal = ageRatio;
          oldestIdx = i;
        }
      }
      this.ionParticles[oldestIdx] = p;
    }
  }

  public update(
    dt: number,
    shipVelocity: THREE.Vector3,
    isBoosting: boolean,
    laserColor: 'red' | 'blue',
    engineColorHex: number = laserColor === 'red' ? 0xff2222 : 0x2288ff
  ) {
    const speed = shipVelocity.length();

    // 2. Ion Engine Trail Update
    if (this.ionTrailPoints) {
      const trailMat = this.ionTrailPoints.material as THREE.PointsMaterial;
      const targetSize = isBoosting ? (Settings.graphicsMode === 'LOW' ? 5.0 : 8.0) : (speed > 8 ? 4.8 : 3.0);
      trailMat.size = THREE.MathUtils.lerp(trailMat.size, targetSize, dt * 7.0);
      trailMat.opacity = THREE.MathUtils.lerp(trailMat.opacity, isBoosting ? 0.95 : 0.72, dt * 5.0);

      const geo = this.ionTrailPoints.geometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
      const pArray = posAttr.array as Float32Array;
      const cArray = colAttr.array as Float32Array;

      const baseColor = new THREE.Color(engineColorHex);

      for (let i = 0; i < this.maxIonParticles; i++) {
        const idx = i * 3;
        if (i < this.ionParticles.length) {
          const p = this.ionParticles[i];
          p.age += dt;
          p.pos.addScaledVector(p.vel, dt);

          pArray[idx] = p.pos.x;
          pArray[idx+1] = p.pos.y;
          pArray[idx+2] = p.pos.z;

          const fade = 1 - Math.min(1.0, p.age / p.maxAge);
          cArray[idx] = baseColor.r * fade;
          cArray[idx+1] = baseColor.g * fade;
          cArray[idx+2] = baseColor.b * fade;

          if (p.age >= p.maxAge) {
            this.ionParticles.splice(i, 1);
            i--;
          }
        } else {
          pArray[idx] = 0;
          pArray[idx+1] = 0;
          pArray[idx+2] = 0;
          cArray[idx] = 0;
          cArray[idx+1] = 0;
          cArray[idx+2] = 0;
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  }

  // Spawns ion particles from engine nozzle positions
  public handleEngineParticles(
    elapsed: number,
    shipGroup: THREE.Group,
    shipVelocity: THREE.Vector3,
    isBoosting: boolean,
    nozzles: readonly (readonly [number, number, number])[] = [
      [-35, 5, 60],
      [35, 5, 60],
      [-17.5, -5, 60],
      [17.5, -5, 60],
    ]
  ) {
    const speed = shipVelocity.length();
    // The attached engine plumes carry cruise thrust; world-space exhaust at
    // interplanetary speeds would jump far behind the camera in a single frame.
    if (speed > 12000) return;
    if (speed > 5 || isBoosting) {
      const isLow = Settings.graphicsMode === 'LOW';
      const spawnInterval = isBoosting ? (isLow ? 0.018 : 0.006) : (isLow ? 0.045 : 0.018);
      if (elapsed - this.lastParticleSpawnTime > spawnInterval) {
        this.lastParticleSpawnTime = elapsed;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shipGroup.quaternion);
        for (const localPos of nozzles) {
          const worldPos = new THREE.Vector3(localPos[0], localPos[1], localPos[2]).applyMatrix4(shipGroup.matrixWorld);
          const spread = isBoosting ? 0.07 : 0.045;
          const vel = forward.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread
          )).normalize().multiplyScalar((isBoosting ? 120 : 70) + speed * (isBoosting ? 0.24 : 0.16));
          this.spawnIonParticle(worldPos, vel, isBoosting);
        }
      }
    }
  }
}
