export type MapVector = [number, number, number];
export interface StarTileNode {
  key: string;
  center: MapVector;
  radius: number;
  count: number;
  points: number;
  children: string[];
  bytes: number;
}
export interface StarMapManifest {
  version: 1;
  dataset: string;
  datasetSha256: string;
  totalRecords: number;
  positionedRecords: number;
  missingPositions: number;
  unit: 'parsec';
  root: string;
  nodes: StarTileNode[];
  attribution: { author: string; catalog: string; url: string };
}
export interface MapSearchResult {
  id: string;
  title: string;
  distance: number | null;
  positioned: boolean;
}
export interface MapObject extends MapSearchResult {
  names: string[];
  position: MapVector | null;
  raHours: number | null;
  decDegrees: number | null;
  magnitude: number | null;
  spectrum: string | null;
  identifiers: { catalog: string; release: string | null; value: string }[];
  distanceSource: string | null;
  positionSource: string | null;
  flags: string[];
  gaiaMatches: number;
}

export const STAR_TILE_MAGIC = 0x54535855; // UXST in little endian
export const STAR_TILE_STRIDE = 24;
export const STAR_TILE_HEADER = 16;

export function decodeStarTile(buffer: ArrayBuffer) {
  if (buffer.byteLength < STAR_TILE_HEADER) throw new Error('Incomplete star tile.');
  const view = new DataView(buffer);
  const count = view.getUint32(8, true);
  if (view.getUint32(0, true) !== STAR_TILE_MAGIC || view.getUint32(4, true) !== 1 ||
    view.getUint32(12, true) !== STAR_TILE_STRIDE || count > 8192 ||
    buffer.byteLength !== STAR_TILE_HEADER + count * STAR_TILE_STRIDE) throw new Error('Invalid star tile.');
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const ids = new Uint32Array(count);
  for (let index = 0; index < count; index++) {
    const offset = STAR_TILE_HEADER + index * STAR_TILE_STRIDE;
    for (let axis = 0; axis < 3; axis++) {
      const value = view.getFloat32(offset + axis * 4, true);
      if (!Number.isFinite(value)) throw new Error('Non-finite star position.');
      positions[index * 3 + axis] = value;
    }
    const mag = view.getFloat32(offset + 12, true);
    magnitudes[index] = Number.isFinite(mag) ? mag : 10;
    colorIndices[index] = view.getFloat32(offset + 16, true);
    ids[index] = view.getUint32(offset + 20, true);
    if (!ids[index]) throw new Error('Invalid star tile identity.');
  }
  return { positions, magnitudes, colorIndices, ids };
}
