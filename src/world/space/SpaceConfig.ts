/** Tuning budgets are independent of the versioned catalog generation rules. */
export const SPACE_CONFIG = Object.freeze({
  sectorSize: 50_000,
  manifestRadius: 2,
  navigationRadius: 1,
  recenterDistance: 10_000,
  manifestConcurrency: 2,
  high: { planetRadius: 15_000, maxPlanets: 16 },
  low: { planetRadius: 8_000, maxPlanets: 8 },
});
