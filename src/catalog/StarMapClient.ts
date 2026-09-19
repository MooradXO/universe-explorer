import { decodeStarTile, type StarMapManifest, type MapObject, type MapSearchResult } from './StarMapData';

const BASE = '/__catalog';
async function request(path: string, signal: AbortSignal) {
  const response = await fetch(`${BASE}/${path}`, { signal });
  if (!response.ok) throw new Error(response.status === 503 ? 'Catalogue unavailable. Check the local server and retry.' : 'Could not load data. Please retry.');
  return response;
}
export const StarMapClient = {
  async manifest(signal: AbortSignal): Promise<StarMapManifest> {
    const value = await (await request('manifest', signal)).json();
    if (value.version !== 1 || value.unit !== 'parsec' || !Array.isArray(value.nodes) || !value.nodes.length) throw new Error('Unsupported map format.');
    return value;
  },
  async search(query: string, signal: AbortSignal): Promise<MapSearchResult[]> {
    return (await request(`search?q=${encodeURIComponent(query)}`, signal)).json();
  },
  async object(id: string, signal: AbortSignal): Promise<MapObject> {
    const match = /^athyg:4\.0:(\d+)$/.exec(id);
    if (!match) throw new Error('Unknown identifier.');
    return (await request(`objects/${match[1]}`, signal)).json();
  },
  async tile(key: string, revision: string, signal: AbortSignal) {
    return decodeStarTile(await (await request(`tiles/${key}?v=${revision}`, signal)).arrayBuffer());
  },
};
