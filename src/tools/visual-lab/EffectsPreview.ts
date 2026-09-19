import { Vector3, type Camera, type Scene } from 'three';
import type { EpicFX, EpicFXLibrary } from '../../vendor/epic-fx/epic-fx';
import type { Quality } from './directions';

export type EffectId = 'none' | 'warp' | 'scan' | 'anomaly';
const PRESETS = {
  warp: { id:'6749a1da7a6538e4bae6c320db525d94', size:2, name:'SpinPortalBlue' },
  scan: { id:'d773d301d86b3254180a6887af308eef', size:.8, name:'ScanExplosion' },
  anomaly: { id:'beb57d582b696b645928b556533430b2', size:3.6, name:'Plexus' },
} as const;

/** Owns at most one effect. Stale async selections are disposed before display. */
export class EffectsPreview {
  private library?: EpicFXLibrary;
  private loading?: Promise<EpicFXLibrary>;
  private effect?: EpicFX;
  private generation=0;
  private selected: EffectId='none';
  private quality: Quality;
  private disposed=false;
  private elapsed=0;
  private status='';
  constructor(private scene: Scene, quality: Quality, private report:(text:string)=>void) { this.quality=quality; }
  async select(id: EffectId) {
    const ticket=++this.generation;
    this.effect?.dispose();this.effect=undefined;this.selected=id;this.elapsed=0;
    if(id==='none'){this.setStatus('Эффекты выключены');return;}
    this.setStatus('Загружаю эффект…');
    try {
      this.loading ??= import('../../vendor/epic-fx/epic-fx.js').then(async ({EpicFXLibrary})=>{
        const library=new EpicFXLibrary('/assets/fx-preview/');
        try { await library.ready; } catch(error) { library.dispose(); throw error; }
        if(this.disposed){library.dispose();throw Error('Preview closed');}
        this.library=library;return library;
      }).catch(error=>{this.loading=undefined;throw error;});
      const library=await this.loading;
      if(ticket!==this.generation || this.disposed)return;
      const preset=PRESETS[id];
      const effect=await library.create(preset.id, { size:preset.size, position:[-3.6,.15,-.5],
        sound:false, groundY:null, prewarm:false, seed:1337, intensity:.85,
        density:this.quality==='LOW'?.55:1, maxParticles:this.quality==='LOW'?450:1200,
        maxParticlesPerEmitter:this.quality==='LOW'?180:500 });
      if(ticket!==this.generation || this.disposed){effect.dispose();return;}
      this.effect=effect;this.scene.add(effect.group);
      this.setStatus(`EpicToonFX · ${preset.name}`);
    } catch {
      if(ticket===this.generation && !this.disposed)this.setStatus('Эффект не загрузился. Нажми ещё раз для повтора.');
    }
  }
  private setStatus(text: string){this.status=text;this.report(text);}
  setQuality(quality: Quality) {
    this.quality=quality;
    // Recreate: the upstream batches allocate capacity on construction.
    if(this.selected!=='none')void this.select(this.selected);
  }
  update(dt:number,camera:Camera) {
    this.elapsed+=dt;
    if(this.selected==='scan' && this.elapsed>4){this.effect?.restart({sound:false});this.elapsed=0;}
    this.effect?.update(dt,camera);
  }
  snapshot(){return {selected:this.selected,ready:!!this.effect,status:this.status,
    particles:this.effect?.particleCount??0, budget:this.quality==='LOW'?450:1200,
    bounds:this.effect?.bounds().getSize(_size).toArray()??null};}
  dispose(){this.disposed=true;++this.generation;this.effect?.dispose();this.effect=undefined;this.library?.dispose();}
}
const _size=new Vector3();
