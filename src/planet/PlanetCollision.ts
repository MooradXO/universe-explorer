import * as THREE from 'three';
import { ShipController } from '../core/ShipController';
import { UIManager } from '../ui/UIManager';
import { SphericalSurfaceSample } from './PlanetSurfaceSphere';

export type PlanetCollisionSampler = (localPosition: THREE.Vector3) => SphericalSurfaceSample;

export class PlanetCollision {
  private hasKilled = false;

  constructor(
    private readonly shipController: ShipController,
    private readonly ui: UIManager,
    private readonly collisionSampler: PlanetCollisionSampler,
    private readonly deathThreshold = 18,
  ) {}

  public update(shipGroup: THREE.Group, localPosition: THREE.Vector3): boolean {
    if (this.hasKilled || this.shipController.isDead) return false;

    const sample = this.collisionSampler(localPosition);
    if (sample.altitude <= this.deathThreshold) {
      this.hasKilled = true;
      const fatalDamage = this.shipController.maxHP + this.shipController.maxShield + 999;
      const dead = this.shipController.takeDamage(fatalDamage);
      this.ui.updateHP(this.shipController.currentHP, this.shipController.maxHP);
      this.ui.updateShield(this.shipController.currentShield, this.shipController.maxShield);
      if (dead) {
        this.ui.showDeathScreen(5);
        shipGroup.position.copy(sample.normal.multiplyScalar(sample.surfaceRadius + this.deathThreshold + 5));
      }
      return dead;
    }

    return false;
  }
}
