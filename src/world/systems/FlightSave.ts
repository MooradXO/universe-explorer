import { readStellarAddress, type StellarAddress } from '../space/StellarAddress';
import { buildSystem, SOLAR_CATALOG_OBJECT } from './SystemDescriptor';
import { compatibleGenerator, GENERATOR, type GeneratorVersions } from '../generation/GeneratorContract';
import type { GameMode } from '../../network/shared/GameMode';

export interface FlightSave { version: 1; generator?: GeneratorVersions; address: StellarAddress; spectrum: string | null; rotation: number[]; visited: string[]; }
export const flightSaveKey = (id: string, mode: GameMode = 'pvp') => `universe:stellar-flight:v1:${id.startsWith('guest_') ? 'guest' : id}${mode === 'pvp' ? '' : ':exploration'}`;
export function unsupportedFlightSave(raw:string|null):boolean {
  try{if(!raw||raw.length>32768)return false;const v=JSON.parse(raw);return v.version>1||!compatibleGenerator(v.generator);}catch{return false;}
}
export function readFlightSave(raw: string | null): FlightSave | null {
  if (!raw || raw.length > 32768) return null;
  try {
    const value = JSON.parse(raw), address = readStellarAddress(value.address);
    if (value.version !== 1 || !compatibleGenerator(value.generator) || !address || (value.spectrum !== null && (typeof value.spectrum !== 'string' || value.spectrum.length > 128)) ||
        !Array.isArray(value.rotation) || value.rotation.length !== 4 || !value.rotation.every(Number.isFinite) ||
        Math.abs(Math.hypot(...value.rotation) - 1) > 0.001 || !Array.isArray(value.visited) || value.visited.length > 128 ||
        !value.visited.every((id: unknown) => typeof id === 'string' && id.length < 128)) return null;
    return { version: 1, generator: GENERATOR, address, spectrum: value.spectrum, rotation: value.rotation, visited: value.visited };
  } catch { return null; }
}
export function systemFromSave(save: FlightSave) {
  const anchor = save.address.anchor;
  return buildSystem({ ...SOLAR_CATALOG_OBJECT, id: anchor.catalogId, title: anchor.title, names: [anchor.title],
    position: [...anchor.positionParsecs], distance: Math.hypot(...anchor.positionParsecs), spectrum: save.spectrum,
    identifiers: [], distanceSource: anchor.distanceSource, flags: [...anchor.qualityFlags] });
}
