import { SPACE_CONFIG } from './SpaceConfig';
import { addLocal, absolutePosition, relativePosition, worldPosition, type Triple, type WorldPosition } from './WorldPosition';

export class FloatingOrigin {
  private origin = worldPosition();
  public shifts = 0;

  toWorld(local: Triple): WorldPosition { return addLocal(this.origin, local); }
  toLocal(position: WorldPosition): Triple { return relativePosition(position, this.origin); }
  toAbsolute(local: Triple): Triple { return absolutePosition(this.toWorld(local)); }
  fromAbsolute(global: Triple): Triple { return this.toLocal(worldPosition(undefined, global)); }

  recenter(local: Triple): Triple | null {
    if (Math.hypot(...local) < SPACE_CONFIG.recenterDistance) return null;
    return this.moveTo(this.toWorld(local));
  }

  moveTo(position: WorldPosition): Triple {
    const delta = this.toLocal(position);
    this.origin = worldPosition(position.sector, position.offset);
    this.shifts += 1;
    return delta;
  }

  snapshot() { return { origin: { sector: [...this.origin.sector], offset: [...this.origin.offset] }, shifts: this.shifts }; }
}
