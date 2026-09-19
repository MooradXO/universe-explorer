import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STAR_TILE_HEADER, STAR_TILE_STRIDE, STAR_TILE_MAGIC } from '../../src/catalog/StarMapData.ts';

export function encodeStarTile(data, indices, center) {
  const buffer = Buffer.alloc(STAR_TILE_HEADER + indices.length * STAR_TILE_STRIDE);
  buffer.writeUInt32LE(STAR_TILE_MAGIC, 0);
  buffer.writeUInt32LE(1, 4);
  buffer.writeUInt32LE(indices.length, 8);
  buffer.writeUInt32LE(STAR_TILE_STRIDE, 12);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const offset = STAR_TILE_HEADER + i * STAR_TILE_STRIDE;
    for (let axis = 0; axis < 3; axis++) buffer.writeFloatLE(data.positions[index * 3 + axis] - center[axis], offset + axis * 4);
    buffer.writeFloatLE(data.magnitudes[index], offset + 12);
    buffer.writeFloatLE(data.colors[index], offset + 16);
    buffer.writeUInt32LE(data.ids[index], offset + 20);
  }
  return buffer;
}

export async function buildStarTiles(data, directory, { leafSize = 4096, sampleSize = 512, maxDepth = 24 } = {}) {
  await mkdir(directory);
  const nodes = [];
  let totalBytes = 0;
  let leafRecords = 0;
  let largestLeaf = 0;
  async function build(indices, key, depth) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const index of indices) for (let axis = 0; axis < 3; axis++) {
      const value = data.positions[index * 3 + axis];
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    const center = min.map((value, axis) => (value + max[axis]) / 2);
    const radius = Math.max(0.000001, Math.hypot(...max.map((value, axis) => value - center[axis])));
    const children = [];
    if (indices.length > leafSize && depth < maxDepth) {
      const counts = new Uint32Array(8);
      const octant = index => (data.positions[index * 3] >= center[0] ? 1 : 0) |
        (data.positions[index * 3 + 1] >= center[1] ? 2 : 0) | (data.positions[index * 3 + 2] >= center[2] ? 4 : 0);
      for (const index of indices) counts[octant(index)]++;
      // Identical coordinates cannot be split geometrically; page them by ID order.
      if (Math.max(...counts) === indices.length) {
        const middle = Math.ceil(indices.length / 2);
        children.push([indices.subarray(0, middle), '0'], [indices.subarray(middle), '1']);
      } else {
        const starts = new Uint32Array(8);
        for (let i = 1; i < 8; i++) starts[i] = starts[i - 1] + counts[i - 1];
        const offsets = starts.slice();
        const partition = new Uint32Array(indices.length);
        for (const index of indices) partition[offsets[octant(index)]++] = index;
        for (let i = 0; i < 8; i++) if (counts[i]) children.push([partition.subarray(starts[i], starts[i] + counts[i]), String(i)]);
      }
    }
    if (!children.length && indices.length > 8192) throw new Error('Octree depth cannot represent a dense leaf.');
    const sampled = children.length ? Uint32Array.from({ length: Math.min(sampleSize, indices.length) },
      (_, index) => indices[Math.floor(index * indices.length / Math.min(sampleSize, indices.length))]) : indices;
    const encoded = gzipSync(encodeStarTile(data, sampled, center), { level: 6 });
    const node = { key, center, radius, count: indices.length, points: sampled.length,
      children: children.map(([, suffix]) => key + suffix), bytes: encoded.length };
    nodes.push(node);
    totalBytes += encoded.length;
    await writeFile(join(directory, `${key}.bin.gz`), encoded, { flag: 'wx' });
    if (!children.length) { leafRecords += indices.length; largestLeaf = Math.max(largestLeaf, indices.length); }
    for (const [child, suffix] of children) await build(child, key + suffix, depth + 1);
  }
  if (!data.ids.length) throw new Error('No positioned objects to export.');
  await build(Uint32Array.from({ length: data.ids.length }, (_, index) => index), 'r', 0);
  if (leafRecords !== data.ids.length) throw new Error('Tile coverage mismatch.');
  return { nodes, totalBytes, leafRecords, largestLeaf };
}
