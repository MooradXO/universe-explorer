import { Quaternion } from 'three';
import { AUTOMATIC_TURN_RATE } from '../world/systems/FlightOrientation';

/** Presentation only: the authoritative/predicted flight quaternion stays untouched. */
export class NetworkAttitude {
  readonly rotation = new Quaternion();
  private correction = new Quaternion();
  private inverse = new Quaternion();
  private wasCruising = false;

  reset(target: Quaternion) {
    this.rotation.copy(target); this.correction.identity(); this.wasCruising = false;
  }

  update(target: Quaternion, dt: number, cruising: boolean) {
    if (cruising) {
      // Server poses arrive at 10 Hz. Continue the bounded automatic turn each
      // rendered frame instead of jumping to each incoming orientation.
      this.rotation.rotateTowards(target, AUTOMATIC_TURN_RATE * Math.max(0, dt));
    } else {
      if (this.wasCruising) this.correction.copy(this.rotation).multiply(this.inverse.copy(target).invert());
      this.correction.slerp(this.inverse.identity(), 1 - Math.exp(-14 * Math.max(0, dt)));
      // New manual steering applies immediately; only the remaining cruise offset fades.
      this.rotation.copy(this.correction).multiply(target).normalize();
    }
    this.wasCruising = cruising;
    return this.rotation;
  }
}
