import type { CatalogIdentifier } from './CatalogTypes.ts';

/** Source observations stay separate until identity and coordinate policy are resolved. */
export interface ExternalObservation {
  schemaVersion: 1;
  source: CatalogIdentifier;
  snapshotSha256: string;
  queryUrl: string;
  relatedSnapshots?: { sha256: string; url: string; fetchedAt: string }[];
  names: string[];
  identifiers: CatalogIdentifier[];
  objectType: string | null;
  astrometry: {
    frame: 'ICRS' | 'FK5';
    equinox: 'J2000.0' | null;
    epochJulianYear: number | null;
    raDegrees: number | null;
    decDegrees: number | null;
    reference: string | null;
  };
  measurements: Record<string, { value: number | string | boolean | null; unit: string | null; reference: string | null }>;
  flags: string[];
}
export interface ObservationOrigin { sha256: string; url: string; snapshotDate: string; }
export function sourceNumber(row: Record<string, string>, key: string): number | null {
  const value = row[key]?.trim();
  if (value === undefined) throw new Error(`Missing source column: ${key}`);
  if (value === '' || /^nan|null$/i.test(value)) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new Error(`Invalid source number: ${key}`);
  return Number(value);
}
export function sourceIdentity(value: string | undefined): string {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new Error('Invalid source identity');
  return value;
}
export function validateSkyPosition(ra: number | null, dec: number | null) {
  if (ra !== null && (ra < 0 || ra >= 360)) throw new Error('Source RA out of range');
  if (dec !== null && Math.abs(dec) > 90) throw new Error('Source Dec out of range');
}
