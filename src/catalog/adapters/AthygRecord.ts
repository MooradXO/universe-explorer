import type { CatalogIdentifier, CatalogRecord, CatalogVector3 } from '../CatalogTypes.ts';

export const ATHYG_FIELDS = [
  'id', 'tyc', 'gaia', 'hyg', 'hip', 'hd', 'hr', 'gl', 'bayer', 'flam', 'con', 'proper',
  'ra', 'dec', 'pos_src', 'dist', 'x0', 'y0', 'z0', 'dist_src', 'mag', 'absmag', 'ci',
  'mag_src', 'rv', 'rv_src', 'pmra', 'pmdec', 'pm_src', 'vx', 'vy', 'vz', 'spect', 'spect_src',
] as const;

export type AthygRow = Record<(typeof ATHYG_FIELDS)[number], string>;
export type AthygNormalization =
  | { accepted: true; record: CatalogRecord }
  | { accepted: false; reason: string };

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const UNSIGNED_INTEGER = /^(?:0|[1-9]\d*)$/;
const text = (value: string) => value.trim() || null;

export function validateAthygHeader(fields: readonly string[]): void {
  if (fields.length !== ATHYG_FIELDS.length || fields.some((field, index) => field !== ATHYG_FIELDS[index])) {
    throw new Error('Unexpected AT-HYG 4.0 CSV schema; import stopped.');
  }
}

export function normalizeAthygRow(row: AthygRow): AthygNormalization {
  if (!UNSIGNED_INTEGER.test(row.id) || row.id === '0') return { accepted: false, reason: 'invalid-primary-id' };
  const flags: string[] = [];
  function number(field: keyof AthygRow): number | null {
    const value = row[field].trim();
    if (!value) return null;
    if (!DECIMAL.test(value) || !Number.isFinite(Number(value))) {
      flags.push(`invalid-number:${field}`);
      return null;
    }
    return Number(value);
  }
  const identifiers: CatalogIdentifier[] = [];
  function identifier(field: keyof AthygRow, catalog: string, release: string | null, integer = true) {
    const value = text(row[field]);
    if (value === null) return;
    if (integer && (!UNSIGNED_INTEGER.test(value) || (value === '0' && catalog !== 'hyg'))) {
      flags.push(`invalid-identifier:${field}`); return;
    }
    identifiers.push({ catalog, release, value });
  }
  identifier('tyc', 'tycho', '2', false);
  // STEPS_V4.txt explicitly distinguishes DR3 IDs from DR2/DR3 distance sources.
  identifier('gaia', 'gaia', 'DR3');
  identifier('hyg', 'hyg', null);
  identifier('hip', 'hipparcos', null);
  identifier('hd', 'henry-draper', null);
  identifier('hr', 'bright-star', null);
  identifier('gl', 'gliese-jahreiss', null, false);

  let ra = number('ra');
  let dec = number('dec');
  let distance = number('dist');
  if (ra !== null && (ra < 0 || ra >= 24)) { flags.push('ra-out-of-range'); ra = null; }
  if (dec !== null && Math.abs(dec) > 90) { flags.push('dec-out-of-range'); dec = null; }
  if (distance !== null && distance < 0) { flags.push('negative-distance'); distance = null; }
  const xyz = [number('x0'), number('y0'), number('z0')];
  let cartesian: CatalogVector3 | null = xyz.every(value => value !== null) ? xyz as unknown as CatalogVector3 : null;
  const hasInvalidPositionNumber = flags.some(flag => /^(invalid-number:(ra|dec|dist|x0|y0|z0)|ra-out-of-range|dec-out-of-range|negative-distance)$/.test(flag));
  let position3d: CatalogRecord['quality']['position3d'] = hasInvalidPositionNumber ? 'invalid' : 'available';
  if (cartesian === null || distance === null || ra === null || dec === null || row.dist_src === 'N') {
    if (position3d !== 'invalid') position3d = 'missing';
    cartesian = null;
    flags.push('no-usable-3d-position');
  } else {
    // Tolerance only accommodates CSV rounding, not astronomical uncertainty.
    const roundingTolerance = Math.max(0.001, distance * 1e-6);
    if (Math.abs(Math.hypot(...cartesian) - distance) > roundingTolerance) {
      flags.push('distance-xyz-inconsistent');
      position3d = 'invalid';
      cartesian = null;
    }
  }
  if (position3d === 'invalid') cartesian = null;
  if (row.id === '1') flags.push('source-solar-reference-preserved');
  const velocity = [number('vx'), number('vy'), number('vz')];
  const radialVelocity = number('rv');
  const cartesianVelocity = velocity.every(value => value !== null) ? velocity as unknown as CatalogVector3 : null;
  if (cartesianVelocity !== null && radialVelocity === null) flags.push('cartesian-velocity-without-measured-rv');
  const names = [text(row.proper)];
  if (text(row.con)) {
    if (text(row.bayer)) names.push(`${row.bayer.trim()} ${row.con.trim()}`);
    if (text(row.flam)) names.push(`${row.flam.trim()} ${row.con.trim()}`);
  }
  return { accepted: true, record: {
    schemaVersion: 1,
    id: `athyg:4.0:${row.id}`,
    kind: 'star',
    source: { catalog: 'athyg', release: '4.0', value: row.id },
    identifiers,
    names: [...new Set(names.filter((name): name is string => name !== null))],
    constellation: text(row.con),
    position: {
      frame: 'equatorial', equinox: 'J2000.0', epochJulianYear: null,
      raHours: ra, decDegrees: dec, distanceParsecs: distance, cartesianParsecs: cartesian,
      positionSourceCode: text(row.pos_src), distanceSourceCode: text(row.dist_src),
    },
    photometry: {
      apparentMagnitude: number('mag'), absoluteMagnitude: number('absmag'), colorIndex: number('ci'),
      sourceCode: text(row.mag_src), band: 'source-dependent',
    },
    motion: {
      properMotionRaMasYear: number('pmra'), properMotionDecMasYear: number('pmdec'),
      radialVelocityKmSec: radialVelocity, cartesianVelocityKmSec: cartesianVelocity,
      properMotionSourceCode: text(row.pm_src), radialVelocitySourceCode: text(row.rv_src),
    },
    spectrum: { value: text(row.spect), sourceCode: text(row.spect_src) },
    quality: { position3d, measurementErrors: 'not-in-source', flags },
  } };
}
