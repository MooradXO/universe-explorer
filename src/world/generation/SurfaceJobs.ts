import * as THREE from 'three';
import { createSurfaceBake, bakeSurfaceRows, type SurfaceBake, type SurfaceRecipe } from './SurfaceBake';
export const SURFACE_BUDGETS={LOW:{width:256,entries:6,queue:6,bytes:2*1024*1024},HIGH:{width:512,entries:10,queue:10,bytes:8*1024*1024}} as const;
type State='queued'|'baking'|'upload'|'ready';
interface Entry {key:string;recipe:SurfaceRecipe;users:number;priority:number;touched:number;state:State;token:number;texture?:THREE.DataTexture;bake?:SurfaceBake;}
interface WorkerLike {onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;postMessage(value:unknown):void;terminate():void;}
/** A bounded single producer. GPU installation occurs only from pump(), at most once per frame. */
export class SurfaceJobs {
  readonly budget:typeof SURFACE_BUDGETS.LOW|typeof SURFACE_BUDGETS.HIGH;
  private entries=new Map<string,Entry>();private worker:WorkerLike|null=null;private active:Entry|null=null;
  private fallback:{entry:Entry;bake:SurfaceBake;row:number}|null=null;private ticket=0;private clock=0;private disposed=false;
  private jobs=0;private cancelled=0;private cacheHits=0;private lastJobMs=0;private maxPumpMs=0;private failures=0;
  constructor(low:boolean,factory:()=>WorkerLike=()=>new Worker(new URL('./surface.worker.ts',import.meta.url),{type:'module'})){
    this.budget=low?SURFACE_BUDGETS.LOW:SURFACE_BUDGETS.HIGH;
    try{this.worker=factory();this.worker.onmessage=e=>this.complete(e.data);this.worker.onerror=e=>{e.preventDefault?.();this.failWorker();};}catch{this.failWorker();}
  }
  private key(recipe:SurfaceRecipe){return `surface3:${this.budget.width}:${JSON.stringify(recipe)}`;}
  acquire(recipe:SurfaceRecipe){const entry=this.ensure(recipe,10);entry.users++;return entry.key;}
  prefetch(recipe:SurfaceRecipe){this.ensure(recipe,1);}
  private ensure(recipe:SurfaceRecipe,priority:number){
    const key=this.key(recipe),old=this.entries.get(key);if(old){old.touched=++this.clock;old.priority=Math.max(old.priority,priority);this.cacheHits++;return old;}
    const entry:Entry={key,recipe,users:0,priority,touched:++this.clock,state:'queued',token:++this.ticket};this.entries.set(key,entry);this.trim();return entry;
  }
  texture(key:string){return this.entries.get(key)?.texture??null;}
  release(key:string){const entry=this.entries.get(key);if(!entry)return;entry.users=Math.max(0,entry.users-1);entry.priority=1;
    if(entry.users===0&&entry.state!=='ready')this.remove(entry);this.trim();}
  private remove(entry:Entry){
    if(this.active===entry){this.worker?.postMessage({cancel:true});this.active=null;this.fallback=null;this.cancelled++;}
    entry.texture?.dispose();this.entries.delete(entry.key);
  }
  private trim(){
    const size=this.budget.width*this.budget.width/2*4*4/3;
    const limit=Math.min(this.budget.entries,Math.floor(this.budget.bytes/size));
    while(this.entries.size>limit){const unused=[...this.entries.values()].filter(e=>e.users===0&&e!==this.active).sort((a,b)=>a.priority-b.priority||a.touched-b.touched)[0];if(!unused)break;this.remove(unused);}
  }
  private failWorker(){
    this.worker?.terminate();this.worker=null;this.failures++;
    if(this.active){this.active.state='queued';this.active=null;}this.fallback=null;
  }
  private complete(data:{token:number;pixels?:Uint8Array<ArrayBuffer>;width:number;height:number;ms?:number;error?:boolean}){
    const entry=this.active;if(!entry||data.token!==entry.token||this.disposed)return;
    if(data.error||!data.pixels){this.failWorker();return;}
    entry.bake={pixels:data.pixels,width:data.width,height:data.height};entry.state='upload';this.lastJobMs=data.ms??0;this.active=null;this.jobs++;
  }
  pump(){
    if(this.disposed)return;const started=performance.now();
    const upload=[...this.entries.values()].find(e=>e.state==='upload');
    if(upload?.bake){const b=upload.bake,t=new THREE.DataTexture(b.pixels,b.width,b.height,THREE.RGBAFormat);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;upload.texture=t;upload.bake=undefined;upload.state='ready';this.trim();}
    if(!this.active){
      const next=[...this.entries.values()].filter(e=>e.state==='queued').sort((a,b)=>b.priority-a.priority||b.touched-a.touched)[0];
      if(next){this.active=next;next.state='baking';if(this.worker)this.worker.postMessage({token:next.token,recipe:next.recipe,width:this.budget.width});
        else this.fallback={entry:next,bake:createSurfaceBake(this.budget.width),row:0};}
    }
    if(this.fallback){const job=this.fallback;
      // At most a couple of rows per frame; never a whole map on the render thread.
      do {bakeSurfaceRows(job.entry.recipe,job.bake,job.row,job.row+1);job.row++;}while(job.row<job.bake.height&&performance.now()-started<1.5);
      if(job.row===job.bake.height){this.complete({token:job.entry.token,...job.bake});this.fallback=null;}
    }
    this.maxPumpMs=Math.max(this.maxPumpMs,performance.now()-started);
  }
  snapshot(){return {mode:this.worker?'worker':'incremental-fallback',entries:this.entries.size,queued:[...this.entries.values()].filter(e=>e.state==='queued').length,active:this.active?1:0,
    ready:[...this.entries.values()].filter(e=>e.state==='ready').length,estimatedBytes:this.entries.size*this.budget.width*this.budget.width/2*4*4/3,budgetBytes:this.budget.bytes,jobs:this.jobs,cancelled:this.cancelled,cacheHits:this.cacheHits,lastJobMs:this.lastJobMs,maxPumpMs:this.maxPumpMs,failures:this.failures};}
  dispose(){this.disposed=true;this.worker?.terminate();this.worker=null;for(const e of this.entries.values())e.texture?.dispose();this.entries.clear();this.active=null;this.fallback=null;}
}
