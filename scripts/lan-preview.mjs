import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

/** A read-only LAN entry to the existing production preview, including its catalogue API. */
export function createLanPreview({ host, port = 3002, upstreamPort = 3001 }) {
  const authority = `${host}:${port}`;
  const origin = `http://${authority}`;
  return http.createServer((req, res) => {
    const reject = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(message);
    };
    const entryPath = req.url?.split('?')[0];
    const navigationEntry = req.headers['sec-fetch-mode'] === 'navigate' && (entryPath === '/' || entryPath === '/visual-lab.html');
    const foreignFetch = req.headers['sec-fetch-site'] === 'cross-site' && !navigationEntry;
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== origin) || foreignFetch) {
      return reject(403, 'Open the game directly using its LAN address.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return reject(405, 'Read-only preview');
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return reject(400, 'Invalid preview path');
    // Only the preview receives requests; client-supplied URLs never choose the upstream.
    const headers = { host: `127.0.0.1:${upstreamPort}` };
    for (const name of ['accept', 'accept-encoding', 'range', 'if-none-match', 'if-modified-since']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    if (req.headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method, headers }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy(new Error('Preview timeout')));
    upstream.on('error', () => { if (!res.headersSent) reject(502, 'Start the local game preview on port 3001.'); else res.destroy(); });
    res.on('close', () => upstream.destroy());
    upstream.end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.argv[2];
  const local = Object.values(networkInterfaces()).flat().some(entry => entry?.family === 'IPv4' && entry.address === host && !entry.internal);
  const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host ?? '');
  if (!local || !privateAddress) throw new Error('Pass this computer\'s private Wi-Fi/LAN IPv4 address.');
  const server = createLanPreview({ host });
  server.listen(3002, host, () => console.log(`Universe Explorer LAN: http://${host}:3002/`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
