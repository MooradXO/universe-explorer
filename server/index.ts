import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NET } from '../src/network/shared/Protocol';
import { UniverseRoom } from './UniverseRoom';
import { GuestStore } from './GuestStore';
import { catalogueResolver } from './Catalog';
import { RateLimit } from './RateLimit';

export async function startServer(options: { port?: number; host?: string; store?: string | null; catalogue?: string; origins?: string[]; allowBots?: boolean; maxPlayers?: number } = {}) {
  const port = options.port ?? Number(process.env.MULTIPLAYER_PORT || 2567), host = options.host ?? process.env.MULTIPLAYER_HOST ?? '127.0.0.1';
  const origins = new Set(options.origins ?? (process.env.MULTIPLAYER_ORIGINS ?? 'http://127.0.0.1:3012,http://localhost:3012').split(','));
  const maxPlayers = options.maxPlayers ?? Number(process.env.MULTIPLAYER_MAX_PLAYERS || NET.maxPlayers);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > NET.maxPlayers) throw new Error(`MULTIPLAYER_MAX_PLAYERS must be an integer from 1 to ${NET.maxPlayers}`);
  const catalog = catalogueResolver(options.catalogue ?? process.env.MULTIPLAYER_CATALOG ?? resolve('../.catalog-research/athyg-4.0/map-v1'));
  const guests = new GuestStore(options.store === null ? undefined : options.store ?? process.env.MULTIPLAYER_SAVE ?? resolve('.multiplayer-state/guests.json'));
  UniverseRoom.services = { guests, resolve: id => catalog.resolve(id), allowBots: options.allowBots ?? process.env.MULTIPLAYER_BOTS !== 'false', maxPlayers };
  const requests = new Map<string, RateLimit>();
  const transport = new WebSocketTransport({ maxPayload: 16 * 1024, perMessageDeflate: false,
    beforeUpgrade: context => {
      const origin = context.headers.get('origin');
      if (origin && !origins.has(origin)) return new Response('Origin denied', { status: 403 });
    } });
  const server = new Server({ transport, greet: false, gracefullyShutdown: false });
  server.define('universe', UniverseRoom);
  await server.listen(port, host);
  // Colyseus 0.18 routes run before Express middleware. Guard the actual HTTP entry,
  // including matchmaking, instead of relying on fallback Express routes for admission.
  const http = transport.server!;
  const handlers = http.listeners('request') as ((req: IncomingMessage, res: ServerResponse) => void)[];
  http.removeAllListeners('request');
  http.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const respond = (status: number, value?: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(value === undefined ? '' : JSON.stringify(value)); };
      const path = req.url?.split('?')[0];
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) { respond(403); return; }
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      if (req.method === 'OPTIONS') { respond(204); return; }
      if (path === '/health') { respond(200, { ok: !!UniverseRoom.instance, version: NET.version }); return; }
      if (path === '/metrics' && !req.headers['x-forwarded-for'] && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
        respond(200, UniverseRoom.instance?.metrics() ?? {}); return;
      }
      if (req.method !== 'POST' || !new RegExp(`^/matchmake/(joinById|reconnect)/${NET.roomId}$`).test(path ?? '')) { respond(404); return; }
      if (!req.headers['content-length'] || Number(req.headers['content-length']) > 16384) { respond(413); req.resume(); return; }
      const ip = req.socket.remoteAddress ?? 'unknown'; let limiter = requests.get(ip);
      if (!limiter) { if (requests.size > 10000) requests.delete(requests.keys().next().value!); limiter = new RateLimit(); requests.set(ip, limiter); }
      // Burst permits 100 joins. Behind a loopback proxy this is a shared admission
      // budget; never trust arbitrary forwarded headers as client identity.
      if (!limiter.accept('join', 150, 5, Date.now() / 1000)) { respond(429); return; }
      for (const handler of handlers) handler.call(http, req, res);
  });
  await matchMaker.createRoom('universe', { canonical: true });
  return { server, room: UniverseRoom.instance!, async close() { await server.gracefullyShutdown(false); guests.flush(); catalog.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startServer();
  console.log(`Multiplayer listening on ${process.env.MULTIPLAYER_HOST ?? '127.0.0.1'}:${process.env.MULTIPLAYER_PORT ?? 2567}; one universe, max ${running.room.maxClients} players.`);
  const stop = async () => { await running.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
