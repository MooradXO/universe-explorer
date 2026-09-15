import * as CANNON from 'cannon-es';

export class PhysicsEngine {
  public world: CANNON.World;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, 0, 0) // No universal gravity, handled by planets
    });

    // Space environment, no sweeping necessary, but setup basic broadphase
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
  }

  public update(dt: number) {
    // Step the physics world
    this.world.step(1 / 60, dt, 3);
  }
}
