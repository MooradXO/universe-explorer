import { describe, expect, it, vi } from 'vitest';
import { createPlanetCatalog } from '../../src/world/celestial/PlanetCatalog';
import { createSeededRandom, WORLD_SEED } from '../../src/world/celestial/WorldSeed';
import layout from '../fixtures/planet-layout-v1.json';

describe('versioned planet catalog', () => {
  it('reproduces the measured v1 positions, radii and seeds', () => {
    expect(WORLD_SEED).toBe('universe-explorer:world:v1');
    expect(createPlanetCatalog(50_000).map((planet) => ({
      id: planet.planetId, position: planet.position, radius: planet.radius, seed: planet.seed,
    }))).toEqual(layout);
  });

  it('is independent of the clock, ambient randomness and previous generations', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unseeded randomness'); });
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Local clock'); });
    try {
      const first = createPlanetCatalog(50_000);
      createPlanetCatalog(25_000, 'another-universe:v1');
      expect(createPlanetCatalog(50_000)).toEqual(first);
      expect(createPlanetCatalog(50_000, 'universe-explorer:world:v2')).not.toEqual(first);
      expect(new Set(first.map((planet) => planet.planetId)).size).toBe(80);
      for (const planet of first) {
        expect(planet.position.every((value) => Number.isFinite(value) && Math.abs(value) <= 18_750)).toBe(true);
        expect(planet.visual.cloudCoverage).toBeGreaterThanOrEqual(0);
        expect(planet.visual.cloudCoverage).toBeLessThanOrEqual(1);
        expect(planet.moons.length).toBeGreaterThanOrEqual(1);
        expect(planet.moons.length).toBeLessThanOrEqual(3);
      }
    } finally { random.mockRestore(); clock.mockRestore(); }
  });

  it('rejects invalid world extents', () => {
    for (const extent of [0, -1, Infinity, NaN]) expect(() => createPlanetCatalog(extent)).toThrow(RangeError);
  });

  it('keeps RNG outputs bounded even with overflow and negative seeds', () => {
    for (const seed of [0, -1, 0xffffffff]) {
      const random = createSeededRandom(seed);
      for (let i = 0; i < 10_000; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });
});
