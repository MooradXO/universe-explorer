import { sourceNumber, validateSkyPosition, type ExternalObservation, type ObservationOrigin } from '../ExternalObservation.ts';

export function normalizeNedObservation(row: Record<string, string>, fields: { key: string; unit: string | null }[],
  params: Record<string, string>, target: string, origin: ObservationOrigin): ExternalObservation {
  const ra = sourceNumber(row, 'equ_j2000_lon'), dec = sourceNumber(row, 'equ_j2000_lat');
  validateSkyPosition(ra, dec);
  const names = row.CrossID_list?.split(';').map(value => value.trim()).filter(Boolean) ?? [];
  if (!names.length) throw new Error('Missing NED cross-identification');
  const measurements: ExternalObservation['measurements'] = {};
  for (const key of ['z', 'unc_z', 'v_Sun', 'unc_v_Sun', 'd_Sun_3K', 'unc_d_Sun_3K', 'mean_distance', 'SEM_distance', 'o_diam_maj_dia', 'diameter_kpc']) {
    const field = fields.find(value => value.key === key);
    if (field) measurements[key] = { value: sourceNumber(row, key), unit: field.unit,
      reference: key.includes('diam') ? row.diameter_refcode || null : ['z', 'unc_z', 'v_Sun', 'unc_v_Sun'].includes(key) ? row.z_refcode || null : null };
  }
  for (const key of ['o_class_morph', 'o_class_activity', 'o_footnote']) if (key in row) measurements[key] = { value: row[key] || null, unit: null, reference: key === 'o_class_morph' ? row.morph_refcode || null : key === 'o_class_activity' ? row.activity_refcode || null : null };
  for (const key of ['HCONST', 'OMEGAM', 'OMEGAV']) measurements[key] = { value: params[key] || null, unit: key === 'HCONST' ? 'km/s/Mpc' : null, reference: 'NED query parameters' };
  return { schemaVersion: 1, source: { catalog: 'ned', release: origin.snapshotDate, value: names[0] },
    snapshotSha256: origin.sha256, queryUrl: origin.url, names: [...new Set([...names, target])],
    identifiers: names.map(value => ({ catalog: 'ned-name', release: origin.snapshotDate, value })), objectType: row.ptype || null,
    astrometry: { frame: 'FK5', equinox: 'J2000.0', epochJulianYear: null, raDegrees: ra, decDegrees: dec, reference: row.pos_refcode || null },
    measurements, flags: ['redshift-not-converted-to-xyz', 'distance-method-selection-pending'] };
}
