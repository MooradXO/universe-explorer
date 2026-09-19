import type { MapObject } from '../../catalog/StarMapData';
import { worldPosition, type Triple, type WorldPosition } from './WorldPosition';

/** A catalogue anchor and a local flight coordinate never share a numeric scale. */
export interface StellarAnchor {
  readonly catalogId: string;
  readonly title: string;
  readonly positionParsecs: Triple;
  readonly frame: 'equatorial';
  readonly equinox: 'J2000.0';
  readonly distanceSource: string | null;
  readonly qualityFlags: readonly string[];
}
export interface StellarAddress {
  readonly version: 1;
  readonly anchor: StellarAnchor;
  /** Existing game units. The flight-scale policy is configured separately. */
  readonly local: WorldPosition;
}

function triple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number' && Number.isFinite(item));
}
function anchorCopy(anchor: StellarAnchor): StellarAnchor {
  if (!/^athyg:4\.0:[1-9]\d{0,9}$/.test(anchor.catalogId) || Number(anchor.catalogId.split(':')[2]) > 0xffffffff ||
      typeof anchor.title !== 'string' || !anchor.title.trim() || anchor.title.length > 256 ||
      !triple(anchor.positionParsecs) || anchor.frame !== 'equatorial' || anchor.equinox !== 'J2000.0' ||
      (anchor.distanceSource !== null && typeof anchor.distanceSource !== 'string') ||
      !Array.isArray(anchor.qualityFlags) || anchor.qualityFlags.length > 64 ||
      !anchor.qualityFlags.every(flag => typeof flag === 'string' && flag.length <= 256)) throw new Error('Invalid stellar anchor');
  return Object.freeze({ ...anchor, positionParsecs: Object.freeze([...anchor.positionParsecs]) as Triple,
    qualityFlags: Object.freeze([...anchor.qualityFlags]) });
}

/** Preserve the AT-HYG position and its caveats, including the source's solar offset. */
export function anchorFromCatalog(object: MapObject): StellarAnchor {
  if (!object.positioned || !object.position) throw new Error('У объекта нет известной 3D-позиции для перелёта.');
  return anchorCopy({ catalogId: object.id, title: object.title, positionParsecs: object.position,
    frame: 'equatorial', equinox: 'J2000.0', distanceSource: object.distanceSource, qualityFlags: object.flags });
}

export function stellarAddress(anchor: StellarAnchor, local: WorldPosition): StellarAddress {
  if (!triple(local.sector) || !triple(local.offset)) throw new Error('Invalid local flight position');
  const normalized = worldPosition(local.sector, local.offset);
  return Object.freeze({ version: 1, anchor: anchorCopy(anchor),
    local: Object.freeze({ sector: Object.freeze([...normalized.sector]) as Triple, offset: Object.freeze([...normalized.offset]) as Triple }) });
}

/** Invalid/legacy payloads need an explicit migration, never a guessed home system. */
export function readStellarAddress(value: unknown): StellarAddress | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StellarAddress>;
  if (candidate.version !== 1 || !candidate.anchor || !candidate.local) return null;
  try { return stellarAddress(candidate.anchor, candidate.local); } catch { return null; }
}

export function moveWithinSystem(address: StellarAddress, local: WorldPosition): StellarAddress {
  return stellarAddress(address.anchor, local);
}

export function distanceBetweenSystemsParsecs(first: StellarAnchor, second: StellarAnchor): number {
  // Same published identity is the same destination even if a later snapshot refines its position.
  if (first.catalogId === second.catalogId) return 0;
  return Math.hypot(...first.positionParsecs.map((value, axis) => value - second.positionParsecs[axis]));
}
