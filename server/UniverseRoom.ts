import { GENERATOR, compatibleGenerator } from '../src/world/generation/GeneratorContract';
import { Room, CloseCode, type Client } from '@colyseus/core';
import { NET, type WorldSnapshot } from '../src/network/shared/Protocol';
import { WorldEncoder } from '../src/network/shared/WorldCodec';
import { Simulation } from './Simulation';
import { GuestStore } from './GuestStore';
import type { MapObject } from '../src/catalog/StarMapData';

export interface RoomServices { guests: GuestStore; resolve(id: string): MapObject | null; allowBots: boolean; maxPlayers?: number; }
type GuestAuth = ReturnType<GuestStore['identity']> & { name: string };
type Hit = { targetId: string; shooterId: string; damage: number };
type Death = { killedId: string; killerId: string; killerName: string };
export class UniverseRoom extends Room {
  static services: RoomServices;
  static instance: UniverseRoom | undefined;
  game!: Simulation;
  private clientsById = new Map<string, Client>();
  private encoders = new Map<string, WorldEncoder>();
  private combat = new Map<string, { hits: Map<string, Hit>; deaths: Death[] }>();
  private steps: number[] = []; private maxStepMs = 0; private started = Date.now(); private closedSocketBytes = 0;
  private initialCPU = process.cpuUsage();
  private saveSeconds = 0;
  onCreate(options: { canonical?: boolean }) {
    if (!options.canonical || UniverseRoom.instance) throw new Error('Only the canonical universe is available');
    UniverseRoom.instance = this;
    this.roomId = NET.roomId; this.maxClients = UniverseRoom.services.maxPlayers ?? NET.maxPlayers; this.autoDispose = false; this.maxMessagesPerSecond = 150;
    this.game = new Simulation(UniverseRoom.services.resolve, (id, type, value) => {
      const client = this.clientsById.get(id);
      // Do not accumulate unbounded packets for a stalled tab/connection.
      if (!client) return;
      if (type === 'arrival') { this.encoders.set(id, new WorldEncoder()); this.combat.delete(id); }
      if (type === 'hit' || type === 'die') {
        let batch = this.combat.get(id); if (!batch) { batch = { hits: new Map(), deaths: [] }; this.combat.set(id, batch); }
        if (type === 'hit') {
          const hit = value as Hit, previous = batch.hits.get(hit.targetId);
          if (previous) { previous.damage += hit.damage; previous.shooterId = hit.shooterId; }
          else batch.hits.set(hit.targetId, { ...hit });
        } else if (batch.deaths.length < 200) batch.deaths.push(value as Death);
        return;
      }
      if (((client.ref as unknown as { bufferedAmount?: number })?.bufferedAmount ?? 0) > 2 * 1024 * 1024) {
        client.leave(4010, 'Slow connection; resynchronizing'); return;
      }
      const packet = type === 'world' ? this.encoders.get(id)!.encode(value as WorldSnapshot) : value;
      if (type === 'world') {
        const combat = this.combat.get(id);
        if (combat) { client.send('combat', { hits: [...combat.hits.values()], deaths: combat.deaths }); this.combat.delete(id); }
      }
      client.send(type, packet);
    });
    this.onMessage('input', (client, value) => this.game.input((client.auth as GuestAuth).id, value));
    this.onMessage('*', (client, type, value) => {
      if (type === 'bots' && !UniverseRoom.services.allowBots) return;
      this.game.action((client.auth as GuestAuth).id, String(type), value);
    });
    this.setFixedTimestep(() => {
      const start = performance.now(); this.game.step();
      const duration = performance.now() - start; this.maxStepMs = Math.max(this.maxStepMs, duration);
      this.steps.push(duration); if (this.steps.length > 3000) this.steps.shift();
      if (++this.saveSeconds >= NET.tickHz * 30) { this.saveSeconds = 0; this.save(); }
    }, NET.tickHz);
    // Set after the simulation interval: otherwise 0.18 creates a second clock timer
    // which steals elapsed time from the fixed-step accumulator.
    this.patchRate = null;
  }
  onAuth(_client: Client, options: Record<string, unknown>) {
    if (options?.version !== NET.version || !compatibleGenerator(options.generator)) throw new Error('Client version mismatch');
    const identity = UniverseRoom.services.guests.identity(options.token);
    if (this.game.pilots.has(identity.id)) throw new Error('This guest is already connected. Close the other tab or wait for reconnection.');
    const name = typeof options.username === 'string' ? options.username.trim().replace(/[<>\x00-\x1f\x7f]/g, '').slice(0, 32) : 'GuestPilot';
    return { ...identity, name: name || 'GuestPilot' };
  }
  onJoin(client: Client) {
    const auth = client.auth as GuestAuth;
    const pilot = this.game.add(auth.id, auth.name, auth.state); this.clientsById.set(auth.id, client); this.encoders.set(auth.id, new WorldEncoder());
    client.send('welcome', { id: auth.id, token: auth.token, version: NET.version, generator: GENERATOR }); this.game.announce(pilot);
  }
  async onDrop(client: Client, code?: number) {
    const auth = client.auth as GuestAuth; this.game.drop(auth.id); this.closedSocketBytes += this.socketBytes(client); this.clientsById.delete(auth.id); this.combat.delete(auth.id);
    // Core waits for onDrop before closing a rate-limit kick. Reserving a reconnect
    // here would leave the old socket silently open for the entire grace period.
    if (code === CloseCode.WITH_ERROR) return;
    try { await this.allowReconnection(client, NET.reconnectSeconds); } catch { /* onLeave persists the final state */ }
  }
  onReconnect(client: Client) {
    const auth = client.auth as GuestAuth; this.clientsById.set(auth.id, client); this.encoders.set(auth.id, new WorldEncoder());
    client.send('welcome', { id: auth.id, token: auth.token, version: NET.version, generator: GENERATOR }); this.game.reconnect(auth.id);
  }
  onLeave(client: Client) {
    const auth = client.auth as GuestAuth; if (!auth) return;
    const pilot = this.game.pilots.get(auth.id);
    if (pilot) UniverseRoom.services.guests.save(auth.token, this.game.self(pilot));
    if (this.clientsById.has(auth.id)) this.closedSocketBytes += this.socketBytes(client);
    this.game.remove(auth.id); this.clientsById.delete(auth.id); this.encoders.delete(auth.id); this.combat.delete(auth.id); UniverseRoom.services.guests.flush();
  }
  private save() {
    for (const [id, client] of this.clientsById) {
      const p = this.game.pilots.get(id); if (p) UniverseRoom.services.guests.save((client.auth as GuestAuth).token, this.game.self(p));
    }
    UniverseRoom.services.guests.flush();
  }
  onDispose() { this.save(); UniverseRoom.instance = undefined; }
  private socketBytes(client: Client) { return (client.ref as unknown as { _socket?: { bytesWritten: number } })._socket?.bytesWritten ?? 0; }
  metrics() {
    const sorted = [...this.steps].sort((a, b) => a - b), cpu = process.cpuUsage(this.initialCPU), elapsed = (Date.now() - this.started) / 1000;
    return { players: this.game.pilots.size, maxPlayers: this.maxClients, systems: this.game.systems.size, bots: [...this.game.systems.values()].reduce((n, s) => n + s.bots.entities.size, 0),
      tick: this.game.tick, tickMs: { p50: sorted[Math.floor(sorted.length * .5)] ?? 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0,
        p99: sorted[Math.floor(sorted.length * .99)] ?? 0, max: this.maxStepMs },
      activeShots: this.game.shots.size, fired: this.game.fired, hits: this.game.hits, rejected: this.game.rejected,
      rejectedByReason: { ...this.game.rejectedByReason },
      socketBytesWritten: this.closedSocketBytes + [...this.clientsById.values()].reduce((sum, client) => sum + this.socketBytes(client), 0),
      elapsed, cpuMicroseconds: cpu.user + cpu.system, rssBytes: process.memoryUsage().rss };
  }
}
