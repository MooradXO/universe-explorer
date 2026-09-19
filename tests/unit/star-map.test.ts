import { afterAll, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { buildStarTiles } from '../../scripts/catalog/star-tiles.mjs';
import { openMapCatalog, createMapMiddleware } from '../../scripts/catalog/map-server.mjs';
import { createCatalogServer } from '../../scripts/server/catalog-server.mjs';
import { decodeStarTile, type StarTileNode } from '../../src/catalog/StarMapData';
import { selectStarTiles, StarTileCache } from '../../src/catalog/StarMapLod';

const root = resolve('../.catalog-research');
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, 'test-map-'));
afterAll(async () => {
  const checked = resolve(directory);
  if (!checked.startsWith(root + sep) || !checked.slice(root.length + 1).startsWith('test-map-')) throw new Error('Unsafe cleanup');
  await rm(checked, { recursive: true, force: true });
});
const arrayBuffer = (value: Buffer) => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;

it('spatial export preserves every leaf identity once, exact coincident positions and distant local precision', async () => {
  const count = 300;
  const data = { ids: Uint32Array.from({ length: count }, (_, i) => i + 1),
    positions: Float64Array.from({ length: count * 3 }, (_, i) => i < 180 ? 999999.125 : i * 0.125 - 100),
    magnitudes: new Float32Array(count).fill(8), colors: new Float32Array(count).fill(NaN) };
  const location = join(directory, 'tiles');
  const result = await buildStarTiles(data, location, { leafSize: 16, sampleSize: 8 });
  const leaves: number[] = [];
  for (const node of result.nodes) {
    const tile = decodeStarTile(arrayBuffer(gunzipSync(await readFile(join(location, `${node.key}.bin.gz`)))));
    expect(tile.ids.length).toBeLessThanOrEqual(16);
    if (!node.children.length) {
      leaves.push(...tile.ids);
      tile.ids.forEach((id, index) => {
        for (let axis = 0; axis < 3; axis++) expect(tile.positions[index * 3 + axis] + node.center[axis]).toBe(data.positions[(id - 1) * 3 + axis]);
      });
    }
  }
  expect(leaves.sort((a, b) => a - b)).toEqual([...data.ids]);
  expect(() => decodeStarTile(new ArrayBuffer(4))).toThrow();
  const corrupted = gunzipSync(await readFile(join(location, 'r.bin.gz'))); corrupted.writeUInt32LE(999999, 8);
  expect(() => decodeStarTile(arrayBuffer(corrupted))).toThrow();
});

it('LOD cut excludes parents of selected children and stays within both budgets', () => {
  const node = (key: string, children: string[] = []): StarTileNode => ({ key, center: [0, 0, 0], radius: 1, count: 30, points: 10, children, bytes: 10 });
  const nodes = new Map([node('r', ['r0', 'r1']), node('r0', ['r00', 'r01']), node('r1'), node('r00'), node('r01')].map(value => [value.key, value]));
  expect(selectStarTiles('r', nodes, () => 2, () => true, 3, 30).sort()).toEqual(['r00', 'r01', 'r1']);
  expect(selectStarTiles('r', nodes, () => 2, () => true, 3, 20).sort()).toEqual(['r0', 'r1']);
  expect(selectStarTiles('r', nodes, () => 2, () => true, 1, 30)).toEqual(['r']);
});

it('tile loads are bounded, cuts change atomically, stale completions and closed resources are disposed', async () => {
  const pending = new Map<string, (value: string) => void>(); const disposed: string[] = [];
  const cache = new StarTileCache<string>(4, key => new Promise(done => pending.set(key, done)), value => disposed.push(value));
  cache.setDesired(['r']); pending.get('r')!('r');
  await vi.waitFor(() => expect(cache.active).toEqual(['r']));
  cache.setDesired(['a', 'b', 'c']); expect(cache.pending).toBe(2);
  pending.get('a')!('a'); await vi.waitFor(() => expect(pending.has('c')).toBe(true));
  expect(cache.active).toEqual(['r']);
  cache.setDesired(['d']); pending.get('b')!('b'); pending.get('c')!('c');
  await vi.waitFor(() => expect(pending.has('d')).toBe(true));
  pending.get('d')!('d'); await vi.waitFor(() => expect(cache.active).toEqual(['d']));
  cache.setDesired(['e']); cache.close(); pending.get('e')!('e');
  await vi.waitFor(() => expect(disposed.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'r']));
  expect(cache.entries.size).toBe(0); expect(cache.pending).toBe(0);
});

it('search keeps long Gaia IDs and ambiguous components, exposes missing distances and rejects query injection', async () => {
  const location = join(directory, 'service'); await mkdir(location);
  await writeFile(join(location, 'manifest.json'), JSON.stringify({ version: 1, unit: 'parsec', nodes: [] }));
  const db = new DatabaseSync(join(location, 'search.sqlite'));
  db.exec('CREATE TABLE objects(id INTEGER PRIMARY KEY,gaia TEXT,tyc TEXT,hip TEXT,hd TEXT,hr TEXT,gl TEXT,title TEXT,distance REAL,positioned INTEGER,card TEXT); CREATE VIRTUAL TABLE names USING fts5(text,id UNINDEXED);');
  const gaia = '5310000000000000001';
  const insert = db.prepare('INSERT INTO objects VALUES(?,?,NULL,NULL,NULL,NULL,NULL,?,?,?,?)');
  for (const [id, title, positioned] of [[1, 'Sol', 1], [2, 'Sirius', 1], [3, 'Unknown companion', 0]] as const) {
    insert.run(id, id === 1 ? null : gaia, title, positioned ? 2 : null, positioned, JSON.stringify({ id: `athyg:4.0:${id}`, title, position: positioned ? [2, 0, 0] : null }));
    db.prepare('INSERT INTO names VALUES(?,?)').run(title, id);
  }
  db.close();
  const catalog = openMapCatalog(location);
  expect(catalog.search(`Gaia DR3 ${gaia}`).map(value => value.id)).toEqual(['athyg:4.0:2', 'athyg:4.0:3']);
  expect(catalog.search(gaia)).toHaveLength(2);
  expect(catalog.search('Солнце')[0].title).toBe('Sol');
  expect(catalog.search('sir')[0].title).toBe('Sirius');
  expect(catalog.search('AT-HYG 3')[0]).toMatchObject({ positioned: false, distance: null });
  expect(catalog.object('3')).toMatchObject({ gaiaMatches: 2, position: null });
  expect(catalog.search("' OR 1=1 --")).toEqual([]);
  expect(catalog.object('../search.sqlite')).toBeNull(); catalog.close();
  const service = createMapMiddleware(location);
  const server = createServer((req, res) => service.middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    expect((await fetch(`${base}/__catalog/search?q=Sol`)).status).toBe(200);
    expect((await fetch(`${base}/__catalog/manifest`, { headers: { Origin: 'http://foreign.test' } })).status).toBe(403);
    expect((await fetch(`${base}/__catalog/manifest`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/__catalog/search.sqlite`)).status).toBe(404);
  } finally { await new Promise<void>(done => server.close(() => done())); service.close(); }
  const production = createCatalogServer({ catalogDirectory: location, cacheDirectory: join(directory, 'production-cache') });
  await new Promise<void>(done => production.listen(0, '127.0.0.1', done));
  const upstream = `http://127.0.0.1:${(production.address() as { port: number }).port}`;
  try {
    expect(await (await fetch(`${upstream}/healthz`)).json()).toEqual({ service: 'universe-catalog', ready: true });
    expect((await (await fetch(`${upstream}/__catalog/search?q=Sol`)).json())[0].title).toBe('Sol');
    expect((await fetch(`${upstream}/__catalog/search.sqlite`)).status).toBe(404);
    expect((await fetch(`${upstream}/.env`)).status).toBe(404);
    expect((await fetch(`${upstream}/__catalog/manifest`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${upstream}/__catalog/manifest`, { headers: { Origin: 'https://foreign.test' } })).status).toBe(403);
  } finally { await new Promise<void>(done => production.close(() => done())); }
  expect(() => createCatalogServer({ catalogDirectory: join(directory, 'missing'), cacheDirectory: directory })).toThrow();
});
