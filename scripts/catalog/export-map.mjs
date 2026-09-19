import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATALOG_DIRECTORY } from './athyg-source.mjs';
import { buildStarTiles } from './star-tiles.mjs';
import { hashFile } from './integrity.mjs';

export async function exportMap(inputDirectory, outputDirectory, onProgress = () => {}) {
  const manifest = JSON.parse(await readFile(join(inputDirectory, 'manifest.json'), 'utf8'));
  const report = JSON.parse(await readFile(join(inputDirectory, 'report.json'), 'utf8'));
  if (manifest.status !== 'complete' || manifest.database.file !== 'catalog.sqlite' ||
    await hashFile(join(inputDirectory, 'catalog.sqlite')) !== manifest.database.sha256) throw new Error('Prepared catalogue integrity failed.');
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, 'INCOMPLETE'), 'Map export in progress.');
  const source = new DatabaseSync(join(inputDirectory, 'catalog.sqlite'), { readOnly: true });
  const search = new DatabaseSync(join(outputDirectory, 'search.sqlite'));
  const count = report.position3d.available;
  const data = { ids: new Uint32Array(count), positions: new Float64Array(count * 3), magnitudes: new Float32Array(count), colors: new Float32Array(count) };
  let positioned = 0, total = 0;
  try {
    search.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-32768;
      CREATE TABLE objects(id INTEGER PRIMARY KEY, gaia TEXT, tyc TEXT, hip TEXT, hd TEXT, hr TEXT, gl TEXT,
        title TEXT NOT NULL, distance REAL, positioned INTEGER NOT NULL, card TEXT NOT NULL);
      CREATE VIRTUAL TABLE names USING fts5(text, id UNINDEXED, tokenize='unicode61 remove_diacritics 2'); BEGIN;`);
    const insert = search.prepare('INSERT INTO objects VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const named = search.prepare('INSERT INTO names(text,id) VALUES(?,?)');
    for (const stored of source.prepare('SELECT record_json FROM objects ORDER BY row_number').iterate()) {
      const record = JSON.parse(stored.record_json);
      const id = Number(record.source.value);
      if (!Number.isSafeInteger(id) || id < 1 || id > 0xffffffff) throw new Error('Internal AT-HYG ID exceeds tile format.');
      const identifier = catalog => record.identifiers.find(value => value.catalog === catalog)?.value ?? null;
      const gaia = identifier('gaia'), tyc = identifier('tycho'), hip = identifier('hipparcos');
      const hd = identifier('henry-draper'), hr = identifier('bright-star'), gl = identifier('gliese-jahreiss');
      const p = record.position;
      const title = record.names[0] ?? (gl ? `GJ ${gl}` : hip ? `HIP ${hip}` : tyc ? `TYC ${tyc}` : `AT-HYG ${id}`);
      const card = { id: record.id, title, names: record.names, distance: p.distanceParsecs,
        positioned: !!p.cartesianParsecs, position: p.cartesianParsecs, raHours: p.raHours, decDegrees: p.decDegrees,
        magnitude: record.photometry.apparentMagnitude, spectrum: record.spectrum.value, identifiers: record.identifiers,
        distanceSource: p.distanceSourceCode, positionSource: p.positionSourceCode, flags: record.quality.flags };
      insert.run(id, gaia, tyc, hip, hd, hr, gl, title, p.distanceParsecs, p.cartesianParsecs ? 1 : 0, JSON.stringify(card));
      if (record.names.length) named.run(record.names.join(' '), id);
      if (p.cartesianParsecs) {
        data.ids[positioned] = id; data.positions.set(p.cartesianParsecs, positioned * 3);
        data.magnitudes[positioned] = record.photometry.apparentMagnitude ?? NaN;
        data.colors[positioned] = record.photometry.colorIndex ?? NaN;
        positioned++;
      }
      if (++total % 10000 === 0) search.exec('COMMIT; BEGIN;');
      if (total % 250000 === 0) onProgress(`Prepared ${total} search records`);
    }
    search.exec('COMMIT;');
    for (const column of ['gaia', 'tyc', 'hip', 'hd', 'hr', 'gl']) search.exec(`CREATE INDEX idx_${column} ON objects(${column}) WHERE ${column} IS NOT NULL;`);
    if (positioned !== count || total !== manifest.acceptedRows) throw new Error('Map export row count mismatch.');
    if (search.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Search database integrity failed.');
  } finally { source.close(); search.close(); }
  onProgress('Building spatial tiles');
  const tiles = await buildStarTiles(data, join(outputDirectory, 'tiles'));
  const map = { version: 1, dataset: 'AT-HYG 4.0', datasetSha256: manifest.datasetSha256,
    totalRecords: total, positionedRecords: positioned, missingPositions: total - positioned,
    unit: 'parsec', root: 'r', nodes: tiles.nodes,
    attribution: { author: 'David Nash / Astronomy Nexus', catalog: 'AT-HYG 4.0', url: 'https://codeberg.org/astronexus/athyg' } };
  await writeFile(join(outputDirectory, 'manifest.json'), JSON.stringify(map) + '\n');
  const result = { version: 1, status: 'complete', totalRecords: total, positionedRecords: positioned,
    leafRecords: tiles.leafRecords, largestLeaf: tiles.largestLeaf, tileCount: tiles.nodes.length,
    tileBytes: tiles.totalBytes, manifestBytes: (await stat(join(outputDirectory, 'manifest.json'))).size,
    searchBytes: (await stat(join(outputDirectory, 'search.sqlite'))).size, sourceDatasetSha256: manifest.datasetSha256 };
  await writeFile(join(outputDirectory, 'export-report.json'), JSON.stringify(result, null, 2) + '\n');
  await unlink(join(outputDirectory, 'INCOMPLETE'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  exportMap(join(CATALOG_DIRECTORY, 'prepared-v1'), join(CATALOG_DIRECTORY, 'map-v1'), console.log)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
