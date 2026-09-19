import { Group, Vector3, type Camera, type Scene, type Quaternion } from 'three';
import type { EpicFX, EpicFXLibrary } from '../../vendor/epic-fx/epic-fx';
import { EpicEffectSpace } from './EpicEffectSpace';
import { environmentFX } from '../environments/EnvironmentFX';
import type { OrbitalZone } from '../systems/OrbitalSite';

type Kind = 'warp' | 'scan' | 'anomaly';
const PRESETS = {
  warp: { id: '6749a1da7a6538e4bae6c320db525d94', size: 2, units: 115 },
  scan: { id: 'd773d301d86b3254180a6887af308eef', size: .8, units: 125 },
  anomaly: { id: 'beb57d582b696b645928b556533430b2', size: 3.6, units: 260 },
};
interface Slot { wanted: boolean; ticket: number; effect?: EpicFX; failed: boolean; space: EpicEffectSpace }
const slot = (units: number): Slot => ({ wanted: false, ticket: 0, failed: false, space: new EpicEffectSpace(units) });

/** Travel presets plus a curated environment subset. At most two live effects.
 * All effects are silent, ground-free, bounded, and invalidated across system changes.
 */
export class ApprovedFlightFX {
  readonly group = new Group();
  private library?: EpicFXLibrary;
  private loading?: Promise<EpicFXLibrary>;
  private environmentLibrary?:EpicFXLibrary;
  private environmentLoading?:Promise<EpicFXLibrary>;
  private environmentPreset:ReturnType<typeof environmentFX>=null;
  private zoneKey:string|null=null;
  private slots = { warp: slot(PRESETS.warp.units), scan: slot(PRESETS.scan.units), anomaly: slot(PRESETS.anomaly.units) };
  private scanAnchor = new Vector3();
  private scanTime = 0;
  private disposed = false;
  private budget: number;
  constructor(scene: Scene, private low: boolean) {
    this.budget = low ? 260 : 700; this.group.name = 'approved-flight-fx'; scene.add(this.group);
    for (const state of Object.values(this.slots)) this.group.add(state.space.anchor);
  }
  private load() {
    return this.loading ??= import('../../vendor/epic-fx/epic-fx.js').then(async ({ EpicFXLibrary }) => {
      const library = new EpicFXLibrary('/assets/fx-preview/');
      try { await library.ready; } catch (error) { library.dispose(); throw error; }
      if (this.disposed) { library.dispose(); throw Error('Flight FX disposed'); }
      this.library = library; return library;
    }).catch(error => { this.loading = undefined; throw error; });
  }
  private loadEnvironment(){return this.environmentLoading??=import('../../vendor/epic-fx/epic-fx.js').then(async({EpicFXLibrary})=>{
    const library=new EpicFXLibrary('/assets/fx-environments/');try{await library.ready;}catch(error){library.dispose();throw error;}
    if(this.disposed){library.dispose();throw Error('Environment FX disposed');}this.environmentLibrary=library;return library;
  }).catch(error=>{this.environmentLoading=undefined;throw error;});}
  private want(kind: Kind, wanted: boolean) {
    const state = this.slots[kind]; if (state.wanted === wanted) return;
    state.wanted = wanted; const ticket = ++state.ticket; state.failed = false;
    state.effect?.dispose(); state.effect = undefined;
    if (!wanted) return;
    const environment=kind==='anomaly'?this.environmentPreset:null;
    void (environment?this.loadEnvironment():this.load()).then(async library => {
      if (this.disposed || state.ticket !== ticket) return;
      const effect = await library.create(environment?.id??PRESETS[kind].id, {
        size: environment?.size??PRESETS[kind].size, sound: false, groundY: null, prewarm: false, seed: environment?.seed??1337,color:environment?.color,
        // Upstream rounds each emission batch: density below .5 drops one-particle emitters entirely.
        intensity: environment?.family===5?.18:environment?.family!==undefined?.4:.85, density: this.low ? .55 : .8, maxParticles: this.budget,
        maxParticlesPerEmitter: this.low ? 110 : 280,
      });
      if (this.disposed || state.ticket !== ticket) { effect.dispose(); return; }
      effect.group.visible = false; state.effect = effect; state.space.anchor.add(effect.group);
    }).catch(() => { if (state.ticket === ticket && !this.disposed) state.failed = true; });
  }
  scan(position: Vector3) { this.want('scan', false); this.scanAnchor.copy(position); this.scanTime = 3; this.want('scan', true); }
  shiftOrigin(delta: Vector3) {
    this.scanAnchor.sub(delta);
    for (const state of Object.values(this.slots)) state.space.anchor.position.sub(delta);
  }
  update(dt: number, camera: Camera, position: Vector3, rotation: Quaternion, warping: boolean, anomaly: Vector3 | null,zone:OrbitalZone|null=null) {
    if((zone?.id??null)!==this.zoneKey){this.want('anomaly',false);this.zoneKey=zone?.id??null;this.environmentPreset=zone?environmentFX(zone):null;
      this.slots.anomaly.space.anchor.scale.setScalar(this.environmentPreset?.units??PRESETS.anomaly.units);
      this.slots.anomaly.space.anchor.rotation.set(zone?zone.profile.variant*.17:0,zone?(zone.profile.seed%97)*.07:0,zone?zone.index*.2:0);}
    this.want('warp', warping);
    this.want('anomaly', !warping && !!anomaly && !!this.environmentPreset);
    if (warping) this.scanTime = 0;
    this.scanTime = Math.max(0, this.scanTime - dt); this.want('scan', this.scanTime > 0);
    for (const kind of ['warp', 'scan', 'anomaly'] as const) {
      const state = this.slots[kind], effect = state.effect; if (!effect) continue;
      const anchor = state.space.anchor;
      if (kind === 'warp') {
        anchor.position.set(0, 0, -950).applyQuaternion(rotation).add(position);
        anchor.quaternion.copy(rotation);
      } else anchor.position.copy(kind === 'scan' ? this.scanAnchor : anomaly!);
      effect.group.visible = true; state.space.update(effect, dt, camera);
    }
  }
  clear() { this.scanTime = 0;this.zoneKey=null;this.environmentPreset=null; for (const kind of ['warp', 'scan', 'anomaly'] as const) this.want(kind, false); }
  snapshot() { return { budgetPerEffect: this.budget, maxActive: 2,
    effects: Object.fromEntries(Object.entries(this.slots).map(([kind, state]) => [kind,
      { preset:kind==='anomaly'?this.environmentPreset?.name??null:PRESETS[kind as Kind].id,requested: state.wanted, ready: !!state.effect, failed: state.failed, particles: state.effect?.particleCount ?? 0,
        position: state.effect ? state.space.anchor.position.toArray() : null,
        simulationUnitsPerFlightUnit: 1 / state.space.anchor.scale.x }])) }; }
  dispose() { this.disposed = true; this.clear(); this.library?.dispose();this.environmentLibrary?.dispose(); this.group.removeFromParent(); }
}
