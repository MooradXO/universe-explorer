import type { Triple } from '../space/WorldPosition';

export interface KeplerElements {
  semiMajorAu: number; eccentricity: number; inclinationDegrees: number;
  meanLongitudeDegrees: number; perihelionDegrees: number; ascendingNodeDegrees: number;
}
const radians = Math.PI / 180;
/** Fixed J2000 snapshot; elliptical positions, not a live precision ephemeris. */
export function keplerPosition(elements: KeplerElements, eccentricAnomaly?: number): Triple {
  const { semiMajorAu: a, eccentricity: e } = elements;
  if (!(a > 0) || !(e >= 0 && e < 1) || !Object.values(elements).every(Number.isFinite)) throw new Error('Invalid orbit');
  const mean = ((elements.meanLongitudeDegrees - elements.perihelionDegrees) * radians) % (2 * Math.PI);
  let anomaly = eccentricAnomaly ?? mean;
  if (eccentricAnomaly === undefined) for (let i = 0; i < 20; i++) {
    const correction = (anomaly - e * Math.sin(anomaly) - mean) / (1 - e * Math.cos(anomaly));
    anomaly -= correction; if (Math.abs(correction) < 1e-12) break;
  }
  const x = a * (Math.cos(anomaly) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(anomaly);
  const argument = (elements.perihelionDegrees - elements.ascendingNodeDegrees) * radians;
  const node = elements.ascendingNodeDegrees * radians, inclination = elements.inclinationDegrees * radians;
  const c = Math.cos(argument), s = Math.sin(argument), cn = Math.cos(node), sn = Math.sin(node), ci = Math.cos(inclination), si = Math.sin(inclination);
  const ex = (c * cn - s * sn * ci) * x + (-s * cn - c * sn * ci) * y;
  const ey = (c * sn + s * cn * ci) * x + (-s * sn + c * cn * ci) * y;
  const ez = s * si * x + c * si * y;
  const obliquity = 23.43928 * radians;
  const eqY = Math.cos(obliquity) * ey - Math.sin(obliquity) * ez;
  const eqZ = Math.sin(obliquity) * ey + Math.cos(obliquity) * ez;
  // Equatorial X,Y,Z -> Three X,Y,Z, with celestial north along Three +Y.
  return [ex, eqZ, -eqY];
}
