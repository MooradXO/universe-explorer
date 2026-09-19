import type { Engine } from '../../core/Engine';
import type { MapObject } from '../../catalog/StarMapData';
import { SystemNavigationUI } from '../../ui/SystemNavigationUI';
import { stellarAddress } from '../space/StellarAddress';
import { absolutePosition, worldPosition, type Triple, type WorldPosition } from '../space/WorldPosition';
import { bodyArrival, buildSystem, SOLAR_SYSTEM, systemArrival, type SystemDescriptor } from './SystemDescriptor';
import { flightSaveKey, readFlightSave, systemFromSave } from './FlightSave';
import { cruiseStep, type FlightObstacle } from './CruiseMotion';
import { SYSTEM_CONFIG } from './SystemConfig';
import { orbitalZones } from './OrbitalSite';

interface TravelHost {
  position(): WorldPosition;
  move(delta: Triple): void;
  enter(system: SystemDescriptor, position: WorldPosition): void;
  base(): Triple;
  rotation(): number[];
  restoreRotation(rotation: number[]): void;
  face(position: Triple): void;
  combatNearby(): boolean;
  skyUnavailable?(): boolean;
  scan?(): void;
  localObstacles?(): FlightObstacle[];
}

/** Owns travel state and small local saves; WorldBuilder only applies scene changes. */
export class StellarTravel {
  system = SOLAR_SYSTEM;
  private selected = 'base';
  private cruise = false;
  private speed = 0;
  private pending: { system: SystemDescriptor; position: WorldPosition; elapsed: number } | null = null;
  private status = 'Earth Base. Choose a destination or open the star map.';
  private visited = new Set<string>();
  private ui: SystemNavigationUI;
  private hudTime = 1;
  private obstacles: FlightObstacle[] = [];
  private events = new AbortController();
  private saveTimer = 0;
  constructor(private engine: Engine, private host: TravelHost, private playerId: string) {
    this.ui = new SystemNavigationUI(id => { this.stopCruise(); this.selected = id; this.hudTime = 1; },
      () => this.toggleCruise(), () => this.survey());
    const options = { signal: this.events.signal };
    window.addEventListener('ShipDamaged', () => { this.stopCruise('Under fire: manual flight.'); this.cancelWarp('Warp interrupted by damage.'); }, options);
    window.addEventListener('OpenStarMap', () => this.stopCruise(), options);
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]')) return;
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'Escape'].includes(e.code)) this.stopCruise('Manual flight.');
    }, { ...options, capture: true });
    for (const type of ['PrimaryFireStart', 'LeftClickShoot', 'TouchBoostOn']) window.addEventListener(type, () => this.stopCruise('Normal flight.'), { ...options, capture: true });
    window.addEventListener('mousedown', e => {
      if (e.button === 0 && !(e.target as HTMLElement).closest('button,input,select,details,dialog,.system-navigation')) this.stopCruise('Manual flight.');
    }, { ...options, capture: true });
    window.addEventListener('DualJoystickMove', e => {
      const { x, y } = (e as CustomEvent).detail; if (Math.hypot(x, y) > 0.15) this.stopCruise('Manual flight.');
    }, { ...options, capture: true });
    window.addEventListener('pagehide', () => this.save(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.stopCruise('Flight paused.'); this.save(); } }, options);
  }
  start() {
    let saved = null;
    try { saved = readFlightSave(localStorage.getItem(flightSaveKey(this.playerId))); } catch { /* private storage */ }
    if (saved) {
      this.visited = new Set(saved.visited);
      this.enter(systemFromSave(saved), saved.address.local);
      this.host.restoreRotation(saved.rotation); this.status = 'Position restored on this device.';
    } else {
      this.enter(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival()));
    }
  }
  private baseArrival(): Triple { const base = this.host.base(); return [base[0], base[1] + 100, base[2] + 300]; }
  private enter(system: SystemDescriptor, position: WorldPosition) {
    this.host.enter(system, position); this.system = system;
    this.selected = this.atHome ? 'base' : system.bodies[0].id;
    this.obstacles = [{ position: [0, 0, 0], radius: system.starRadius }, ...system.bodies.map(body => ({ position: body.position, radius: body.radius })),
      ...system.bodies.flatMap(body=>orbitalZones(body).map(site=>({position:site.center,radius:site.bound,margin:150})))];
    this.ui.setSystem(system, this.selected); this.hudTime = 1;
    this.host.face(system.bodies[this.atHome ? 2 : 0].position);
  }
  get atHome() { return this.system.anchor.catalogId === SYSTEM_CONFIG.homeSystemId; }
  get warping() { return this.pending !== null; }
  warp(object: MapObject): boolean {
    if (this.engine.shipController.isDead || this.pending || object.id === this.system.anchor.catalogId) return false;
    try {
      const system = buildSystem(object);
      return this.beginWarp(system, worldPosition(undefined, systemArrival(system)));
    } catch (error) { this.status = (error as Error).message; return false; }
  }
  returnToBase(immediate = false) {
    if (this.engine.shipController.isDead) return;
    this.stopCruise(); this.cancelWarp();
    if (immediate) { this.enter(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival())); this.save(); }
    else this.beginWarp(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival()));
  }
  private beginWarp(system: SystemDescriptor, position: WorldPosition) {
    this.stopCruise(); this.engine.shipController.resetTransitMotion();
    this.engine.shipController.setInputBlocked('stellar-warp', true);
    this.pending = { system, position, elapsed: 0 }; this.hudTime = 1;
    return true;
  }
  private cancelWarp(message = '') {
    if (!this.pending) return;
    this.pending = null; this.engine.shipController.setInputBlocked('stellar-warp', false);
    if (message) this.status = message; this.hudTime = 1;
  }
  stopCruise(message = '') {
    if (!this.cruise) return;
    this.cruise = false; this.speed = 0; this.engine.shipController.resetTransitMotion();
    this.engine.shipController.setInputBlocked('stellar-cruise', false);
    if (message) this.status = message; this.hudTime = 1;
  }
  private target(): Triple {
    if (this.selected === 'base') return this.baseArrival();
    if (this.selected === 'star') return [0, 0, this.system.starRadius * 1.6 + SYSTEM_CONFIG.arrivalMargin];
    return bodyArrival(this.system.bodies.find(body => body.id === this.selected)!);
  }
  private toggleCruise() {
    if (this.cruise) { this.stopCruise('Cruise disengaged.'); return; }
    if (this.pending || this.engine.shipController.isDead) return;
    if (this.host.combatNearby()) { this.status = 'Combat nearby: manual flight available.'; return; }
    this.engine.shipController.resetTransitMotion(); this.engine.shipController.setInputBlocked('stellar-cruise', true);
    this.host.face(this.target());
    this.cruise = true; this.status = 'Cruising to the orbital arrival point. W/A/S/D or STOP returns to manual flight.';
  }
  update(dt: number) {
    if (this.engine.shipController.isDead) { this.stopCruise(); this.cancelWarp('Warp cancelled.'); }
    if (this.pending) {
      this.pending.elapsed += dt;
      if (this.pending.elapsed >= SYSTEM_CONFIG.warpSeconds) {
        const next = this.pending;
        try { this.enter(next.system, next.position); this.status = `Arrival: ${next.system.anchor.title}. Normal flight.`; }
        catch { this.status = 'Could not enter the system. Please retry.'; }
        finally { this.cancelWarp(); }
        this.save();
      }
    }
    if (this.cruise) {
      if (this.host.combatNearby()) this.stopCruise('Combat nearby: manual flight.');
      else {
        const current = absolutePosition(this.host.position()), step = cruiseStep(current, this.target(), [...this.obstacles,...this.host.localObstacles?.()??[]], dt);
        this.speed = step.speed;
        this.host.move(step.position.map((v, i) => v - current[i]) as unknown as Triple);
        if (step.state !== 'moving') {
          this.stopCruise(step.state === 'arrived' ? 'Destination reached. Normal flight.' : 'Obstacle ahead. Move clear in manual flight, then retry cruise.');
          if (step.state === 'arrived') this.host.face(this.system.bodies.find(body => body.id === this.selected)?.position ??
            (this.selected === 'base' ? this.host.base() : [0, 0, 0]));
        }
      }
    }
    this.saveTimer += dt; if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }
    this.hudTime += dt; if (this.hudTime < 0.1) return; this.hudTime = 0;
    const current = absolutePosition(this.host.position()), target = this.target();
    const distance = Math.hypot(...target.map((v, i) => v - current[i]));
    const body = this.system.bodies.find(body => body.id === this.selected);
    this.ui.update({ distance, cruising: this.cruise, warping: this.pending?.system.anchor.title ?? null,
      status: this.status + (this.host.skyUnavailable?.() ? ' Sky catalogue unavailable; illustrative background displayed.' : ''),
      note: body ? `${body.note} Orbital scenery is artistic.` : (this.selected === 'base' ? 'Earth Base is fictional. Distances preserve real proportions; gas clouds and debris are artistic.' :
        this.system.starRadiusIsIllustrative ? 'AT-HYG star; radius and surface are illustrative.' : 'Sun. IAU nominal radius; illustrative surface.'),
      survey: !!body && distance < 5000, visited: this.visited.has(this.selected), speed: this.speed, dead: this.engine.shipController.isDead });
  }
  private survey() {
    const body = this.system.bodies.find(body => body.id === this.selected);
    const position = absolutePosition(this.host.position());
    if (!body || this.cruise || this.pending || this.engine.shipController.isDead || Math.hypot(...this.target().map((v, i) => v - position[i])) >= 5000) return;
    this.visited.add(body.id); if (this.visited.size > 128) this.visited.delete(this.visited.values().next().value!);
    this.host.scan?.();
    this.status = `Orbital point recorded: ${body.name}. ${body.note}`; this.save();
  }
  save(): boolean {
    if (this.engine.shipController.isDead) return true;
    try {
      localStorage.setItem(flightSaveKey(this.playerId), JSON.stringify({ version: 1, address: stellarAddress(this.system.anchor, this.host.position()),
        spectrum: this.system.spectrum, rotation: this.host.rotation(), visited: [...this.visited] }));
    } catch { this.status = 'The browser could not save your position. Free some local storage space.'; }
    return true;
  }
  snapshot() { return { systemId: this.system.anchor.catalogId, atHome: this.atHome, selected: this.selected, cruising: this.cruise,
    cruiseSpeed: this.speed, warping: this.pending?.system.anchor.catalogId ?? null, visited: [...this.visited], status: this.status,
    address: stellarAddress(this.system.anchor, this.host.position()) }; }
  dispose() { this.save(); this.stopCruise(); this.cancelWarp(); this.events.abort(); this.ui.dispose(); }
}
