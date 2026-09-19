/** Catalogue data only: no renderer, game scale, network or flight dependencies. */
export type CatalogVector3 = readonly [number, number, number];

export interface CatalogIdentifier {
  catalog: string;
  /** Null means the source has not specified a release, not the latest release. */
  release: string | null;
  value: string;
}

export interface CatalogPosition {
  frame: 'equatorial';
  equinox: 'J2000.0';
  /** Equinox is not the epoch of an individual measurement. Do not conflate them. */
  epochJulianYear: number | null;
  raHours: number | null;
  decDegrees: number | null;
  distanceParsecs: number | null;
  cartesianParsecs: CatalogVector3 | null;
  positionSourceCode: string | null;
  distanceSourceCode: string | null;
}

export interface CatalogRecord {
  schemaVersion: 1;
  /** Stable within a pinned catalogue version; later releases need explicit links. */
  id: string;
  kind: 'star' | 'galaxy' | 'quasar' | 'nebula' | 'cluster' | 'unknown';
  source: CatalogIdentifier;
  identifiers: CatalogIdentifier[];
  names: string[];
  constellation: string | null;
  position: CatalogPosition;
  photometry: {
    apparentMagnitude: number | null;
    absoluteMagnitude: number | null;
    colorIndex: number | null;
    sourceCode: string | null;
    /** AT-HYG mixes passbands; it must not be labelled uniformly Johnson B-V. */
    band: 'source-dependent';
  };
  motion: {
    properMotionRaMasYear: number | null;
    properMotionDecMasYear: number | null;
    radialVelocityKmSec: number | null;
    cartesianVelocityKmSec: CatalogVector3 | null;
    properMotionSourceCode: string | null;
    radialVelocitySourceCode: string | null;
  };
  spectrum: { value: string | null; sourceCode: string | null };
  quality: {
    /** A numerical check, not a scientific reliability classification. */
    position3d: 'available' | 'missing' | 'invalid';
    measurementErrors: 'not-in-source';
    flags: string[];
  };
}

export interface CatalogSourceManifest {
  schemaVersion: 1;
  catalog: string;
  release: string;
  revision: string;
  archive: { path: string; bytes: number; sha256: string };
  sourceUrl: string;
  author: string;
  documentationUrls: string[];
  coordinatePolicy: {
    frame: 'equatorial'; equinox: 'J2000.0'; epochJulianYear: null;
    distanceUnit: 'parsec'; velocityUnit: 'km/s';
    gameScaleApplied: false;
  };
  rights: { declaredLicense: string; upstreamGaiaLicense: string; commercialPermission: 'not-obtained' };
}
