import { afterAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { readVotable } from '../../scripts/catalog/votable.mjs';
import { RemoteSnapshotClient, csvObjects, gaiaIdLiteral, adqlText } from '../../scripts/catalog/remote-snapshot.mjs';
import { normalizeGaiaObservation, GAIA_COLUMNS } from '../../src/catalog/adapters/GaiaObservation';
import { normalizeSimbadObservation, SIMBAD_COLUMNS } from '../../src/catalog/adapters/SimbadObservation';
import { normalizeNedObservation } from '../../src/catalog/adapters/NedObservation';

const origin = { sha256: 'test-fixture', url: 'https://example.invalid', snapshotDate: '2026-09-15' };
const root = resolve('../.catalog-research'); await mkdir(root, { recursive: true });
const temporary = await mkdtemp(join(root, 'test-expansion-'));
afterAll(async () => {
  const checked = resolve(temporary);
  if (!checked.startsWith(root + sep) || !checked.slice(root.length + 1).startsWith('test-expansion-')) throw new Error('Unsafe cleanup');
  await rm(checked, { recursive: true, force: true });
});

it('Gaia keeps exact IDs, negative parallaxes, source epoch and model distances without inventing XYZ', () => {
  const row = { ...Object.fromEntries(GAIA_COLUMNS.map(key => [key, ''])), source_id: '5853498713190525696',
    ra: '30', dec: '-50', ref_epoch: '2016', parallax: '-0.4', parallax_error: '1', distance_gspphot: '1300' };
  const value = normalizeGaiaObservation(row, origin);
  expect(value.source.value).toBe('5853498713190525696');
  expect(value.astrometry).toMatchObject({ frame: 'ICRS', equinox: null, epochJulianYear: 2016 });
  expect(value.measurements.parallax.value).toBe(-0.4);
  expect(value.measurements.distance_gspphot.value).toBe(1300);
  expect(value.flags).toContain('no-positive-parallax'); expect(value.flags).toContain('gspphot-distance-is-model-estimate');
  expect(value.objectType).toBeNull(); expect('cartesianParsecs' in value.astrometry).toBe(false);
  expect(() => normalizeGaiaObservation({ ...row, ra: '360' }, origin)).toThrow('range');
  expect(() => normalizeGaiaObservation({ ...row, parallax: 'Infinity' }, origin)).toThrow('number');
});

it('SIMBAD keeps source identifiers and references, and does not attach DR2 identities to DR3', () => {
  const row = { ...Object.fromEntries(SIMBAD_COLUMNS.map(key => [key, ''])), oid: '42', main_id: '* Test A', otype: '**',
    ra: '12', dec: '34', plx_value: '10', plx_bibcode: 'test-reference' };
  const value = normalizeSimbadObservation(row, ['Gaia DR3 5853498713190525696', 'Gaia DR2 5853498713190525697'], origin);
  expect(value.identifiers.filter(item => item.catalog === 'gaia')).toEqual([{ catalog: 'gaia', release: 'DR3', value: '5853498713190525696' }]);
  expect(value.measurements.plx_value.reference).toBe('test-reference');
  expect(value.names).toContain('Gaia DR2 5853498713190525697');
  expect(value.objectType).toBe('**'); expect(value.astrometry.epochJulianYear).toBeNull();
});

const xml = (extra = '') => `<VOTABLE xmlns="http://www.ivoa.net/xml/VOTable/v1.3"><RESOURCE><INFO name="QUERY_STATUS" value="OK"/>
  <TABLE nrows="1"><FIELD ID="id" name="id" datatype="long"/><FIELD ID="name" name="name" datatype="char"/>
  <DATA><TABLEDATA><TR><TD>5853498713190525696</TD><TD>A &amp; B</TD></TR></TABLEDATA></DATA></TABLE>${extra}</RESOURCE></VOTABLE>`;
it('VOTable preserves text and 64-bit identities, and rejects truncation, malformed XML and entities', () => {
  expect(readVotable(xml()).tables[0].rows).toEqual([{ id: '5853498713190525696', name: 'A & B' }]);
  expect(() => readVotable(xml('<INFO name="QUERY_STATUS" value="OVERFLOW"/>'))).toThrow('OVERFLOW');
  expect(() => readVotable(xml('<GROUP><PARAM name="RECORDS_AVAILABLE" value="2"/><PARAM name="RECORDS_RETURNED" value="1"/></GROUP>'))).toThrow('Truncated');
  expect(() => readVotable(xml().replace('nrows="1"', 'nrows="2"'))).toThrow('nrows');
  expect(() => readVotable('<!DOCTYPE VOTABLE [<!ENTITY x SYSTEM "file:///private">]>' + xml())).toThrow('entities');
  expect(() => readVotable(xml().slice(0, -30))).toThrow();
  expect(() => readVotable(xml(), { maxRows: 0 })).toThrow('row budget');
});

it('NED keeps redshift independent distances separate from Hubble distances and records the service cosmology', () => {
  const row = { CrossID_list: 'Example galaxy; Example alias', equ_j2000_lon: '10', equ_j2000_lat: '20',
    z: '-0.001', mean_distance: '0.8', SEM_distance: '0.01', d_Sun_3K: '', ptype: 'G' };
  const value = normalizeNedObservation(row, [
    { key: 'z', unit: null }, { key: 'mean_distance', unit: 'Mpc' }, { key: 'SEM_distance', unit: 'Mpc' }, { key: 'd_Sun_3K', unit: 'Mpc' },
  ], { HCONST: '67.8', OMEGAM: '0.308', OMEGAV: '0.692' }, 'Example galaxy', origin);
  expect(value.measurements.z.value).toBe(-0.001);
  expect(value.measurements.mean_distance).toMatchObject({ value: 0.8, unit: 'Mpc' });
  expect(value.measurements.d_Sun_3K.value).toBeNull(); expect(value.measurements.HCONST.value).toBe('67.8');
  expect(value.objectType).toBe('G'); expect(value.astrometry.frame).toBe('FK5');
  expect(value.flags).toContain('redshift-not-converted-to-xyz');
});

it('remote snapshots serialize requests, cap response bytes and preserve checksums with no unsafe identifiers', async () => {
  let inFlight = 0, maximum = 0; const gaps: number[] = [];
  const client = new RemoteSnapshotClient(temporary, {
    fetchImpl: async () => { maximum = Math.max(maximum, ++inFlight); await Promise.resolve(); inFlight--; return new Response('abc'); },
    delayImpl: async (ms: number) => { gaps.push(ms); },
  });
  const url = 'https://ned.ipac.caltech.edu/NED::API/OverviewOfObject?TARGET=example';
  const values = await Promise.all([client.get('one', url), client.get('two', url)]);
  expect(maximum).toBe(1); expect(gaps[0]).toBeGreaterThan(900);
  expect(values[0].metadata.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(await readFile(join(temporary, 'one.csv'), 'utf8')).toBe('abc');
  await expect(client.get('large', url, { maxBytes: 2 })).rejects.toThrow('byte budget');
  await expect(client.get('../escape', url)).rejects.toThrow('filename');
  await expect(client.get('wrong', 'https://other.invalid')).rejects.toThrow('host');
  expect(gaiaIdLiteral('5853498713190525696')).toBe('5853498713190525696');
  expect(() => gaiaIdLiteral('1 OR 1=1')).toThrow(); expect(adqlText("A'B")).toBe("'A''B'");
  expect(await csvObjects('id,name\n5853498713190525696,star\n', ['id', 'name'])).toEqual([{ id: '5853498713190525696', name: 'star' }]);
  await expect(csvObjects('bad\n1\n', ['id'])).rejects.toThrow('schema');
});
