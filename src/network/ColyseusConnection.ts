import { GENERATOR, compatibleGenerator } from '../world/generation/GeneratorContract';
import { Vector3 } from 'three';
import type { Room } from '@colyseus/sdk';
import type { ShipController } from '../core/ShipController';
import type { FloatingOrigin } from '../world/space/FloatingOrigin';
import type { Group } from 'three';
import { FlightModel } from './shared/FlightModel';
import { NET, type PilotInput, type SelfSnapshot, type TravelArrival, type WorldSnapshot } from './shared/Protocol';
import { WorldDecoder, type PackedWorld } from './shared/WorldCodec';
import { NetworkAttitude } from './NetworkAttitude';
import { GAME_MODES, roomForMode, type GameMode } from './shared/GameMode';

interface Hooks {
  identity(id: string): void;
  arrival(data: TravelArrival): void;
  world(data: WorldSnapshot): void;
  event(type: string, data: any): void;
}
/** Explicit endpoint enables online mode. A failed connection never falls back to local authority. */
export class ColyseusConnection {
  private room: Room | null = null;
  private incompatible = false;
  private disposed = false; private retry: ReturnType<typeof setTimeout> | undefined;
  private model = new FlightModel(); private pending: PilotInput[] = []; private outgoing: PilotInput[] = [];
  private seq = 0; private epoch = 0; private accumulator = 0; private sendTime = 0;
  private correction = new Vector3(); private rendered = new Vector3(); private initialized = false;
  private attitude = new NetworkAttitude();
  private lastAckAt = 0; private controller: ShipController | undefined;
  private lastWorldAt = 0; private voiceTime = 0;
  private voiceQueue: Record<string, unknown>[] = [];
  private statusElement: HTMLDivElement;
  private decoder = new WorldDecoder();
  private readonly guestKey: string; private readonly reconnectKey: string;
  self: SelfSnapshot | null = null;
  connected = false; state = 'connecting'; received = 0; sent = 0; correctionDistance = 0;
  constructor(private endpoint: string, private username: string, private hooks: Hooks, readonly mode: GameMode = 'pvp') {
    this.guestKey = `universe:colyseus:guest:${endpoint}`; this.reconnectKey = `universe:colyseus:reconnect:${endpoint}${mode === 'pvp' ? '' : ':exploration'}`;
    this.statusElement = document.createElement('div'); this.statusElement.id = 'multiplayer-status'; this.statusElement.setAttribute('role', 'status');
    Object.assign(this.statusElement.style, { position: 'fixed', top: '76px', left: '50%', transform: 'translateX(-50%)', zIndex: '10000',
      background: 'rgba(5,12,24,.9)', color: '#c9e6ff', padding: '8px 14px', border: '1px solid #54718b', borderRadius: '6px',
      font: '12px system-ui', maxWidth: '80vw', textAlign: 'center', pointerEvents: 'none' });
    document.body.append(this.statusElement); this.status('connecting', 'Connecting to the universe…'); void this.connect();
  }
  private read(storage: Storage, key: string) { try { return storage.getItem(key); } catch { return null; } }
  private write(storage: Storage, key: string, value: string | null) { try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* private storage */ } }
  private status(state: string, message: string) {
    this.state = state; this.statusElement.textContent = message; this.statusElement.hidden = state === 'connected';
    this.controller?.setInputBlocked('network', state !== 'connected');
  }
  private async connect() {
    if (this.disposed) return;
    try {
      const { Client } = await import('@colyseus/sdk');
      if (this.disposed) return;
      const client = new Client(this.endpoint); let room: Room | undefined;
      // A reload may leave this tab's former mode in its reconnect grace period.
      // Release that reservation before entering another mode; other tabs have separate session storage.
      for (const otherMode of GAME_MODES) {
        if (otherMode === this.mode) continue;
        const key = `universe:colyseus:reconnect:${this.endpoint}${otherMode === 'pvp' ? '' : ':exploration'}`;
        const previous = this.read(sessionStorage, key);
        if (previous) {
          try { const former = await client.reconnect(previous); former.onMessage('*', () => {}); await former.leave(); } catch { /* expired reservation */ }
          this.write(sessionStorage, key, null);
        }
      }
      if (this.disposed) return;
      const saved = this.read(sessionStorage, this.reconnectKey);
      if (saved) {
        try { room = await client.reconnect(saved); } catch { this.write(sessionStorage, this.reconnectKey, null); }
      }
      room ??= await client.joinById(roomForMode(this.mode), { version: NET.version, generator: GENERATOR, mode: this.mode, username: this.username, token: this.read(localStorage, this.guestKey) });
      if (this.disposed) { await room.leave(); return; }
      this.room = room; this.decoder.reset(); room.reconnection.minUptime = 0; room.reconnection.maxRetries = 10;
      room.onMessage('welcome', data => {
        if (!compatibleGenerator(data.generator) || (data.mode ?? 'pvp') !== this.mode) { this.incompatible = true; this.connected = false; this.status('incompatible', 'World or game mode changed. Return to the launch screen.'); void room!.leave(); return; }
        this.hooks.identity(data.id); this.write(localStorage, this.guestKey, data.token);
        this.write(sessionStorage, this.reconnectKey, room!.reconnectionToken);
      });
      room.onMessage('arrival', (data: TravelArrival) => {
        if (this.incompatible) return;
        this.decoder.reset(); this.reset(data.epoch); this.hooks.arrival(data);
      });
      room.onMessage('world', (packet: PackedWorld) => {
        if (this.incompatible) return;
        const data = this.decoder.decode(packet);
        this.received++; this.lastWorldAt = performance.now(); this.connected = true; this.status('connected', '');
        this.write(sessionStorage, this.reconnectKey, room!.reconnectionToken);
        this.reconcile(data.self); this.hooks.world(data);
      });
      for (const type of ['chat', 'hit', 'die', 'sonar', 'voice', 'notice', 'misfire']) room.onMessage(type, data => this.hooks.event(type, data));
      room.onMessage('combat', data => {
        for (const hit of data.hits) this.hooks.event('hit', hit);
        for (const death of data.deaths) this.hooks.event('die', death);
      });
      room.onDrop(() => { this.connected = false; this.pending = []; this.outgoing = []; this.voiceQueue = []; this.status('reconnecting', 'Connection lost. Reconnecting…'); });
      room.onReconnect(() => { this.decoder.reset(); this.write(sessionStorage, this.reconnectKey, room!.reconnectionToken); });
      room.onLeave(() => {
        if (this.disposed || this.incompatible) return;
        this.connected = false; this.room = null; this.voiceQueue = []; this.write(sessionStorage, this.reconnectKey, null);
        this.status('disconnected', 'Connection lost. Retrying…'); this.scheduleRetry();
      });
      room.onError(() => { if(this.incompatible)return;this.connected = false; this.status('error', 'Connection error. Reconnecting…'); });
    } catch {
      if (!this.disposed) { this.connected = false; this.status('unavailable', 'Universe unavailable or full. Retrying…'); this.scheduleRetry(); }
    }
  }
  private scheduleRetry() { if (this.retry) clearTimeout(this.retry); this.retry = setTimeout(() => void this.connect(), 5000); }
  private reset(epoch: number) {
    this.epoch = epoch; this.seq = 0; this.pending = []; this.outgoing = []; this.accumulator = this.sendTime = 0;
    this.voiceQueue = []; this.voiceTime = 0;
    this.correction.set(0, 0, 0); this.initialized = false;
  }
  private reconcile(self: SelfSnapshot) {
    if (self.epoch !== this.epoch) this.reset(self.epoch);
    const before = this.model.position.clone().add(this.correction), wasInitialized = this.initialized;
    if (!this.self || self.seq !== this.self.seq) this.lastAckAt = performance.now();
    this.self = self; this.pending = this.pending.filter(input => input.seq > self.seq); this.model.restore(self.flight);
    if (!self.dead && !self.warp && !self.cruise) for (const input of this.pending) this.model.step(input, 1 / NET.tickHz);
    this.correctionDistance = wasInitialized ? before.distanceTo(this.model.position) : 0;
    if (wasInitialized && this.correctionDistance < 500 && !self.cruise && !self.warp) this.correction.copy(before).sub(this.model.position);
    else this.correction.set(0, 0, 0);
    if (!wasInitialized) { this.rendered.copy(this.model.position); this.attitude.reset(this.model.quaternion); }
    this.initialized = true;
  }
  frame(dt: number, controller: ShipController, ship: Group, frame: FloatingOrigin) {
    this.controller = controller;
    if (this.connected && performance.now() - this.lastWorldAt > 3000) {
      this.connected = false; this.status('reconnecting', 'World updates interrupted. Reconnecting…');
      this.room?.connection.close(4010, 'Snapshot timeout');
    }
    if (!this.connected || !this.self || !this.initialized) { controller.setInputBlocked('network', true); return; }
    controller.setInputBlocked('network', false);
    const self = this.self;
    controller.applyServerVitals(self);
    // ICE/offer bursts from a crowded area must not consume flight's message budget.
    // Keep the queue bounded and drain at most ~13 signals/sec, without catch-up bursts.
    this.voiceTime += dt;
    if (this.voiceTime >= .075 && this.voiceQueue.length) {
      this.voiceTime = 0; this.sent++; this.room!.send('voice', { ...this.voiceQueue.shift(), epoch: this.epoch });
    }
    this.accumulator = Math.min(this.accumulator + dt, .1);
    while (this.accumulator >= 1 / NET.tickHz) {
      this.accumulator -= 1 / NET.tickHz;
      if (self.dead) continue;
      if (this.pending.length >= 100) break;
      const input = controller.readPilotInput(++this.seq, 1 / NET.tickHz); this.pending.push(input); this.outgoing.push(input);
      if (!self.warp && !self.cruise) this.model.step(input, 1 / NET.tickHz);
    }
    this.sendTime += dt;
    if (this.sendTime >= .04 && this.outgoing.length) {
      this.sendTime = 0;
      while (this.outgoing.length) this.send('input', { epoch: this.epoch, inputs: this.outgoing.splice(0, 5) });
    }
    if (!self.dead && this.pending.length > 25 && performance.now() - this.lastAckAt > 1500) {
      this.send('sync', {}); this.lastAckAt = performance.now();
    }
    this.correction.multiplyScalar(Math.exp(-dt * 12));
    if (self.cruise) this.rendered.lerp(this.model.position, 1 - Math.exp(-dt * 12));
    else this.rendered.copy(this.model.position).add(this.correction);
    ship.position.fromArray(frame.fromAbsolute(this.rendered.toArray()));
    ship.quaternion.copy(this.attitude.update(this.model.quaternion, dt, !!self.cruise));
    controller.velocity.copy(this.model.velocity); controller.currentBoost = this.model.currentBoost; controller.isBoosting = this.model.isBoosting;
  }
  send(type: string, data: Record<string, unknown> = {}) {
    if (!this.connected || !this.room) return false;
    if (type === 'voice') {
      if (this.voiceQueue.length >= 512) return false;
      this.voiceQueue.push(data); return true;
    }
    this.sent++; this.room.send(type, { ...data, epoch: this.epoch }); return true;
  }
  stats() { return { transport: 'colyseus', mode: this.mode, state: this.state, subscribed: this.connected, configured: true, received: this.received, sendAttempts: this.sent,
    id: this.self?.id ?? null, systemId: this.self?.systemId ?? null, pendingInputs: this.pending.length, correctionDistance: this.correctionDistance,
    hp: this.self?.hp, shield: this.self?.shield, epoch: this.epoch, ack: this.self?.seq, dead: this.self?.dead }; }
  dispose() {
    this.disposed = true; this.connected = false; if (this.retry) clearTimeout(this.retry);
    const room = this.room; this.room = null;
    this.controller?.setInputBlocked('network', false); this.statusElement.remove();
    if (!room) return Promise.resolve();
    room.reconnection.enabled = false; room.reconnection.maxRetries = 0;
    // Never strand the launch-screen button waiting for an acknowledgement from a lost socket.
    // Keep its reconnect token if we could not release the seat, so this tab can reclaim it later.
    if (!room.connection.isOpen) { room.connection.close(); return Promise.resolve(); }
    return new Promise<void>(resolve => {
      const timeout = setTimeout(() => { room.connection.close(); resolve(); }, 1500);
      void room.leave().then(() => { clearTimeout(timeout); this.write(sessionStorage, this.reconnectKey, null); resolve(); })
        .catch(() => { clearTimeout(timeout); resolve(); });
    });
  }
}
