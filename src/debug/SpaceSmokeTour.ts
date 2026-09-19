import { worldPosition, type WorldPosition } from '../world/space/WorldPosition';

// Fixed guest-only route exercises the same relocation path as ReturnToBase.
// No arbitrary teleport API, authentication bypass or network writes.
const ROUTE = [
  worldPosition([1, 0, -1], [0, 100, 9800]),
  worldPosition([-2, 1, 3], [0, 100, 9800]),
  worldPosition([1_000_000, -1_000_000, 1_000_000], [0.125, 100.25, 9800.5]),
  worldPosition([0, 0, 0], [0, 100, 9800]),
  worldPosition([1, 0, -1], [0, 100, 9800]),
  worldPosition([0, 0, 0], [0, 100, 9800]),
];

export class SpaceSmokeTour {
  private elapsed = 0;
  private step = 0;
  update(dt: number, relocate: (position: WorldPosition) => void) {
    this.elapsed += dt;
    if (this.step < ROUTE.length && this.elapsed >= (this.step + 1) * 4) relocate(ROUTE[this.step++]);
  }
  snapshot() { return { step: this.step, total: ROUTE.length, done: this.step === ROUTE.length }; }
}
