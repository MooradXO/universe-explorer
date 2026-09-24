import { expect, it, vi } from 'vitest';
import { Texture, TextureLoader, ClampToEdgeWrapping, RepeatWrapping } from 'three';
import { planetDetail } from '../../src/world/environments/PlanetDetail';
import { EnvironmentTextures } from '../../src/world/environments/EnvironmentMaterials';
import { REVIEW_WORLDS } from '../../src/world/environments/EnvironmentReviewWorlds';
import { orbitalZones } from '../../src/world/systems/OrbitalSite';

it('surface detail has a deterministic art stream without changing navigation or colliders', () => {
  const profiles = new Set<string>();
  for (const { body } of REVIEW_WORLDS) {
    const before = JSON.stringify(body), zones = orbitalZones(body);
    const art = planetDetail(body.environment, body.id.startsWith('sol/') ? body.id.slice(4) : '');
    expect(planetDetail(body.environment, body.id.startsWith('sol/') ? body.id.slice(4) : '')).toEqual(art);
    expect(JSON.stringify(body)).toBe(before); expect(orbitalZones(body)).toEqual(zones);
    for (const storm of art.storms) { expect(storm.every(Number.isFinite)).toBe(true); expect(storm[2]).toBeGreaterThan(.1); }
    expect(art.geology).toBeGreaterThanOrEqual(0); expect(art.geology).toBeLessThan(12);
    expect(art.circulation).toBeGreaterThanOrEqual(0); expect(art.circulation).toBeLessThan(8);
    profiles.add(JSON.stringify(art));
  }
  expect(profiles.size).toBe(REVIEW_WORLDS.length);
});

it('loading textures are shared, failed solar maps retain a detectable fallback and released maps free once', () => {
  const loads: { texture: Texture; ready?: (texture: Texture) => void; error?: (error: unknown) => void }[] = [];
  const loader = vi.spyOn(TextureLoader.prototype, 'load').mockImplementation((_url, ready, _progress, error) => {
    const texture = new Texture(); loads.push({ texture, ready, error }); return texture;
  });
  const pool = new EnvironmentTextures(true);
  try {
    const solar = pool.acquire('jupiter'), again = pool.acquire('jupiter'), detail = pool.acquire('clouds');
    expect(again).toBe(solar); expect(loads).toHaveLength(2);
    expect(solar.userData.ready).toBeUndefined(); expect(solar.wrapT).toBe(ClampToEdgeWrapping); expect(detail.wrapT).toBe(RepeatWrapping);
    loads[0].error?.(new Error('offline')); expect(solar.userData.failed).toBe(true); expect(solar.userData.ready).not.toBe(true);
    loads[1].ready?.(detail); expect(detail.userData.ready).toBe(true);
    const disposed = vi.fn(); solar.addEventListener('dispose', disposed);
    pool.release('jupiter'); expect(disposed).not.toHaveBeenCalled();
    pool.release('jupiter'); expect(disposed).toHaveBeenCalledTimes(1);
    pool.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  } finally { pool.dispose(); loader.mockRestore(); }
});
