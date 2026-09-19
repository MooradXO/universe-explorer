import http from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMapMiddleware, openMapCatalog } from '../catalog/map-server.mjs';

/** Private upstream: only the game's reverse proxy exposes catalogue routes. */
export function createCatalogServer({ catalogDirectory, cacheDirectory }) {
  const catalogue = openMapCatalog(catalogDirectory);
  const catalogueReady = catalogue.manifest.version === 1;
  catalogue.close();
  const service = createMapMiddleware(catalogDirectory, cacheDirectory);
  const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
    const json = (code, value) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Read-only endpoint' });
    if (req.url === '/healthz') return json(200, { service: 'universe-catalog', ready: catalogueReady });
    Promise.resolve(service.middleware(req, res, () => json(404, { error: 'Not found' })))
      .catch(() => { if (!res.headersSent) json(500, { error: 'Catalogue service failed' }); else res.destroy(); });
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 200;
  server.on('close', () => service.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const catalogDirectory = process.env.UNIVERSE_CATALOG_DIR;
  const cacheDirectory = process.env.UNIVERSE_CACHE_DIR;
  const port = Number(process.env.UNIVERSE_CATALOG_PORT || 4312);
  if (!catalogDirectory || !cacheDirectory || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Set catalogue/cache directories and an unprivileged port');
  }
  const server = createCatalogServer({ catalogDirectory, cacheDirectory });
  server.listen(port, '127.0.0.1', () => console.log(`Universe catalogue listening on 127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10_000).unref();
  });
}
