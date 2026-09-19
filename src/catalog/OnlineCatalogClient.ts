import type { OnlineCatalogResult, OnlineProvider } from './OnlineCatalogData';

async function request(path: string, signal: AbortSignal): Promise<OnlineCatalogResult[]> {
  const response = await fetch(`/__catalog/${path}`, { signal });
  if (!response.ok) throw new Error(response.status === 400 ? 'Use an exact Gaia DR3 ID. For SIMBAD and NED, use a name or catalogue ID.' : 'Could not fetch source data. Check your connection and retry.');
  return response.json();
}
export const OnlineCatalogClient = {
  lookup(provider: OnlineProvider, query: string, signal: AbortSignal) {
    return request(`online?source=${provider}&q=${encodeURIComponent(query)}`, signal);
  },
  enrich(id: string, signal: AbortSignal) {
    const match = /^athyg:4\.0:(\d+)$/.exec(id);
    if (!match) throw new Error('Unknown AT-HYG object.');
    return request(`enrich/${match[1]}`, signal);
  },
};
