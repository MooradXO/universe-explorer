// Share only the existing compiled preview on the selected LAN interface.
import http from 'node:http';
import { networkInterfaces } from 'node:os';

const host = process.argv[2];
const port = 3015;
const localAddresses = Object.values(networkInterfaces()).flat().map(entry => entry?.address);
if (!host || !/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || !localAddresses.includes(host)) {
  throw new Error('Pass the current private Wi-Fi IPv4 address');
}
const origin = `http://${host}:${port}`;
const subnet = host.split('.').slice(0, 3).join('.') + '.';
const server = http.createServer((req, res) => {
  if (!req.socket.remoteAddress?.startsWith(subnet)
    || !['GET', 'HEAD'].includes(req.method)
    || req.headers.host !== `${host}:${port}`
    || (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403); res.end('Local preview only'); return;
  }
  const headers = { ...req.headers, host: '127.0.0.1:3014' };
  if (headers.origin) headers.origin = 'http://127.0.0.1:3014';
  const upstream = http.request({ hostname: '127.0.0.1', port: 3014,
    method: req.method, path: req.url, headers }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Preview unavailable'); });
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(port, host, () => console.log(`LAN preview: ${origin}`));
