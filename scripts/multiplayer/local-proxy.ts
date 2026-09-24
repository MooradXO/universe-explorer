import { createServer, request } from 'node:http';
import { connect, type Socket } from 'node:net';

/** Rehearses the future /multiplayer/ reverse-proxy prefix on loopback only. */
export async function localProxy(port: number, upstreamPort: number) {
  const sockets = new Set<Socket>();
  const proxy = createServer((req, res) => {
    if (!req.url?.startsWith('/multiplayer/') || req.url === '/multiplayer/metrics') { res.writeHead(404).end(); return; }
    const upstream = request({ hostname: '127.0.0.1', port: upstreamPort, path: req.url.slice('/multiplayer'.length), method: req.method,
      headers: { ...req.headers, 'x-forwarded-for': '127.0.0.1' } }, incoming => { res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res); });
    upstream.on('error', () => { res.writeHead(502).end(); }); req.pipe(upstream);
  });
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  proxy.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/multiplayer/')) { socket.destroy(); return; }
    const upstream = connect(upstreamPort, '127.0.0.1', () => {
      const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n');
      upstream.write(`${req.method} ${req.url!.slice('/multiplayer'.length)} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.once('close', () => upstream.destroy());
  });
  await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(port, '127.0.0.1', resolve); });
  return () => new Promise<void>(resolve => { for (const socket of sockets) socket.destroy(); proxy.close(() => resolve()); });
}
