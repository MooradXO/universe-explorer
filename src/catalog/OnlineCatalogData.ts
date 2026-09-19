import type { ExternalObservation } from './ExternalObservation';
import type { MapSearchResult } from './StarMapData';

export type OnlineProvider = 'gaia' | 'simbad' | 'ned';
export interface OnlineCatalogResult {
  provider: OnlineProvider;
  query: string;
  status: 'ok' | 'not-found' | 'unavailable';
  cache: 'fresh' | 'cached' | 'stale' | null;
  fetchedAt: string | null;
  bytes: number;
  observations: ExternalObservation[];
  localMatches?: MapSearchResult[];
  message?: string;
}
