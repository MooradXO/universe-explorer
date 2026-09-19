/** Distances and body radii use one linear scale. Ship models are gameplay representations. */
export const SYSTEM_CONFIG = Object.freeze({
  kilometersPerUnit: 10,
  auKilometers: 149_597_870.7,
  unitsPerAu: 14_959_787.07,
  unitsPerParsec: 14_959_787.07 * 648000 / Math.PI,
  epochJulianDate: 2451545,
  renderDistance: 80_000,
  cruiseMaxSpeed: 14_959_787.07 * 0.5,
  cruiseResponseSeconds: 1,
  cruiseMargin: 3000,
  arrivalMargin: 6000,
  warpSeconds: 2.4,
  homeSystemId: 'athyg:4.0:1',
});
