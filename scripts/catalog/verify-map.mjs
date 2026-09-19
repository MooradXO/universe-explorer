import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { CATALOG_DIRECTORY } from './athyg-source.mjs';
import { decodeStarTile } from '../../src/catalog/StarMapData.ts';
import { hashFile } from './integrity.mjs';

const directory = join(CATALOG_DIRECTORY, 'map-v1');
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const source = new DatabaseSync(join(CATALOG_DIRECTORY, 'prepared-v1/catalog.sqlite'), { readOnly: true });
const maxId = source.prepare("SELECT MAX(CAST(substr(catalog_id,11) AS INTEGER)) AS id FROM objects").get().id;
const expected = new Uint8Array(maxId + 1), seen = new Uint8Array(maxId + 1);
const xyz = new Float64Array((maxId + 1) * 3);
let expectedCount = 0;
for (const row of source.prepare("SELECT catalog_id,x_pc,y_pc,z_pc FROM objects WHERE position_status='available'").iterate()) {
  const id = Number(row.catalog_id.split(':')[2]);
  expected[id] = 1; xyz.set([row.x_pc, row.y_pc, row.z_pc], id * 3); expectedCount++;
}
source.close();
const nodes = new Map(manifest.nodes.map(node => [node.key, node]));
let leafRecords = 0, maxErrorParsecs = 0;
for (const node of manifest.nodes) {
  const data = gunzipSync(await readFile(join(directory, 'tiles', `${node.key}.bin.gz`)));
  const tile = decodeStarTile(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (tile.ids.length !== node.points) throw new Error('Wrong tile count');
  if (node.children.length && node.children.reduce((sum, key) => sum + nodes.get(key).count, 0) !== node.count) throw new Error('Wrong branch count');
  for (let i = 0; i < tile.ids.length; i++) {
    const id = tile.ids[i];
    if (!expected[id]) throw new Error('Unexpected or unpositioned ID in 3D tile');
    if (!node.children.length) { if (seen[id]++) throw new Error('Repeated leaf ID'); leafRecords++; }
    for (let axis = 0; axis < 3; axis++) {
      const relative = xyz[id * 3 + axis] - node.center[axis];
      const error = Math.abs(tile.positions[i * 3 + axis] - relative);
      if (error > Math.max(1e-10, Math.abs(relative) * 2 ** -23)) throw new Error('Coordinates exceed Float32 rounding tolerance');
      if (!node.children.length) maxErrorParsecs = Math.max(maxErrorParsecs, error);
    }
  }
}
if (expectedCount !== manifest.positionedRecords || leafRecords !== expectedCount || expected.some((value, id) => value !== seen[id])) throw new Error('Full leaf coverage failed');
const result = { status: 'complete', sourceDatasetSha256: manifest.datasetSha256, tileCount: nodes.size,
  verifiedLeafRecords: leafRecords, missingAndDuplicateLeafRecords: 0, maxLeafAxisRoundingErrorParsecs: maxErrorParsecs,
  manifestSha256: await hashFile(join(directory, 'manifest.json')), searchSha256: await hashFile(join(directory, 'search.sqlite')) };
await writeFile(join(directory, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
