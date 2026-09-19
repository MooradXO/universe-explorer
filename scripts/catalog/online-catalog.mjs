import { ObservationCache } from './observation-cache.mjs';
import { tapUrl, adqlText, gaiaIdLiteral, csvObjects } from './remote-snapshot.mjs';
import { readVotable } from './votable.mjs';
import { GAIA_COLUMNS, normalizeGaiaObservation } from '../../src/catalog/adapters/GaiaObservation.ts';
import { SIMBAD_COLUMNS, normalizeSimbadObservation } from '../../src/catalog/adapters/SimbadObservation.ts';
import { normalizeNedObservation } from '../../src/catalog/adapters/NedObservation.ts';

const origin = entry => ({ sha256: entry.metadata.sha256, url: entry.metadata.url, snapshotDate: entry.metadata.fetchedAt.slice(0, 10) });
const missing = (provider, query, message) => ({ provider, query, status: 'not-found', cache: null, fetchedAt: null, bytes: 0, observations: [], message });
export function validateOnlineQuery(provider, input) {
  if (!['gaia', 'simbad', 'ned'].includes(provider)) throw new Error('Unknown catalogue');
  const query = input.trim();
  if (!query || query.length > 100 || /[\x00-\x1f\x7f]/.test(query)) throw new Error('Invalid object name');
  return provider === 'gaia' ? gaiaIdLiteral(query.replace(/^Gaia\s*(?:DR3)?\s*/i, '')) : query;
}

export class OnlineCatalog {
  constructor(directory, options) { this.cache = new ObservationCache(directory, options); }
  async lookup(provider, input) {
    const query = validateOnlineQuery(provider, input);
    try {
      let snapshot;
      if (provider === 'gaia') {
        const url = tapUrl('https://gea.esac.esa.int/tap-server/tap/sync',
          `SELECT TOP 2 ${GAIA_COLUMNS.join(',')} FROM gaiadr3.gaia_source WHERE source_id=${query}`, 3);
        snapshot = await this.cache.get(url, 'csv', async entry => {
          const rows = await csvObjects(entry.body, GAIA_COLUMNS, { maxRows: 2 });
          if (rows.length > 1 || rows.some(row => row.source_id !== query)) throw new Error('Gaia identity mismatch');
          return rows.map(row => normalizeGaiaObservation(row, origin(entry)));
        });
      } else if (provider === 'simbad') {
        // Exact published identifier only; a nearby sky position never establishes identity.
        const columns = SIMBAD_COLUMNS.map(name => `b.${name}`).join(',');
        const url = tapUrl('https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
          `SELECT TOP 3 ${columns} FROM basic AS b JOIN ident AS i ON b.oid=i.oidref WHERE i.id=${adqlText(query)}`, 4);
        snapshot = await this.cache.get(url, 'csv', async entry => {
          const rows = await csvObjects(entry.body, SIMBAD_COLUMNS, { maxRows: 3 });
          if (rows.length > 2) throw new Error('Ambiguous SIMBAD identifier');
          return rows.map(row => normalizeSimbadObservation(row, [query], origin(entry)));
        });
      } else {
        const url = 'https://ned.ipac.caltech.edu/NED::API/OverviewOfObject?' + new URLSearchParams({ TARGET: query });
        snapshot = await this.cache.get(url, 'xml', entry => {
          const table = readVotable(entry.body, { maxRows: 2, maxBytes: 512 * 1024 });
          if (table.tables.length !== 1) throw new Error('Unexpected NED table count');
          const data = table.tables[0];
          return data.rows.map(row => normalizeNedObservation(row, data.fields, table.params, query, origin(entry)));
        });
      }
      let observations = snapshot.value;
      let cache = snapshot.cache;
      let bytes = snapshot.metadata.bytes;
      if (provider === 'simbad') {
        observations = [];
        for (const observation of snapshot.value) {
          try {
            const aliasUrl = tapUrl('https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
              `SELECT TOP 257 id FROM ident WHERE oidref=${gaiaIdLiteral(observation.source.value)} ORDER BY id`, 258);
            const aliases = await this.cache.get(aliasUrl, 'csv', entry => csvObjects(entry.body, ['id'], { maxRows: 257 }));
            const names = aliases.value.slice(0, 256).map(row => row.id.trim());
            const identifiers = [...observation.identifiers];
            for (const name of names) {
              const match = /^Gaia DR3 ([1-9]\d*)$/.exec(name);
              if (match && !identifiers.some(item => item.catalog === 'gaia' && item.release === 'DR3' && item.value === match[1])) {
                identifiers.push({ catalog: 'gaia', release: 'DR3', value: match[1] });
              }
            }
            observations.push({ ...observation, names: [...new Set([...observation.names, ...names])], identifiers,
              flags: [...observation.flags, ...(aliases.value.length > 256 ? ['alias-list-truncated'] : [])],
              relatedSnapshots: [{ sha256: aliases.metadata.sha256, url: aliases.metadata.url, fetchedAt: aliases.metadata.fetchedAt }] });
            bytes += aliases.metadata.bytes;
            if (aliases.cache === 'stale') cache = 'stale';
          } catch { observations.push({ ...observation, flags: [...observation.flags, 'aliases-unavailable'] }); }
        }
      }
      return { provider, query, status: observations.length ? 'ok' : 'not-found', cache,
        fetchedAt: snapshot.metadata.fetchedAt, bytes, observations };
    } catch {
      return { provider, query, status: 'unavailable', cache: null, fetchedAt: null, bytes: 0, observations: [],
        message: 'Источник не ответил или вернул неполные данные. Повторите позже.' };
    }
  }
  async enrich(card) {
    const gaia = card.identifiers.find(item => item.catalog === 'gaia' && item.release === 'DR3');
    const prefixes = { hipparcos: 'HIP', tycho: 'TYC', 'henry-draper': 'HD' };
    const other = Object.keys(prefixes).map(catalog => card.identifiers.find(item => item.catalog === catalog)).find(Boolean);
    const simbadQuery = gaia ? `Gaia DR3 ${gaia.value}` : other ? `${prefixes[other.catalog]} ${other.value}` : null;
    const result = [];
    result.push(gaia ? await this.lookup('gaia', gaia.value) : missing('gaia', card.title, 'В AT-HYG нет Gaia DR3 ID для этой записи.'));
    result.push(simbadQuery ? await this.lookup('simbad', simbadQuery) : missing('simbad', card.title, 'Нет точного каталожного ID для сопоставления. Используйте поиск по имени.'));
    return result;
  }
}
