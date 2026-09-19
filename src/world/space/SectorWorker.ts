import { createSectorManifest } from './SectorManifest';
import type { Triple } from './WorldPosition';

self.onmessage = (event: MessageEvent<{ id: number; sector: Triple; seed: string }>) => {
  try {
    self.postMessage({ id: event.data.id, manifest: createSectorManifest(event.data.sector, event.data.seed) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Sector generation failed' });
  }
};
