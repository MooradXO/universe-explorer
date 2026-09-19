import { Group, Matrix4, PerspectiveCamera, type Camera } from 'three';
import type { EpicFX } from '../../vendor/epic-fx/epic-fx';

/** Simulate in the preset's own units; display the entire result in flight units.
 * The upstream world emitters do not scale velocity with options.size. Keeping their
 * simulation local preserves the approved shape, speed and trails at any world scale.
 * Floating origin moves only the anchor: particle histories never contain flight XYZ.
 */
export class EpicEffectSpace {
  readonly anchor = new Group();
  private camera = new PerspectiveCamera();
  private inverse = new Matrix4();
  constructor(units: number) { this.anchor.scale.setScalar(units); }
  update(effect: EpicFX, dt: number, camera: Camera) {
    this.anchor.updateWorldMatrix(true, false); camera.updateWorldMatrix(true, false);
    this.inverse.copy(this.anchor.matrixWorld).invert().multiply(camera.matrixWorld);
    this.inverse.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    this.camera.updateMatrixWorld(true);
    // Public add/remove APIs restore the normal scene hierarchy before rendering.
    // Only at most two small groups are moved; no frame allocations or GPU copies.
    effect.group.removeFromParent();
    try { effect.update(dt, this.camera); }
    finally { this.anchor.add(effect.group); }
  }
}
