import type { MapObject } from '../src/catalog/StarMapData';
import { SOLAR_CATALOG_OBJECT } from '../src/world/systems/SystemDescriptor';
// This module opens the existing local SQLite export read-only. It never fetches remote catalogues.
// @ts-expect-error Existing catalogue export is a JavaScript module.
import { openMapCatalog } from '../scripts/catalog/map-server.mjs';

export function catalogueResolver(directory: string) {
  let catalogue: { object(id: string): MapObject | null; close(): void } | undefined;
  return {
    resolve(id: string): MapObject | null {
      if (id === SOLAR_CATALOG_OBJECT.id) return SOLAR_CATALOG_OBJECT;
      const match = /^athyg:4\.0:(\d{1,10})$/.exec(id); if (!match) return null;
      try { catalogue ??= openMapCatalog(directory); return catalogue!.object(match[1]); }
      catch { return null; }
    },
    close() { catalogue?.close(); },
  };
}
