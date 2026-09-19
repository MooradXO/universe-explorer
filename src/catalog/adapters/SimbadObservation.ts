import { sourceIdentity, sourceNumber, validateSkyPosition, type ExternalObservation, type ObservationOrigin } from '../ExternalObservation.ts';

export const SIMBAD_COLUMNS = ['oid', 'main_id', 'otype', 'ra', 'dec', 'coo_bibcode', 'coo_qual',
  'plx_value', 'plx_err', 'plx_bibcode', 'pmra', 'pmdec', 'pm_bibcode', 'sp_type', 'sp_bibcode',
  'rvz_redshift', 'rvz_radvel', 'rvz_bibcode', 'morph_type', 'morph_bibcode'] as const;

export function normalizeSimbadObservation(row: Record<string, string>, aliases: string[], origin: ObservationOrigin): ExternalObservation {
  const oid = sourceIdentity(row.oid), ra = sourceNumber(row, 'ra'), dec = sourceNumber(row, 'dec');
  validateSkyPosition(ra, dec);
  if (!row.main_id?.trim()) throw new Error('Missing SIMBAD main identifier');
  const identifiers: ExternalObservation['identifiers'] = [{ catalog: 'simbad', release: origin.snapshotDate, value: row.main_id.trim() }];
  for (const alias of aliases) {
    const match = /^Gaia DR3 ([1-9]\d*)$/.exec(alias.trim());
    if (match) identifiers.push({ catalog: 'gaia', release: 'DR3', value: match[1] });
  }
  const measurements: ExternalObservation['measurements'] = {};
  for (const [key, unit, ref] of [
    ['plx_value', 'mas', 'plx_bibcode'], ['plx_err', 'mas', 'plx_bibcode'],
    ['pmra', 'mas/year', 'pm_bibcode'], ['pmdec', 'mas/year', 'pm_bibcode'],
    ['rvz_redshift', null, 'rvz_bibcode'], ['rvz_radvel', 'km/s', 'rvz_bibcode'],
  ]) measurements[key!] = { value: sourceNumber(row, key!), unit, reference: row[ref!] || null };
  for (const [key, ref] of [['sp_type', 'sp_bibcode'], ['morph_type', 'morph_bibcode'], ['coo_qual', 'coo_bibcode']]) {
    measurements[key] = { value: row[key] || null, unit: null, reference: row[ref] || null };
  }
  return { schemaVersion: 1, source: { catalog: 'simbad-oid', release: origin.snapshotDate, value: oid },
    snapshotSha256: origin.sha256, queryUrl: origin.url, names: [...new Set([row.main_id.trim(), ...aliases])], identifiers,
    objectType: row.otype || null,
    // TAP basic has no per-row epoch column. Preserve that uncertainty before matching positions.
    astrometry: { frame: 'ICRS', equinox: null, epochJulianYear: null, raDegrees: ra, decDegrees: dec, reference: row.coo_bibcode || null },
    measurements, flags: ['coordinate-epoch-not-in-query', 'distance-policy-not-applied'] };
}
