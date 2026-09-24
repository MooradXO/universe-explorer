import { explorationSites } from '../src/world/generation/ExplorationSites';
import { Quaternion, Vector3 } from 'three';
import type { MapObject } from '../src/catalog/StarMapData';
import { FlightModel } from '../src/network/shared/FlightModel';
import { idleInput, NET, validInput, type PilotInput, type SelfSnapshot, type ShotSnapshot, type Weapon, type WorldSnapshot } from '../src/network/shared/Protocol';
import { bodyArrival, buildSystem, SOLAR_CATALOG_OBJECT, SOLAR_SYSTEM, systemArrival, type SystemDescriptor } from '../src/world/systems/SystemDescriptor';
import { SYSTEM_CONFIG } from '../src/world/systems/SystemConfig';
import type { FlightObstacle } from '../src/world/systems/CruiseMotion';
import { CruiseNavigator, cruiseDeparture } from '../src/world/systems/CruiseNavigator';
import { faceFlightDirection, levelFlightDirection, steerFlightDirection } from '../src/world/systems/FlightOrientation';
import { systemObstacles } from '../src/world/generation/SystemPhysics';
import { environmentCell, SpaceEnvironment } from '../src/world/environments/SpaceEnvironment';
import type { Triple } from '../src/world/space/WorldPosition';
import { SpatialIndex } from './SpatialIndex';
import { RateLimit } from './RateLimit';
import { ServerBots } from './ServerBots';

const forward = new Vector3(0, 0, -1);
const base = (): [number, number, number] => { const p: [number, number, number] = [...systemArrival(SOLAR_SYSTEM)]; p[1] += 100; p[2] += 300; return p; };
const round = (n: number, scale = 100) => Math.round(n * scale) / scale;
export interface Entity { id: string; name: string; position: Vector3; quaternion: Quaternion; hp: number; bounty: number; dead: boolean; }
export interface Pilot extends Entity {
  model: FlightModel; systemId: string; epoch: number; seq: number; receivedSeq: number; queue: PilotInput[];
  input: PilotInput; lastInput: number; shield: number; subsystems: { engines: number; weapons: number; shieldGenerator: number };
  regenAt: number; respawnAt: number; fireAt: number; stuntAt: number; connected: boolean;
  warp: { id: string; at: number; base: boolean } | null; cruise: string | null; travelStatus: string;
  seen: Map<string, number>; seenShots: Set<number>; limits: RateLimit;
  snapshotPhase: number;
  cruiseNavigator: CruiseNavigator;
}
interface Shot { id: number; owner: string; systemId: string; position: Vector3; velocity: Vector3; life: number; weapon: Weapon; color: string; damage: number; snapshotTick?: number; snapshot?: ShotSnapshot; }
interface SystemState {
  object: MapObject; descriptor: SystemDescriptor; obstacles: FlightObstacle[]; collisionBodies: { position: Vector3; radius: number }[]; space: SpaceEnvironment;
  index: SpatialIndex<Entity>; members: Entity[]; bots: ServerBots; used: number; fields: Map<string, FlightObstacle | null>;
}
export type Send = (id: string, type: string, data: unknown) => void;

/** One authoritative universe. All time, identities, destinations and hits are server-owned. */
export class Simulation {
  readonly pilots = new Map<string, Pilot>();
  readonly shots = new Map<number, Shot>();
  readonly systems = new Map<string, SystemState>();
  time = 0; tick = 0; rejected = 0; hits = 0; fired = 0;
  readonly rejectedByReason: Record<string, number> = {};
  private nextShot = 1; private botsAt = -60; private nextSnapshotPhase = 0;
  private nextEntityVersion = 1;
  private entityCache = new Map<string, { tick: number; data: WorldSnapshot['entities'][number]; version: number }>();
  constructor(private resolve: (id: string) => MapObject | null, private send: Send = () => {}) { this.system(SOLAR_CATALOG_OBJECT.id); }

  private system(id: string): SystemState | null {
    const existing = this.systems.get(id); if (existing) { existing.used = this.time; return existing; }
    const object = id === SOLAR_CATALOG_OBJECT.id ? SOLAR_CATALOG_OBJECT : this.resolve(id); if (!object?.positioned) return null;
    let descriptor: SystemDescriptor; try { descriptor = buildSystem(object); } catch { return null; }
    const obstacles = systemObstacles(descriptor);
    const state: SystemState = { object, descriptor, obstacles, space: new SpaceEnvironment(descriptor),
      collisionBodies: [{ position: new Vector3(), radius: descriptor.starRadius }, ...descriptor.bodies.map(b => ({ position: new Vector3().fromArray(b.position), radius: b.radius }))],
      index: new SpatialIndex(500), members: [], used: this.time, fields: new Map(),
      bots: new ServerBots((owner, position, velocity, bomber) => this.projectile(id, owner, position, velocity, 2.5, 'laser', bomber ? 'purple' : 'red', bomber ? 35 : 15)) };
    this.systems.set(id, state); return state;
  }
  add(id: string, name: string, saved?: SelfSnapshot): Pilot {
    if (this.pilots.has(id) || this.pilots.size >= NET.maxPlayers) throw new Error('Universe full or guest already connected');
    const model = new FlightModel(); model.position.fromArray(base()); this.face(model, SOLAR_SYSTEM.bodies[2].position);
    const p: Pilot = { id, name, model, position: model.position, quaternion: model.quaternion, hp: 1000, shield: 1000,
      bounty: 50000, dead: false, systemId: SOLAR_CATALOG_OBJECT.id, epoch: 1, seq: 0, receivedSeq: 0, queue: [], input: idleInput(),
      lastInput: -1, subsystems: { engines: 100, weapons: 100, shieldGenerator: 100 }, regenAt: 0, respawnAt: 0,
      fireAt: 0, stuntAt: 0, connected: true, warp: null, cruise: null, travelStatus: '', seen: new Map(), seenShots: new Set(), limits: new RateLimit(),
      snapshotPhase: this.nextSnapshotPhase++ % (NET.tickHz / NET.snapshotHz), cruiseNavigator: new CruiseNavigator() };
    if (saved && this.system(saved.systemId)) {
      p.systemId = saved.systemId; model.restore(saved.flight); p.hp = saved.hp; p.shield = saved.shield;
      p.subsystems = { ...saved.subsystems }; p.bounty = saved.bounty; p.dead = saved.dead;
      p.regenAt = this.time + 5; p.respawnAt = this.time + 5; p.epoch = saved.epoch + 1;
      model.resetMotion();
    }
    this.pilots.set(id, p); return p;
  }
  announce(p: Pilot, respawn = false) {
    const system = this.system(p.systemId)!;
    this.send(p.id, 'arrival', { systemId: p.systemId, epoch: p.epoch, object: system.object, position: p.position.toArray(), respawn });
    p.seen.clear(); p.seenShots.clear(); this.send(p.id, 'world', this.snapshot(p));
  }
  remove(id: string) { this.pilots.delete(id); this.entityCache.delete(id); }
  drop(id: string) { const p = this.pilots.get(id); if (p) { p.connected = false; p.queue = []; p.input = idleInput(p.seq); p.cruise = null; p.warp = null; } }
  reconnect(id: string) { const p = this.pilots.get(id); if (p) { p.connected = true; p.epoch++; p.seq = p.receivedSeq = 0; p.queue = []; this.announce(p); } }
  input(id: string, message: unknown): boolean {
    const p = this.pilots.get(id), m = message as { epoch?: number; inputs?: unknown[] };
    if (!p || !p.connected || !m || m.epoch !== p.epoch || !Array.isArray(m.inputs) || !m.inputs.length || m.inputs.length > 5 ||
      !p.limits.accept('inputs', 70, 60, this.time)) return this.reject('input-envelope');
    let previous = p.receivedSeq;
    for (const input of m.inputs) { if (!validInput(input) || input.seq !== previous + 1) return this.reject('input-sequence'); previous = input.seq; }
    if (p.queue.length + m.inputs.length > NET.maxInputQueue) {
      // A hitch or hidden tab must not leave every future sequence permanently rejected.
      // Drop the excess time budget and start a new input epoch at the authoritative position.
      if (p.limits.accept('input-resync', 1, 1, this.time)) {
        p.epoch++; p.seq = p.receivedSeq = 0; p.queue = []; p.input = idleInput(); this.send(p.id, 'world', this.snapshot(p));
      }
      return this.reject('input-overflow');
    }
    for (const input of m.inputs as PilotInput[]) p.queue.push({ ...input });
    p.receivedSeq = previous; p.lastInput = this.time; return true;
  }
  private reject(reason = 'action') { this.rejected++; this.rejectedByReason[reason] = (this.rejectedByReason[reason] ?? 0) + 1; return false; }
  private message(p: Pilot, message: string) { p.travelStatus = message; this.send(p.id, 'notice', { message }); }
  action(id: string, type: string, value: unknown): boolean {
    const p = this.pilots.get(id); if (!p || !p.connected) return this.reject();
    const m = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (!p.limits.accept('actions', 40, 25, this.time)) return this.reject();
    if (type === 'sync') {
      if (!p.limits.accept('sync', 1, .5, this.time)) return this.reject();
      p.epoch++; p.seq = p.receivedSeq = 0; p.queue = []; p.input = idleInput(); this.announce(p); return true;
    }
    if (type === 'chat') {
      if (typeof m.message !== 'string' || !m.message.trim() || m.message.length > 280 || !p.limits.accept('chat', 4, .5, this.time)) return this.reject();
      const message = m.message.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
      for (const other of this.pilots.values()) if (other.connected && other.id !== id) this.send(other.id, 'chat', { username: p.name, message });
      return true;
    }
    if (type === 'voice') {
      const to = typeof m.targetId === 'string' ? this.pilots.get(m.targetId) : undefined;
      const signal = m.signal as Record<string, unknown> | undefined;
      if (!to || to === p || !to.connected || to.systemId !== p.systemId || p.position.distanceToSquared(to.position) > 3300 ** 2 ||
        !signal || !['offer', 'answer', 'candidate'].includes(String(signal.type)) || JSON.stringify(signal).length > 12000 ||
        !p.limits.accept('voice', 100, 50, this.time)) return this.reject();
      this.send(to.id, 'voice', { senderId: id, signal }); return true;
    }
    if (m.epoch !== p.epoch || p.dead) return this.reject();
    if (type === 'repair') {
      if (p.systemId !== SOLAR_CATALOG_OBJECT.id || p.position.distanceTo(new Vector3().fromArray(systemArrival(SOLAR_SYSTEM))) >= 1500 || p.warp || p.cruise) return this.reject();
      if (m.item === 'hull' && p.hp < 1000 && p.bounty >= 80) { p.hp = 1000; p.bounty -= 80; return true; }
      if (m.item === 'systems' && Object.values(p.subsystems).some(n => n < 100) && p.bounty >= 50) {
        p.subsystems = { engines: 100, weapons: 100, shieldGenerator: 100 }; p.bounty -= 50; return true;
      }
      return this.reject();
    }
    if (type === 'fire') {
      const weapon = m.weapon as Weapon;
      if (!['laser', 'shotgun', 'missile'].includes(weapon) || p.warp) return this.reject();
      if (this.time + 1e-6 < p.fireAt) return this.reject('fire-cooldown');
      if (p.cruise) p.model.resetMotion(); p.cruise = null; p.fireAt = this.time + ({ laser: .2, shotgun: .4, missile: .65 }[weapon]);
      if (p.subsystems.weapons < 50 && Math.random() < (1 - p.subsystems.weapons / 100) * .8) { this.send(id, 'misfire', {}); return true; }
      const color = ['red', 'green', 'blue', 'purple', 'yellow'].includes(String(m.color)) ? String(m.color) : 'red';
      const dir = forward.clone().applyQuaternion(p.quaternion), up = new Vector3(0, 1, 0).applyQuaternion(p.quaternion);
      for (const angle of weapon === 'shotgun' ? [0, -.15, .15] : [0]) {
        const direction = dir.clone().applyAxisAngle(up, angle);
        const speed = Math.max(({ laser: 4000, shotgun: 3800, missile: 2800 }[weapon]), p.model.velocity.dot(direction) + 600);
        const position = p.position.clone().addScaledVector(dir, 64).addScaledVector(direction, 72);
        this.projectile(p.systemId, id, position, direction.multiplyScalar(speed), ({ laser: 2, shotgun: 1.5, missile: 4 }[weapon]), weapon, color, 20);
      }
      return true;
    }
    if (type === 'warp' || type === 'base') {
      if (p.warp || !p.limits.accept('warp', 2, .4, this.time)) return this.reject();
      const target = type === 'base' ? SOLAR_CATALOG_OBJECT.id : m.systemId;
      if (typeof target !== 'string' || target.length > 64 || (target === p.systemId && type !== 'base') || !this.system(target)) {
        this.message(p, 'Destination is unavailable in the server catalogue.'); return this.reject();
      }
      p.cruise = null; p.model.resetMotion(); levelFlightDirection(p.quaternion);
      p.warp = { id: target, at: this.time + SYSTEM_CONFIG.warpSeconds, base: type === 'base' };
      p.travelStatus = 'Warp charging.'; return true;
    }
    if (type === 'cruise') {
      if (p.warp || typeof m.target !== 'string' || !this.target(p, m.target)) return this.reject();
      if (this.combatNearby(p)) { p.travelStatus = 'Combat nearby: manual flight.'; return false; }
      p.cruise = m.target;
      const target = this.target(p, m.target)!;
      p.cruiseNavigator.reset(cruiseDeparture(p.position.toArray(), target, this.systems.get(p.systemId)!.descriptor));
      p.model.resetMotion();
      p.travelStatus = 'Cruising to the orbital arrival point.'; return true;
    }
    if (type === 'stop') { if (p.cruise || p.warp) p.model.resetMotion(); p.cruise = null; p.warp = null; p.travelStatus = 'Manual flight.'; return true; }
    if (type === 'sonar') {
      if (!p.limits.accept('sonar', 1, .2, this.time)) return this.reject();
      for (const other of this.pilots.values()) if (other.id !== id && other.connected && other.systemId === p.systemId && other.position.distanceToSquared(p.position) < NET.interestExitRadius ** 2)
        this.send(other.id, 'sonar', { id, posX: p.position.x, posY: p.position.y, posZ: p.position.z });
      return true;
    }
    if (type === 'bots') {
      if (this.time - this.botsAt < 60 || [...this.systems.values()].some(s => s.bots.entities.size && s !== this.systems.get(p.systemId))) return this.reject();
      this.botsAt = this.time; this.systems.get(p.systemId)!.bots.spawn(100, p.position); return true;
    }
    // Deliberately no position, damage, death, identity, bounty or arbitrary entity messages.
    return this.reject();
  }
  private projectile(systemId: string, owner: string, position: Vector3, velocity: Vector3, life: number, weapon: Weapon, color: string, damage: number) {
    if (this.shots.size >= 2400) return;
    const id = this.nextShot; this.nextShot = (this.nextShot + 1) >>> 0 || 1; this.fired++;
    this.shots.set(id, { id, systemId, owner, position: position.clone(), velocity: velocity.clone(), life, weapon, color, damage });
  }
  private target(p: Pilot, id: string): Triple | null {
    if (id === 'base' && p.systemId === SOLAR_CATALOG_OBJECT.id) return base() as Triple;
    const system = this.systems.get(p.systemId)!.descriptor;
    if (id === 'star') return [0, 0, system.starRadius * 1.6 + SYSTEM_CONFIG.arrivalMargin];
    const body = system.bodies.find(b => b.id === id); return body ? bodyArrival(body) : explorationSites(system).find(s=>s.id===id)?.approach??null;
  }
  private combatNearby(p: Pilot) {
    const system = this.systems.get(p.systemId)!;
    for (const bot of system.bots.entities.values()) if (bot.position.distanceToSquared(p.position) < 6000 ** 2) return true;
    for (const shot of this.shots.values()) if (shot.systemId === p.systemId && shot.position.distanceToSquared(p.position) < 3000 ** 2) return true;
    return false;
  }
  private face(model: FlightModel, point: readonly number[]) {
    const direction = new Vector3().fromArray(point).sub(model.position).normalize();
    faceFlightDirection(model.quaternion, direction);
  }
  private arrive(p: Pilot, id: string, home = false, respawn = false) {
    const system = this.system(id)!;
    p.systemId = id; p.position.fromArray(home ? base() : systemArrival(system.descriptor));
    p.model.resetMotion(); this.face(p.model, system.descriptor.bodies[id === SOLAR_CATALOG_OBJECT.id ? 2 : 0].position);
    p.warp = null; p.cruise = null; p.queue = []; p.seq = p.receivedSeq = 0; p.input = idleInput(); p.epoch++;
    p.travelStatus = `Arrival: ${system.object.title}. Normal flight.`;
    this.announce(p, respawn);
  }
  step() {
    const dt = 1 / NET.tickHz; this.time += dt; this.tick++;
    for (const p of this.pilots.values()) {
      if (p.dead) {
        if (this.time >= p.respawnAt) {
          p.dead = false; p.hp = 1000; p.shield = 1000; p.subsystems = { engines: 100, weapons: 100, shieldGenerator: 100 };
          p.model.currentBoost = 100; this.arrive(p, SOLAR_CATALOG_OBJECT.id, true, true);
        }
        continue;
      }
      const next = p.queue.shift();
      if (next) { p.input = next; p.seq = next.seq; }
      else p.input = idleInput(p.seq); // Never simulate unacknowledged extra movement; at most one input per server tick.
      if (!p.connected || this.time - p.lastInput > NET.inputTimeoutMs / 1000) p.input = idleInput(p.seq);
      if (p.warp) { if (this.time >= p.warp.at) this.arrive(p, p.warp.id, p.warp.base); }
      else if (p.cruise) {
        const system = this.systems.get(p.systemId)!, target = this.target(p, p.cruise)!;
        if (this.combatNearby(p)) { p.cruise = null; p.model.resetMotion(); p.travelStatus = 'Combat nearby: manual flight.'; }
        else {
          const point = p.position.toArray() as Triple, cell = environmentCell(point), local: FlightObstacle[] = [];
          for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
            const address: Triple = [cell[0] + x, cell[1] + y, cell[2] + z], key = address.join(',');
            if (!system.fields.has(key)) {
              const field = system.space.field(address);
              if (system.fields.size >= 2048) system.fields.delete(system.fields.keys().next().value!);
              system.fields.set(key, field ? { position: field.center, radius: field.bound, margin: 150, speedLimit: false } : null);
            }
            const obstacle = system.fields.get(key); if (obstacle) local.push(obstacle);
          }
          const step = p.cruiseNavigator.step(point, target, [...system.obstacles, ...local], dt);
          const body = system.descriptor.bodies.find(b => b.id === p.cruise);
          const heading = step.state === 'arrived' ? body?.position ?? explorationSites(system.descriptor).find(s=>s.id===p.cruise)?.position ?? (p.cruise === 'base' ? systemArrival(SOLAR_SYSTEM) : [0, 0, 0]) : step.heading;
          const aligning = step.state !== 'obstructed' && steerFlightDirection(p.quaternion, new Vector3().fromArray(heading).sub(p.position), dt) > .03;
          if (step.state === 'moving' || aligning) {
            p.travelStatus = aligning ? 'Aligning cruise course.' : step.avoiding ? 'Cruising around an obstacle.' : 'Cruising to the orbital arrival point.';
          }
          if (aligning) p.model.velocity.set(0, 0, 0);
          else { p.model.velocity.fromArray(step.position).sub(p.position).multiplyScalar(1 / dt); p.position.fromArray(step.position); }
          if (step.state !== 'moving' && !aligning) {
            p.cruise = null; p.model.resetMotion(); p.travelStatus = step.state === 'arrived' ? 'Destination reached. Normal flight.' : 'Obstacle ahead. Move clear in manual flight.';
          }
        }
      } else {
        if (p.input.stunt) { if (this.time < p.stuntAt) p.input.stunt = null; else p.stuntAt = this.time + (p.input.stunt === 'uturn' ? 1.6 : .7); }
        p.model.subsystems.engines = p.subsystems.engines; p.model.step(p.input, dt);
      }
      if (this.time >= p.regenAt) { const condition = p.subsystems.shieldGenerator / 100; p.shield = Math.min(1000, p.shield + dt * 15 * (condition < .5 ? .2 + condition * 1.6 : 1)); }
    }
    for (const [id, system] of this.systems) {
      const pilots = [...this.pilots.values()].filter(p => p.systemId === id);
      if (!pilots.length) {
        system.bots.clear();
        if (id !== SOLAR_CATALOG_OBJECT.id && this.time - system.used > 10) this.systems.delete(id);
        continue;
      }
      system.used = this.time;
      if (this.tick % 2 === 0) system.bots.update(dt * 2, pilots.filter(p => !p.dead), system.descriptor);
      system.members = [...pilots, ...system.bots.entities.values()]; system.index.clear();
      for (const entity of system.members) if (!entity.dead) system.index.add(entity);
    }
    this.updateShots(dt);
    if (this.tick % NET.tickHz === 0) for (const [id, entry] of this.entityCache) if (this.tick - entry.tick > NET.tickHz) this.entityCache.delete(id);
    // Keep each client at 10Hz, but spread the 100 observers over the five simulation
    // steps. One large broadcast must not stall flight and then overflow every input queue.
    const phase = this.tick % (NET.tickHz / NET.snapshotHz);
    for (const p of this.pilots.values()) if (p.connected && p.snapshotPhase === phase) this.send(p.id, 'world', this.snapshot(p));
  }
  private updateShots(dt: number) {
    for (const [id, shot] of this.shots) {
      const system = this.systems.get(shot.systemId); if (!system || (shot.life -= dt) <= 0) { this.shots.delete(id); continue; }
      if (shot.weapon === 'missile') {
        let nearest: Entity | undefined, distance = 6000 ** 2;
        for (const bot of system.bots.entities.values()) { const d = bot.position.distanceToSquared(shot.position); if (d < distance) { nearest = bot; distance = d; } }
        if (nearest) shot.velocity.normalize().lerp(nearest.position.clone().sub(shot.position).normalize(), dt * 6).normalize().multiplyScalar(2800);
      }
      const from = shot.position.clone(), delta = shot.velocity.clone().multiplyScalar(dt); shot.position.add(delta);
      let hit: Entity | undefined, earliest = 1;
      for (const entity of system.index.nearby(from, delta.length() + 50)) {
        if (entity.id === shot.owner || entity.dead || (shot.owner.startsWith('bot_') && entity.id.startsWith('bot_'))) continue;
        const t = segmentSphere(from, delta, entity.position, shot.owner.startsWith('bot_') ? 25 : 40);
        if (t !== null && t <= earliest) { earliest = t; hit = entity; }
      }
      for (const body of system.collisionBodies) {
        const t = segmentSphere(from, delta, body.position, body.radius);
        if (t !== null && t <= earliest) { earliest = t; hit = undefined; }
      }
      if (hit || earliest < 1) {
        this.shots.delete(id); if (hit) this.damage(hit, shot.damage, shot.owner, system);
      }
    }
  }
  private damage(entity: Entity, amount: number, owner: string, system: SystemState) {
    if (entity.dead) return;
    const p = this.pilots.get(entity.id); this.hits++;
    if (p) {
      if (p.cruise || p.warp) p.model.resetMotion();
      p.regenAt = this.time + 5; p.cruise = null; p.warp = null; p.travelStatus = 'Under fire: manual flight.';
      const hull = Math.max(0, amount - p.shield); p.shield = Math.max(0, p.shield - amount); p.hp = Math.max(0, p.hp - hull);
      if (hull > 0 && p.hp > 0) { const key = (['engines', 'weapons', 'shieldGenerator'] as const)[Math.floor(Math.random() * 3)]; p.subsystems[key] = Math.max(0, p.subsystems[key] - Math.floor(amount * (.4 + Math.random() * .4))); }
    } else { entity.hp = Math.max(0, entity.hp - amount); system.bots.hit(entity.id, entity.hp); }
    for (const observer of this.pilots.values()) if (observer.connected && observer.systemId === system.object.id && observer.position.distanceToSquared(entity.position) < NET.interestExitRadius ** 2)
      this.send(observer.id, 'hit', { targetId: entity.id, shooterId: owner, damage: amount });
    if (entity.hp > 0) return;
    entity.dead = true;
    const killer = this.pilots.get(owner), killerName = killer?.name ?? system.bots.entities.get(owner)?.name ?? 'Enemy';
    if (killer) { killer.bounty += p ? Math.floor(entity.bounty * .5) : 100; killer.shield = Math.min(1000, killer.shield + 100); }
    for (const observer of this.pilots.values()) if (observer.connected && observer.systemId === system.object.id)
      this.send(observer.id, 'die', { killedId: entity.id, killerId: owner, killerName });
    if (p) { p.bounty = 100; p.respawnAt = this.time + 5; p.queue = []; p.model.resetMotion(); }
    else system.bots.remove(entity.id);
  }
  self(p: Pilot): SelfSnapshot {
    return { id: p.id, seq: p.seq, epoch: p.epoch, systemId: p.systemId, flight: p.model.snapshot(), hp: p.hp, shield: p.shield, maxHP: 1000,
      subsystems: { ...p.subsystems }, dead: p.dead, bounty: p.bounty, warp: p.warp?.id ?? null, cruise: p.cruise, travelStatus: p.travelStatus };
  }
  snapshot(p: Pilot): WorldSnapshot {
    const system = this.systems.get(p.systemId)!, entities: WorldSnapshot['entities'] = [], visible = new Set<string>(), shots: ShotSnapshot[] = [], active = new Set<number>();
    for (const entity of system.members) {
      if (entity.id === p.id || entity.dead || entity.position.distanceToSquared(p.position) > (p.seen.has(entity.id) ? NET.interestExitRadius : NET.interestRadius) ** 2) continue;
      visible.add(entity.id);
      let cache = this.entityCache.get(entity.id);
      if (!cache || cache.tick !== this.tick) {
        const data = { id: entity.id, name: entity.name, p: entity.position.toArray().map(n => round(n)), q: entity.quaternion.toArray().map(n => round(n, 10000)), bounty: entity.bounty, hp: entity.hp, dead: entity.dead };
        const old = cache?.data;
        const changed = !old || old.name !== data.name || old.bounty !== data.bounty || old.hp !== data.hp || old.dead !== data.dead ||
          data.p.some((n, i) => n !== old.p[i]) || data.q.some((n, i) => n !== old.q[i]);
        cache = { tick: this.tick, data, version: changed ? this.nextEntityVersion++ : cache!.version }; this.entityCache.set(entity.id, cache);
      }
      if (p.seen.get(entity.id) !== cache.version) { p.seen.set(entity.id, cache.version); entities.push(cache.data); }
    }
    const gone = [...p.seen.keys()].filter(id => !visible.has(id)); for (const id of gone) p.seen.delete(id);
    for (const shot of this.shots.values()) {
      if (shot.systemId !== p.systemId || shot.position.distanceToSquared(p.position) > NET.interestExitRadius ** 2) continue;
      active.add(shot.id);
      if (!p.seenShots.has(shot.id) || shot.weapon === 'missile') {
        if (shot.snapshotTick !== this.tick) {
          shot.snapshotTick = this.tick; shot.snapshot = { id: shot.id, owner: shot.owner, p: shot.position.toArray(), v: shot.velocity.toArray(), life: shot.life, weapon: shot.weapon, color: shot.color };
        }
        shots.push(shot.snapshot!);
      }
    }
    const shotGone = [...p.seenShots].filter(id => !active.has(id)); p.seenShots = active;
    return { tick: this.tick, self: this.self(p), entities, gone, shots, shotGone };
  }
}

/** First time of contact, including a projectile starting inside the sphere. */
export function segmentSphere(start: Vector3, delta: Vector3, center: Vector3, radius: number): number | null {
  const x = start.x - center.x, y = start.y - center.y, z = start.z - center.z;
  const c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = delta.lengthSq(); if (a < 1e-12) return null;
  const b = x * delta.x + y * delta.y + z * delta.z, discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a; return t >= 0 && t <= 1 ? t : null;
}
