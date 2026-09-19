import type { PlanetBiome } from '../celestial/PlanetDescriptor';
import type { KeplerElements } from './KeplerOrbit';

export const SOLAR_SOURCES = {
  orbits: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
  radii: 'https://ssd.jpl.nasa.gov/planets/phys_par.html',
  units: 'https://ssd.jpl.nasa.gov/astro_par.html',
};
interface SolarBody { id: string; name: string; radiusKm: number; color: number; biome: PlanetBiome; orbit: KeplerElements; note: string; }
function planet(id: string, name: string, radiusKm: number, color: number, biome: PlanetBiome, elements: number[], note = ''): SolarBody {
  const [semiMajorAu, eccentricity, inclinationDegrees, meanLongitudeDegrees, perihelionDegrees, ascendingNodeDegrees] = elements;
  return { id, name, radiusKm, color, biome, orbit: { semiMajorAu, eccentricity, inclinationDegrees, meanLongitudeDegrees, perihelionDegrees, ascendingNodeDegrees }, note };
}
/** JPL Table 1 at J2000, plus mean radii. Surface art is illustrative, not satellite imagery. */
export const SOLAR_PLANETS: readonly SolarBody[] = [
  planet('mercury', 'Mercury', 2439.4, 0x96908a, 'rocky', [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593]),
  planet('venus', 'Venus', 6051.8, 0xdabf87, 'desert', [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255]),
  planet('earth', 'Earth', 6371.0084, 0x397eb2, 'forest', [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], 'Position approximates the Earth–Moon barycentre; surface is illustrative.'),
  planet('mars', 'Mars', 3389.5, 0xb76641, 'desert', [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891]),
  planet('jupiter', 'Jupiter', 69911, 0xbe9c78, 'gas', [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909]),
  planet('saturn', 'Saturn', 58232, 0xd9c295, 'gas', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448]),
  planet('uranus', 'Uranus', 25362, 0x87cbce, 'ice', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503]),
  planet('neptune', 'Neptune', 24622, 0x477ccf, 'ice', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574]),
];
