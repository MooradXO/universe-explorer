import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { OnlineCatalog, validateOnlineQuery } from './online-catalog.mjs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const result = row => ({ id: `athyg:4.0:${row.id}`, title: row.title, distance: row.distance, positioned: !!row.positioned });
const fields = 'id,title,distance,positioned';

export function openMapCatalog(directory) {
  if (existsSync(join(directory, 'INCOMPLETE'))) throw new Error('Incomplete map export');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.unit !== 'parsec') throw new Error('Unsupported map');
  const db = new DatabaseSync(join(directory, 'search.sqlite'), { readOnly: true });
  const keys = new Set(manifest.nodes.map(node => node.key));
  return {
    manifest, keys,
    search(query) {
      let q = query.trim();
      if (!q || q.length > 100) return [];
      if (/^(солнце|sun)$/i.test(q)) q = 'Sol';
      const prefixed = /^(Gaia(?:\s*DR3)?|TYC|HIP|HD|HR|GJ|AT-HYG|athyg:4\.0:)\s*([\w.+-]+)$/i.exec(q);
      const columns = { gaia: 'gaia', gaiadr3: 'gaia', tyc: 'tyc', hip: 'hip', hd: 'hd', hr: 'hr', gj: 'gl', 'at-hyg': 'id', 'athyg:4.0:': 'id' };
      let column, value;
      if (prefixed) { column = columns[prefixed[1].toLowerCase().replace(/\s/g, '')]; value = prefixed[2]; }
      else if (/^\d+$/.test(q)) { column = q.length > 10 ? 'gaia' : 'id'; value = q; }
      else if (/^\d+-\d+-\d+$/.test(q)) { column = 'tyc'; value = q; }
      if (column) {
        // Column names come only from the fixed mapping. Long Gaia identities stay strings.
        if (column === 'id' && (!/^\d{1,10}$/.test(value) || Number(value) > 0xffffffff)) return [];
        return db.prepare(`SELECT ${fields} FROM objects WHERE ${column}=? ORDER BY id LIMIT 20`).all(value).map(result);
      }
      const tokens = q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
      if (!tokens.length) return [];
      const expression = tokens.map(token => `"${token}"*`).join(' AND ');
      return db.prepare(`SELECT ${fields} FROM objects WHERE id IN
        (SELECT id FROM names WHERE names MATCH ? LIMIT 100) ORDER BY title COLLATE NOCASE,id LIMIT 20`).all(expression).map(result);
    },
    object(id) {
      if (!/^\d{1,10}$/.test(id) || Number(id) > 0xffffffff) return null;
      const row = db.prepare('SELECT card,gaia FROM objects WHERE id=?').get(id);
      if (!row) return null;
      return { ...JSON.parse(row.card), gaiaMatches: row.gaia ? db.prepare('SELECT count(*) AS count FROM objects WHERE gaia=?').get(row.gaia).count : 0 };
    },
    close: () => db.close(),
  };
}

export function createMapMiddleware(directory, onlineDirectory = join(directory, '../../online-cache-v1')) {
  let catalog;
  const online = new OnlineCatalog(onlineDirectory);
  const json = (res, code, value) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  const middleware = async (req, res, next) => {
    if (!req.url?.startsWith('/__catalog/')) return next();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
      if (!LOCAL_HOSTS.has(url.hostname) || (req.headers.origin && new URL(req.headers.origin).host !== url.host)) return json(res, 403, { error: 'Local access only' });
    } catch { return json(res, 400, { error: 'Invalid request' }); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Read-only endpoint' });
    const enrich = /^\/__catalog\/enrich\/(\d{1,10})$/.exec(url.pathname);
    if (url.pathname === '/__catalog/online' || enrich) {
      if (req.method !== 'GET') return json(res, 405, { error: 'GET required' });
      let provider, query;
      if (!enrich) {
        provider = url.searchParams.get('source'); query = url.searchParams.get('q') ?? '';
        try { query = validateOnlineQuery(provider, query); }
        catch { return json(res, 400, { error: 'Нужно имя объекта, а для Gaia — точный числовой DR3 ID.' }); }
      }
      try {
        // Online search remains usable when the optional local AT-HYG database is absent.
        try { catalog ??= openMapCatalog(directory); } catch { /* local linkage unavailable */ }
        const card = enrich && catalog?.object(enrich[1]);
        if (enrich && !card) return json(res, 404, { error: 'Local object unavailable' });
        const values = enrich ? await online.enrich(card) : [await online.lookup(provider, query)];
        for (const value of values) {
          const matches = new Map();
          for (const observation of value.observations) for (const id of observation.identifiers) {
            if (id.catalog === 'gaia' && id.release === 'DR3') for (const match of catalog?.search(`Gaia DR3 ${id.value}`) ?? []) matches.set(match.id, match);
          }
          value.localMatches = [...matches.values()];
        }
        if (!res.destroyed) return json(res, 200, values);
      } catch { if (!res.destroyed) return json(res, 503, { error: 'Catalogue service unavailable' }); }
      return;
    }
    try { catalog ??= openMapCatalog(directory); }
    catch { return json(res, 503, { error: 'Local star catalogue is not ready' }); }
    try {
      if (url.pathname === '/__catalog/manifest') return json(res, 200, catalog.manifest);
      if (url.pathname === '/__catalog/search') return json(res, 200, catalog.search(url.searchParams.get('q') ?? ''));
      const object = /^\/__catalog\/objects\/(\d{1,10})$/.exec(url.pathname);
      if (object) {
        const card = catalog.object(object[1]);
        return json(res, card ? 200 : 404, card ?? { error: 'Object not found' });
      }
      const tile = /^\/__catalog\/tiles\/(r[0-7]{0,24})$/.exec(url.pathname);
      if (tile && catalog.keys.has(tile[1])) {
        const file = join(directory, 'tiles', `${tile[1]}.bin.gz`);
        if (!existsSync(file)) return json(res, 503, { error: 'Star tile unavailable' });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip',
          'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(file);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        return stream.pipe(res);
      }
      return json(res, 404, { error: 'Not found' });
    } catch { return json(res, 500, { error: 'Catalogue query failed' }); }
  };
  return { middleware, close() { catalog?.close(); catalog = undefined; } };
}

export function localStarMapPlugin(directory) {
  const install = server => {
    const service = createMapMiddleware(directory);
    server.middlewares.use(service.middleware);
    server.httpServer?.once('close', () => service.close());
  };
  return { name: 'local-star-catalogue', configureServer: install, configurePreviewServer: install };
}
