import { ATHYG_SOURCE } from './athyg-source.mjs';

const increment = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

export function createReport(source = ATHYG_SOURCE) {
  return {
    schemaVersion: 1, catalog: source.catalog, release: source.release,
    inputRows: 0, acceptedRows: 0, rejectedRows: 0,
    position3d: { available: 0, missing: 0, invalid: 0 },
    rejectionReasons: Object.create(null), qualityFlags: Object.create(null),
    distanceSources: Object.create(null), positionSources: Object.create(null),
    properNames: 0, missingSpectrum: 0, missingColorIndex: 0,
    gaiaIdsAboveJsSafeInteger: 0,
    distanceRangeParsecs: [null, null],
    maxDistanceNormDifferenceParsecs: 0,
    limitations: [
      'Numerical validity does not establish scientific distance reliability.',
      'Per-measurement errors and epochs are absent; epoch is explicitly null, equinox is J2000.0.',
      'Some secondary-star distances were assigned from their primary by the upstream compiler.',
      'Gaia IDs identify DR3; distance and velocity source codes are independent.',
      'Positions are preserved in source parsecs; no game-scale conversion or solar recentering.',
      'Identity collisions remain separate records and are not merged automatically.',
    ],
  };
}

export function countAccepted(report, record, raw) {
  report.acceptedRows++;
  increment(report.position3d, record.quality.position3d);
  for (const flag of record.quality.flags) increment(report.qualityFlags, flag);
  increment(report.distanceSources, record.position.distanceSourceCode ?? '(missing)');
  increment(report.positionSources, record.position.positionSourceCode ?? '(missing)');
  if (raw.proper.trim()) report.properNames++;
  if (!record.spectrum.value) report.missingSpectrum++;
  if (record.photometry.colorIndex === null) report.missingColorIndex++;
  const gaia = record.identifiers.find(id => id.catalog === 'gaia');
  if (gaia && BigInt(gaia.value) > BigInt(Number.MAX_SAFE_INTEGER)) report.gaiaIdsAboveJsSafeInteger++;
  const distance = record.position.distanceParsecs;
  if (distance !== null) {
    report.distanceRangeParsecs[0] = Math.min(report.distanceRangeParsecs[0] ?? distance, distance);
    report.distanceRangeParsecs[1] = Math.max(report.distanceRangeParsecs[1] ?? distance, distance);
    const xyz = record.position.cartesianParsecs;
    if (xyz) report.maxDistanceNormDifferenceParsecs = Math.max(report.maxDistanceNormDifferenceParsecs, Math.abs(Math.hypot(...xyz) - distance));
  }
}

export function countRejected(report, reason) {
  report.rejectedRows++;
  increment(report.rejectionReasons, reason);
}

export function sourceManifest(source) {
  return {
    schemaVersion: 1, catalog: source.catalog, release: source.release, revision: source.commit,
    archive: { path: source.path, bytes: source.archiveBytes, sha256: source.archiveSha256 },
    sourceUrl: source.repository, author: 'David Nash / Astronomy Nexus',
    documentationUrls: [
      `${source.repository}/src/commit/${source.commit}/README.md`,
      `${source.repository}/src/commit/${source.commit}/STEPS_V4.txt`,
      `${source.repository}/src/commit/${source.commit}/ACKNOWLEDGMENTS.md`,
      'https://codeberg.org/astronexus/brahe/src/commit/50348755083917388f6a0a8e3275011d1bdc3740/consts.go',
    ],
    coordinatePolicy: {
      frame: 'equatorial', equinox: 'J2000.0', epochJulianYear: null,
      distanceUnit: 'parsec', velocityUnit: 'km/s', gameScaleApplied: false,
    },
    rights: {
      declaredLicense: source.declaredLicense, upstreamGaiaLicense: source.upstreamGaiaLicense,
      commercialPermission: source.commercialPermission,
    },
  };
}
