import { afterAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { ObservationCache } from '../../scripts/catalog/observation-cache.mjs';
import { OnlineCatalog, validateOnlineQuery } from '../../scripts/catalog/online-catalog.mjs';
import { GAIA_COLUMNS } from '../../src/catalog/adapters/GaiaObservation';
import { SIMBAD_COLUMNS } from '../../src/catalog/adapters/SimbadObservation';

const root = resolve('../.catalog-research'); await mkdir(root, { recursive: true });
const temporary = await mkdtemp(join(root, 'test-online-'));
afterAll(async () => {
  const checked = resolve(temporary);
  if (!checked.startsWith(root + sep) || !checked.slice(root.length + 1).startsWith('test-online-')) throw new Error('Unsafe cleanup');
  await rm(checked, { recursive: true, force: true });
});
const url = (id: number) => `https://ned.ipac.caltech.edu/NED::API/OverviewOfObject?TARGET=${id}`;
const validate = (entry: { body: string }) => JSON.parse(entry.body);

it('deduplicates in-flight downloads and reads saved data with the network unavailable after restart', async () => {
  let calls = 0;
  const directory = join(temporary, 'reuse');
  const cache = new ObservationCache(directory, { fetchImpl: async () => { calls++; return new Response('{"id":"5853498713190525696"}'); } });
  const [a, b] = await Promise.all([cache.get(url(1), 'xml', validate), cache.get(url(1), 'xml', validate)]);
  expect(a).toEqual(b); expect(calls).toBe(1);
  const restarted = new ObservationCache(directory, { fetchImpl: async () => { throw new Error('offline'); } });
  const saved = await restarted.get(url(1), 'xml', validate);
  expect(saved.value.id).toBe('5853498713190525696'); expect(saved.cache).toBe('cached');
  expect((await readdir(directory)).length).toBe(1);
});

it('evicts old entries to a hard disk budget and never persists oversized or invalid replies', async () => {
  const directory = join(temporary, 'budget'); const maxBytes = 3200;
  const cache = new ObservationCache(directory, { maxBytes, delayImpl: async () => {},
    fetchImpl: async () => new Response(JSON.stringify({ text: 'x'.repeat(1000) })) });
  for (let id = 1; id <= 5; id++) {
    await cache.get(url(id), 'xml', validate);
    const sizes = await Promise.all((await readdir(directory)).map(async file => (await stat(join(directory, file))).size));
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(maxBytes);
  }
  const files = await readdir(directory);
  expect(files.length).toBeLessThan(5);
  const entries = await Promise.all(files.map(async file => JSON.parse(await readFile(join(directory, file), 'utf8'))));
  expect(entries.some(entry => entry.metadata.url === url(5))).toBe(true);
  expect(entries.some(entry => entry.metadata.url === url(1))).toBe(false);
  const oversized = new ObservationCache(directory, { fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1)) });
  await expect(oversized.get(url(9), 'xml', validate)).rejects.toThrow('byte budget');
  const invalid = new ObservationCache(directory, { fetchImpl: async () => new Response('invalid') });
  await expect(invalid.get(url(10), 'xml', validate)).rejects.toThrow();
  expect((await readdir(directory)).sort()).toEqual(files.sort());
});

it('marks expired fallback as stale and bounds distinct queued requests', async () => {
  const directory = join(temporary, 'stale');
  const first = new ObservationCache(directory, { fetchImpl: async () => new Response('{"saved":true}') });
  await first.get(url(1), 'xml', validate);
  const offline = new ObservationCache(directory, { ttlMs: 0, fetchImpl: async () => { throw new Error('offline'); } });
  expect((await offline.get(url(1), 'xml', validate)).cache).toBe('stale');
  let release!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const bounded = new ObservationCache(join(temporary, 'queue'), { delayImpl: async () => {}, fetchImpl: async () => { await gate; return new Response('{}'); } });
  const pending = Array.from({ length: 8 }, (_, index) => bounded.get(url(index), 'xml', validate));
  await expect(bounded.get(url(10), 'xml', validate)).rejects.toThrow('queue full');
  release(); await Promise.all(pending);
});

const csv = (columns: readonly string[], row: Record<string, string>) => `${columns.join(',')}\n${columns.map(key => row[key] ?? '').join(',')}\n`;
it('enriches with exact release-qualified IDs, preserves component identity and keeps extra aliases auditable', async () => {
  const queries: string[] = [];
  const gaia = '5853498713190525696';
  const service = new OnlineCatalog(join(temporary, 'links'), { delayImpl: async () => {}, fetchImpl: async (target: string) => {
    const query = new URL(target).searchParams.get('QUERY')!; queries.push(query);
    if (query.includes('gaiadr3')) return new Response(csv(GAIA_COLUMNS, { source_id: gaia, ra: '30', dec: '-50', ref_epoch: '2016' }));
    if (query.includes('FROM basic')) return new Response(csv(SIMBAD_COLUMNS, { oid: '123', main_id: 'Test A', otype: '*', ra: '30', dec: '-50' }));
    return new Response(`id\nGaia DR3 ${gaia}\nGaia DR2 1234567890123456789\nTest A\n`);
  } });
  const card = { title: 'Test A', identifiers: [{ catalog: 'gaia', release: 'DR3', value: gaia }], gaiaMatches: 2 };
  const first = await service.enrich(card), second = await service.enrich(card);
  expect(queries.length).toBe(3);
  expect(queries[0]).toContain(`source_id=${gaia}`);
  expect(queries[1]).toContain(`i.id='Gaia DR3 ${gaia}'`);
  expect(first[1].observations[0].identifiers.filter((item: { catalog: string }) => item.catalog === 'gaia')).toHaveLength(1);
  expect(first[1].observations[0].relatedSnapshots[0].url).toContain('QUERY=');
  expect(second.every((value: { cache: string }) => value.cache === 'cached')).toBe(true);
  expect(card.gaiaMatches).toBe(2);
  const unknown = await service.enrich({ title: 'unknown', identifiers: [] });
  expect(unknown.every((value: { status: string }) => value.status === 'not-found')).toBe(true);
  expect(queries.length).toBe(3);
});

it('rejects arbitrary bulk queries and reports a provider failure without inventing an observation', async () => {
  expect(() => validateOnlineQuery('gaia', '1 OR 1=1')).toThrow();
  expect(() => validateOnlineQuery('other', 'M31')).toThrow();
  expect(() => validateOnlineQuery('ned', 'x'.repeat(101))).toThrow();
  const service = new OnlineCatalog(join(temporary, 'failure'), { fetchImpl: async () => new Response('bad', { status: 503 }) });
  expect(await service.lookup('gaia', '5853498713190525696')).toMatchObject({ status: 'unavailable', observations: [] });
});
