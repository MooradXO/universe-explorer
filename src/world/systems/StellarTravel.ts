import { explorationSites } from '../generation/ExplorationSites';
import { readSurveyJournal, SURVEY_KEY } from '../generation/SurveyJournal';
import type { Engine } from '../../core/Engine';
import type { MapObject } from '../../catalog/StarMapData';
import { SystemNavigationUI } from '../../ui/SystemNavigationUI';
import { stellarAddress } from '../space/StellarAddress';
import { absolutePosition, worldPosition, type Triple, type WorldPosition } from '../space/WorldPosition';
import { bodyArrival, buildSystem, SOLAR_SYSTEM, systemArrival, type SystemDescriptor } from './SystemDescriptor';
import { flightSaveKey, readFlightSave, systemFromSave, unsupportedFlightSave } from './FlightSave';
import type { FlightObstacle } from './CruiseMotion';
import { CruiseNavigator, cruiseDeparture } from './CruiseNavigator';
import { SYSTEM_CONFIG } from './SystemConfig';
import { systemObstacles } from '../generation/SystemPhysics';
import { GENERATOR } from '../generation/GeneratorContract';
import type { SelfSnapshot, TravelArrival } from '../../network/shared/Protocol';

interface TravelHost {
  position(): WorldPosition;
  move(delta: Triple): void;
  enter(system: SystemDescriptor, position: WorldPosition): void;
  base(): Triple;
  rotation(): number[];
  restoreRotation(rotation: number[]): void;
  face(position: Triple): void;
  steer?(position: Triple, dt: number): number;
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
  private stoppingCruise = false;
  private cruiseNavigator = new CruiseNavigator();
  private speed = 0;
  private pending: { system: SystemDescriptor; position: WorldPosition; elapsed: number } | null = null;
  private networkWarp: string | null = null;
  private networkWarpTitle = 'Next system';
  private status = 'Earth Base. Choose a destination or open the star map.';
  private visited = new Set<string>();
  private journal=readSurveyJournal();
  private ui: SystemNavigationUI;
  private hudTime = 1;
  private obstacles: FlightObstacle[] = [];
  private events = new AbortController();
  private saveTimer = 0;
  private preserveUnsupportedSave=false;
  constructor(private engine: Engine, private host: TravelHost, private playerId: string,
    private network?: (type: string, data?: Record<string, unknown>) => boolean) {
    this.ui = new SystemNavigationUI(id => { this.selectDestination(id); },
      () => this.toggleCruise(), () => this.survey());
    const options = { signal: this.events.signal };
    window.addEventListener('ShipDamaged', () => { this.stopCruise('Under fire: manual flight.'); this.cancelWarp('Warp interrupted by damage.'); }, options);
    window.addEventListener('OpenStarMap', () => this.stopCruise(), options);
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]')) return;
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'Escape'].includes(e.code)) this.stopCruise('Manual flight.');
    }, { ...options, capture: true });
    for (const type of ['PrimaryFireStart', 'LeftClickShoot', 'TouchFireStart', 'TouchBoostOn']) window.addEventListener(type, () => this.stopCruise('Normal flight.'), { ...options, capture: true });
    window.addEventListener('TouchFlightInput', e => {
      if ((e as CustomEvent).detail.active) this.stopCruise('Manual flight.');
    }, { ...options, capture: true });
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
    if (this.network) {
      try { const saved: unknown = JSON.parse(localStorage.getItem('universe:colyseus:visited') ?? '[]');
        if (Array.isArray(saved)) this.visited = new Set(saved.filter((id): id is string => typeof id === 'string' && id.length < 128).slice(-128)); } catch { /* private storage */ }
      this.enter(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival())); return;
    }
    let saved = null;
    try { const raw=localStorage.getItem(flightSaveKey(this.playerId));this.preserveUnsupportedSave=unsupportedFlightSave(raw);saved=readFlightSave(raw); } catch { /* private storage */ }
    if (saved) {
      this.visited = new Set(saved.visited);
      this.enter(systemFromSave(saved), saved.address.local);
      this.host.restoreRotation(saved.rotation); this.status = 'Position restored on this device.';
    } else {
      this.enter(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival()));
      if(this.preserveUnsupportedSave)this.status='This device has a newer world save. It is preserved; position saving is disabled until a compatible game is opened.';
    }
  }
  private baseArrival(): Triple { const base = this.host.base(); return [base[0], base[1] + 100, base[2] + 300]; }
  private enter(system: SystemDescriptor, position: WorldPosition) {
    this.host.enter(system, position); this.system = system;
    this.selected = this.atHome ? 'base' : system.bodies[0].id;
    this.obstacles = systemObstacles(system);
    this.ui.setSystem(system, this.selected); this.hudTime = 1;
    this.host.face(system.bodies[this.atHome ? 2 : 0].position);
  }
  get atHome() { return this.system.anchor.catalogId === SYSTEM_CONFIG.homeSystemId; }
  selectDestination(id: string): boolean {
    if (this.warping || this.engine.shipController.isDead || !(id === 'star' || (id === 'base' && this.atHome) || this.system.bodies.some(body => body.id === id) || explorationSites(this.system).some(site=>site.id===id))) return false;
    this.stopCruise(); this.selected = id; this.status = 'Destination selected. Ready for cruise.'; this.hudTime = 1;
    this.ui.setSystem(this.system, id); return true;
  }
  get warping() { return this.network ? this.networkWarp !== null : this.pending !== null; }
  warp(object: MapObject): boolean {
    if (this.engine.shipController.isDead || this.warping || object.id === this.system.anchor.catalogId) return false;
    try {
      const system = buildSystem(object);
      if (this.network) {
        this.stopCruise(); this.networkWarpTitle = system.anchor.title;
        return this.network('warp', { systemId: object.id });
      }
      return this.beginWarp(system, worldPosition(undefined, systemArrival(system)));
    } catch (error) { this.status = (error as Error).message; return false; }
  }
  returnToBase(immediate = false) {
    if (this.engine.shipController.isDead) return;
    if (this.network) {
      this.stopCruise(); this.networkWarpTitle = SOLAR_SYSTEM.anchor.title; this.network('base');
      return;
    }
    this.stopCruise(); this.cancelWarp();
    if (immediate) { this.enter(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival())); this.save(); }
    else this.beginWarp(SOLAR_SYSTEM, worldPosition(undefined, this.baseArrival()));
  }
  private beginWarp(system: SystemDescriptor, position: WorldPosition) {
    this.stopCruise(); this.engine.shipController.resetTransitMotion();
    this.engine.shipController.levelTransitOrientation();
    this.engine.shipController.setInputBlocked('stellar-warp', true);
    this.pending = { system, position, elapsed: 0 }; this.hudTime = 1;
    return true;
  }
  private cancelWarp(message = '') {
    if (!this.pending && !this.networkWarp) return;
    this.pending = null; this.networkWarp = null; this.engine.shipController.setInputBlocked('stellar-warp', false);
    if (message) this.status = message; this.hudTime = 1;
  }
  stopCruise(message = '') {
    if (!this.cruise) return;
    this.stoppingCruise = this.network?.('stop') ?? false;
    this.cruise = false; this.speed = 0; this.engine.shipController.resetTransitMotion();
    this.engine.shipController.setInputBlocked('stellar-cruise', this.stoppingCruise);
    if (message) this.status = message; this.hudTime = 1;
  }
  private target(): Triple {
    if (this.selected === 'base') return this.baseArrival();
    if (this.selected === 'star') return [0, 0, this.system.starRadius * 1.6 + SYSTEM_CONFIG.arrivalMargin];
    const site=explorationSites(this.system).find(s=>s.id===this.selected);
    return site?.approach??bodyArrival(this.system.bodies.find(body => body.id === this.selected)!);
  }
  private toggleCruise() {
    if (this.stoppingCruise) return;
    if (this.cruise) { this.stopCruise('Cruise disengaged.'); return; }
    if (this.warping || this.engine.shipController.isDead) return;
    if (this.host.combatNearby()) { this.status = 'Combat nearby: manual flight available.'; return; }
    if (this.network && !this.network('cruise', { target: this.selected })) return;
    this.cruiseNavigator.reset(cruiseDeparture(absolutePosition(this.host.position()), this.target(), this.system));
    this.engine.shipController.resetTransitMotion(); this.engine.shipController.setInputBlocked('stellar-cruise', true);
    this.cruise = true; this.status = 'Cruising to the orbital arrival point. W/A/S/D or STOP returns to manual flight.';
  }
  update(dt: number) {
    if (this.engine.shipController.isDead) { this.stopCruise(); this.cancelWarp('Warp cancelled.'); }
    if (this.pending && !this.network) {
      this.pending.elapsed += dt;
      if (this.pending.elapsed >= SYSTEM_CONFIG.warpSeconds) {
        const next = this.pending;
        try { this.enter(next.system, next.position); this.status = `Arrival: ${next.system.anchor.title}. Normal flight.`; }
        catch { this.status = 'Could not enter the system. Please retry.'; }
        finally { this.cancelWarp(); }
        this.save();
      }
    }
    if (this.cruise && !this.network) {
      if (this.host.combatNearby()) this.stopCruise('Combat nearby: manual flight.');
      else {
        const current = absolutePosition(this.host.position()), step = this.cruiseNavigator.step(current, this.target(), [...this.obstacles,...this.host.localObstacles?.()??[]], dt);
        const heading = step.state === 'arrived' ? this.system.bodies.find(body => body.id === this.selected)?.position ?? explorationSites(this.system).find(s=>s.id===this.selected)?.position ??
          (this.selected === 'base' ? this.host.base() : [0, 0, 0] as Triple) : step.heading;
        const aligning = step.state !== 'obstructed' && (this.host.steer?.(heading, dt) ?? 0) > .03;
        if (step.state === 'moving' || aligning) {
          this.status = aligning ? 'Aligning cruise course.' : step.avoiding ? 'Cruising around an obstacle.' : 'Cruising to the orbital arrival point.';
        }
        this.speed = aligning ? 0 : step.speed;
        if (!aligning) this.host.move(step.position.map((v, i) => v - current[i]) as unknown as Triple);
        if (step.state !== 'moving' && !aligning) {
          this.stopCruise(step.state === 'arrived' ? 'Destination reached. Normal flight.' : 'Obstacle ahead. Move clear in manual flight, then retry cruise.');
        }
      }
    }
    this.engine.shipController.cruiseSpeed = this.speed;
    this.saveTimer += dt; if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }
    this.hudTime += dt; if (this.hudTime < 0.1) return; this.hudTime = 0;
    const current = absolutePosition(this.host.position()), target = this.target();
    const distance = Math.hypot(...target.map((v, i) => v - current[i]));
    const body = this.system.bodies.find(body => body.id === this.selected);
    const site = explorationSites(this.system).find(s=>s.id===this.selected);
    this.ui.update({ distance, cruising: this.cruise, stopping: this.stoppingCruise, warping: this.network ? (this.networkWarp ? this.networkWarpTitle : null) : this.pending?.system.anchor.title ?? null,
      status: this.status + (this.host.skyUnavailable?.() ? ' Sky catalogue unavailable; illustrative background displayed.' : ''),
      note: site ? `${site.description} ${site.objective}` : body ? `${body.note} Orbital scenery is artistic.` : (this.selected === 'base' ? 'Earth Base is fictional. Distances preserve real proportions; gas clouds and debris are artistic.' :
        this.system.starRadiusIsIllustrative ? 'AT-HYG star; radius and surface are illustrative.' : 'Sun. IAU nominal radius; illustrative surface.'),
      siteSurvey:!!site,survey: site ? distance <= site.scanRadius : !!body && distance < 5000, visited: this.journal.has(this.selected) || this.visited.has(this.selected), speed: this.speed, dead: this.engine.shipController.isDead });
  }
  private survey() {
    const site=explorationSites(this.system).find(s=>s.id===this.selected);
    if(site){
      if(this.cruise||this.warping||this.engine.shipController.isDead)return;
      if(this.journal.scan(site,this.system.anchor.catalogId,absolutePosition(this.host.position()))){this.host.scan?.();this.status=`Survey recorded: ${site.name}. ${site.description}`;this.save();}
      return;
    }
    const body = this.system.bodies.find(body => body.id === this.selected);
    const position = absolutePosition(this.host.position());
    if (!body || this.cruise || this.warping || this.engine.shipController.isDead || Math.hypot(...this.target().map((v, i) => v - position[i])) >= 5000) return;
    this.visited.add(body.id); if (this.visited.size > 128) this.visited.delete(this.visited.values().next().value!);
    this.host.scan?.();
    this.status = `Orbital point recorded: ${body.name}. ${body.note}`; this.save();
  }
  save(): boolean {
    try{localStorage.setItem(SURVEY_KEY,this.journal.serialize());}catch{/* Flight saves remain independent. */}
    if (this.engine.shipController.isDead || this.preserveUnsupportedSave) return true;
    if (this.network) { try { localStorage.setItem('universe:colyseus:visited', JSON.stringify([...this.visited])); } catch { /* private storage */ } return true; }
    try {
      localStorage.setItem(flightSaveKey(this.playerId), JSON.stringify({ version: 1, generator: GENERATOR, address: stellarAddress(this.system.anchor, this.host.position()),
        spectrum: this.system.spectrum, rotation: this.host.rotation(), visited: [...this.visited] }));
    } catch { this.status = 'The browser could not save your position. Free some local storage space.'; }
    return true;
  }
  snapshot() { return { systemId: this.system.anchor.catalogId, atHome: this.atHome, selected: this.selected, cruising: this.cruise,
    cruiseSpeed: this.speed, warping: this.network ? this.networkWarp : this.pending?.system.anchor.catalogId ?? null, visited: [...this.visited], journal:this.journal.snapshot(),preservedSave:this.preserveUnsupportedSave,sites:explorationSites(this.system), status: this.status,
    address: stellarAddress(this.system.anchor, this.host.position()) }; }
  applyArrival(data: TravelArrival) {
    this.cancelWarp(); this.cruise = false; this.stoppingCruise = false; this.speed = 0; this.engine.shipController.setInputBlocked('stellar-cruise', false);
    this.enter(buildSystem(data.object), worldPosition(undefined, [data.position[0], data.position[1], data.position[2]]));
    this.status = `Arrival: ${data.object.title}. Normal flight.`;
  }
  applyNetwork(state: SelfSnapshot) {
    // The picker owns the next destination. Delayed snapshots describe the old
    // active route and must not overwrite a selection made while stopping it.
    if (!state.cruise) this.stoppingCruise = false;
    this.cruise = state.cruise !== null && !this.stoppingCruise;
    this.engine.shipController.setInputBlocked('stellar-cruise', this.cruise || this.stoppingCruise);
    // Effects and input blocking follow the authoritative acknowledgement. A snapshot
    // already in flight before the request must not permanently cancel the portal.
    this.networkWarp = state.warp;
    this.engine.shipController.setInputBlocked('stellar-warp', this.networkWarp !== null);
    if (state.travelStatus) this.status = state.travelStatus;
    this.speed = state.cruise ? Math.hypot(...state.flight.v) : 0;
  }
  notice(message: string) { this.status = message; this.hudTime = 1; }
  connectionLost() { if (this.network) this.cancelWarp(); }
  dispose() { this.save(); this.stopCruise(); this.cancelWarp(); this.events.abort(); this.ui.dispose(); }
}
