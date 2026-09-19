import { expect, it } from 'vitest';
import type { MapObject } from '../../src/catalog/StarMapData';
import { anchorFromCatalog, distanceBetweenSystemsParsecs, moveWithinSystem, readStellarAddress, stellarAddress } from '../../src/world/space/StellarAddress';
import { FloatingOrigin } from '../../src/world/space/FloatingOrigin';
import { worldPosition } from '../../src/world/space/WorldPosition';

const object = (id = '1', position: [number, number, number] | null = [0.00000485, 0, 0]): MapObject => ({
  id: `athyg:4.0:${id}`, title: 'Test source', positioned: position !== null, position, distance: null,
  names: [], identifiers: [], raHours: null, decDegrees: null, magnitude: null, spectrum: null,
  distanceSource: 'H', positionSource: 'H', flags: ['source-caveat'], gaiaMatches: 0,
});

it('retains local sub-unit precision at a distant catalogue anchor through save, restore and recenter', () => {
  const anchor = anchorFromCatalog(object('42', [900000.123456, -300000.654321, 100000.5]));
  const address = stellarAddress(anchor, worldPosition([1_000_000, -1_000_000, 2], [0.125, -0.0625, 123.5]));
  const restored = readStellarAddress(JSON.parse(JSON.stringify(address)))!;
  expect(restored).toEqual(address);
  const origin = new FloatingOrigin(); origin.moveTo(restored.local);
  const moved = moveWithinSystem(restored, origin.toWorld([0.125, 0.0625, -0.5]));
  expect(moved.local.offset).toEqual([0.25, 0, 123]);
  expect(moved.anchor.positionParsecs).toEqual(anchor.positionParsecs);
});

it('distinguishes systems at the same local position and preserves published identities and caveats', () => {
  const first = anchorFromCatalog(object('1', [0.00000485, 0, 0]));
  const second = anchorFromCatalog(object('2', [3.00000485, 4, 0]));
  const a = stellarAddress(first, worldPosition()), b = stellarAddress(second, worldPosition());
  expect(a.local).toEqual(b.local); expect(a.anchor.catalogId).not.toBe(b.anchor.catalogId);
  expect(distanceBetweenSystemsParsecs(first, second)).toBeCloseTo(5);
  expect(distanceBetweenSystemsParsecs(first, { ...first, positionParsecs: [0, 0, 0] })).toBe(0);
  expect(first.positionParsecs).toEqual([0.00000485, 0, 0]);
  expect(first.qualityFlags).toEqual(['source-caveat']);
});

it('rejects missing positions and invalid saves instead of inventing a system or migrating old XYZ silently', () => {
  expect(() => anchorFromCatalog(object('64', null))).toThrow('3D');
  const value = stellarAddress(anchorFromCatalog(object()), worldPosition());
  expect(readStellarAddress({ position_x: 1, position_y: 2, position_z: 3 })).toBeNull();
  expect(readStellarAddress({ ...value, version: 2 })).toBeNull();
  expect(readStellarAddress({ ...value, local: { sector: [0.1, 0, 0], offset: [0, 0, 0] } })).toBeNull();
  expect(readStellarAddress({ ...value, local: { sector: [0, 0, 0], offset: [NaN, 0, 0] } })).toBeNull();
  expect(readStellarAddress({ ...value, anchor: { ...value.anchor, positionParsecs: [null, 0, 0] } })).toBeNull();
  expect(readStellarAddress({ ...value, anchor: { ...value.anchor, catalogId: 'Gaia DR2 1' } })).toBeNull();
});

it('snapshot data cannot be changed by subsequent mutation of the source object', () => {
  const source = object();
  const address = stellarAddress(anchorFromCatalog(source), worldPosition());
  source.position![0] = 999; source.flags.push('later-change');
  expect(address.anchor.positionParsecs[0]).toBe(0.00000485);
  expect(address.anchor.qualityFlags).toEqual(['source-caveat']);
  expect(Object.isFrozen(address.local.offset)).toBe(true);
});
