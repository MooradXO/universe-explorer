import { SPACE_CONFIG } from './SpaceConfig';

export type Triple = readonly [number, number, number];
export interface WorldPosition { readonly sector: Triple; readonly offset: Triple; }
export const HOME: Triple = [0, 0, 0];
export const sectorKey = (sector: Triple): string => sector.join(',');

/** Centered cells: [-size/2, size/2), including negative boundary crossings. */
export function worldPosition(sector: Triple = HOME, offset: Triple = HOME): WorldPosition {
  const size = SPACE_CONFIG.sectorSize;
  const cells: number[] = [];
  const offsets: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    if (!Number.isSafeInteger(sector[axis]) || !Number.isFinite(offset[axis])) throw new RangeError('Invalid world position');
    const carry = Math.floor((offset[axis] + size / 2) / size);
    const cell = sector[axis] + carry;
    if (!Number.isSafeInteger(cell)) throw new RangeError('Sector exceeds integer precision');
    cells.push(cell === 0 ? 0 : cell);
    const local = offset[axis] - carry * size;
    offsets.push(local === 0 ? 0 : local);
  }
  return { sector: cells as unknown as Triple, offset: offsets as unknown as Triple };
}

export function addLocal(position: WorldPosition, delta: Triple): WorldPosition {
  return worldPosition(position.sector, position.offset.map((value, i) => value + delta[i]) as unknown as Triple);
}

export function relativePosition(position: WorldPosition, origin: WorldPosition): Triple {
  return position.sector.map((cell, i) => (cell - origin.sector[i]) * SPACE_CONFIG.sectorSize +
    position.offset[i] - origin.offset[i]) as unknown as Triple;
}

/** Compatibility boundary for the existing three-number persistence/network format. */
export function absolutePosition(position: WorldPosition): Triple {
  return relativePosition(position, worldPosition());
}

export function neighborhood(center: Triple, radius: number): Triple[] {
  const cells: Triple[] = [];
  for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) for (let z = -radius; z <= radius; z++) {
    cells.push([center[0] + x, center[1] + y, center[2] + z]);
  }
  return cells.sort((a, b) => a.reduce((sum, n, i) => sum + (n - center[i]) ** 2, 0) -
    b.reduce((sum, n, i) => sum + (n - center[i]) ** 2, 0) || sectorKey(a).localeCompare(sectorKey(b)));
}
