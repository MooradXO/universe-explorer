import { sourceIdentity, sourceNumber, validateSkyPosition, type ExternalObservation, type ObservationOrigin } from '../ExternalObservation.ts';

export const GAIA_COLUMNS = [
  'source_id', 'ref_epoch', 'ra', 'dec', 'parallax', 'parallax_error', 'parallax_over_error',
  'pmra', 'pmdec', 'radial_velocity', 'phot_g_mean_mag', 'bp_rp', 'ruwe',
  'duplicated_source', 'teff_gspphot', 'logg_gspphot', 'mh_gspphot', 'distance_gspphot',
] as const;

export function normalizeGaiaObservation(row: Record<string, string>, origin: ObservationOrigin): ExternalObservation {
  const id = sourceIdentity(row.source_id);
  const ra = sourceNumber(row, 'ra'), dec = sourceNumber(row, 'dec');
  validateSkyPosition(ra, dec);
  const units: Record<string, string | null> = {
    parallax: 'mas', parallax_error: 'mas', parallax_over_error: null, pmra: 'mas/year', pmdec: 'mas/year',
    radial_velocity: 'km/s', phot_g_mean_mag: 'mag (Gaia G)', bp_rp: 'mag (Gaia BP-RP)', ruwe: null,
    teff_gspphot: 'K', logg_gspphot: 'log(cm/s2)', mh_gspphot: 'dex', distance_gspphot: 'pc',
  };
  const measurements: ExternalObservation['measurements'] = {};
  for (const [key, unit] of Object.entries(units)) measurements[key] = { value: sourceNumber(row, key), unit, reference: 'Gaia DR3 gaia_source' };
  const boolean = row.duplicated_source?.trim().toLowerCase();
  if (!['true', 'false', '1', '0', ''].includes(boolean)) throw new Error('Invalid duplicated_source');
  measurements.duplicated_source = { value: boolean === '' ? null : ['true', '1'].includes(boolean), unit: null, reference: 'Gaia DR3 gaia_source' };
  const flags: string[] = ['distance-policy-not-applied'];
  if (measurements.parallax.value === null || Number(measurements.parallax.value) <= 0) flags.push('no-positive-parallax');
  if (measurements.distance_gspphot.value !== null) flags.push('gspphot-distance-is-model-estimate');
  // Gaia catalogue entries include nonstellar sources; do not classify every row as a star.
  return { schemaVersion: 1, source: { catalog: 'gaia', release: 'DR3', value: id },
    snapshotSha256: origin.sha256, queryUrl: origin.url, names: [],
    identifiers: [{ catalog: 'gaia', release: 'DR3', value: id }], objectType: null,
    astrometry: { frame: 'ICRS', equinox: null, epochJulianYear: sourceNumber(row, 'ref_epoch'), raDegrees: ra, decDegrees: dec, reference: 'Gaia DR3' },
    measurements, flags };
}
