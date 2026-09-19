import * as THREE from 'three';
import {SpaceEnvironment,SPACE_ENVIRONMENT as CONFIG,environmentCell} from './SpaceEnvironment';
import {DistantEnvironmentObjects} from './DistantEnvironmentObjects';
import {OrbitalDebris} from '../visuals/OrbitalDebris';
import type {SystemDescriptor} from '../systems/SystemDescriptor';
import type {OrbitalZone} from '../systems/OrbitalSite';
import type {FloatingOrigin} from '../space/FloatingOrigin';
import type {Triple} from '../space/WorldPosition';

/** Bounded cell cache, eight far-object batches, and a few detailed nearby fields. */
export class SpaceEnvironmentRenderer {
  readonly group=new THREE.Group();
  private source:SpaceEnvironment;
  private cache=new Map<string,OrbitalZone|null>();
  private fields:OrbitalZone[]=[];
  private details=new Map<string,{visual:OrbitalDebris;opacity:number}>();
  private distant=new DistantEnvironmentObjects();
  private centerKey='';
  private timer=1;
  private buildTimer=0;
  private lastPosition:Triple|null=null;
  private speed=0;
  private maxDetails:number;
  private counts={created:0,disposed:0,farObjects:0,generationMs:0,maxGenerationMs:0};
  private originShift=-1;
  private attributesDirty=true;
  constructor(private system:SystemDescriptor,private low:boolean,private targets:THREE.Mesh[]){
    this.source=new SpaceEnvironment(system);this.maxDetails=low?CONFIG.lowDetails:CONFIG.highDetails;
    this.group.name='streamed-interplanetary-environment';
    this.group.add(this.distant.group);
  }
  update(dt:number,elapsed:number,origin:FloatingOrigin,focus:THREE.Vector3){
    const absolute=origin.toAbsolute(focus.toArray());
    this.speed=this.lastPosition&&dt>0?Math.hypot(...absolute.map((v,i)=>v-this.lastPosition![i]))/dt:0;this.lastPosition=absolute;
    this.timer+=dt;this.buildTimer-=dt;
    if(this.timer>=.2){this.timer=0;this.select(absolute);}
    // At cruise speeds cells cross the entire view in milliseconds; their far layer remains batched.
    const wanted=this.speed<12000?this.fields.filter(field=>this.distance(field,absolute)<CONFIG.detailRange)
      .sort((a,b)=>this.distance(a,absolute)-this.distance(b,absolute)).slice(0,this.maxDetails):[];
    const wantedIds=new Set(wanted.map(field=>field.id));
    for(const [id,state] of this.details){
      const target=wantedIds.has(id)?1:0,previous=state.opacity;
      state.opacity=THREE.MathUtils.clamp(state.opacity+(target?1:-1)*dt*3,0,1);
      state.visual.update(origin,elapsed);state.visual.setOpacity(state.opacity);
      if(previous!==state.opacity)this.distant.setDetail(id,state.opacity);
      if(!target&&state.opacity===0){state.visual.dispose();this.details.delete(id);this.counts.disposed++;}
    }
    if(this.buildTimer<=0&&this.details.size<this.maxDetails+2){
      const field=wanted.find(field=>!this.details.has(field.id));
      if(field){const visual=new OrbitalDebris(this.system.bodies[0],this.low,this.targets,field,true);visual.setOpacity(0);visual.update(origin,elapsed);
        this.group.add(visual.group);this.details.set(field.id,{visual,opacity:0});this.counts.created++;this.buildTimer=.12;}
    }
    if(this.originShift!==origin.shifts){this.originShift=origin.shifts;this.attributesDirty=true;}
    if(this.attributesDirty){this.distant.setFields(this.fields,origin,id=>this.details.get(id)?.opacity??0);this.counts.farObjects=this.distant.count;this.attributesDirty=false;}
    this.distant.update(focus);
  }
  private distance(field:OrbitalZone,point:Triple){return Math.hypot(...field.center.map((v,i)=>v-point[i]));}
  private select(position:Triple){
    const cell=environmentCell(position),key=cell.join(',');
    if(key!==this.centerKey){
      const start=performance.now(),keep=new Set<string>();this.centerKey=key;
      for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++){
        const next:Triple=[cell[0]+x,cell[1]+y,cell[2]+z],id=next.join(',');keep.add(id);
        if(!this.cache.has(id))this.cache.set(id,this.source.field(next));
      }
      for(const id of this.cache.keys())if(!keep.has(id))this.cache.delete(id);
      this.counts.generationMs=performance.now()-start;this.counts.maxGenerationMs=Math.max(this.counts.maxGenerationMs,this.counts.generationMs);
    }
    const fields=[...this.cache.values()].filter((f):f is OrbitalZone=>!!f&&this.distance(f,position)<CONFIG.farRange+f.bound)
      .sort((a,b)=>this.distance(a,position)-this.distance(b,position));
    if(fields.map(f=>f.id).join('|')!==this.fields.map(f=>f.id).join('|')){this.fields=fields;this.attributesDirty=true;}
  }
  get effectZone(){
    if(!this.lastPosition)return null;
    return [...this.details.values()].filter(({visual,opacity})=>opacity>.9&&visual.site.showPhenomenon)
      .map(({visual})=>visual.site).filter(field=>this.distance(field,this.lastPosition!)<7500)
      .sort((a,b)=>this.distance(a,this.lastPosition!)-this.distance(b,this.lastPosition!))[0]??null;
  }
  get obstacles(){return this.fields.map(field=>({position:field.center,radius:field.bound,margin:150,speedLimit:false}));}
  snapshot(){return {cell:this.centerKey,cached:this.cache.size,detailed:this.details.size,maxDetails:this.maxDetails+2,
    ...this.counts,fields:this.fields.map(field=>({id:field.id,center:field.center,bound:field.bound,objects:field.objects,layout:field.layout,
      rocks:field.rocks.length,structure:field.structure,phenomenon:field.showPhenomenon?field.phenomenon:null,signature:field.profile.signature})),
    active:[...this.details.values()].map(({visual,opacity})=>({id:visual.site.id,opacity,...visual.snapshot()}))};}
  dispose(){for(const {visual} of this.details.values())visual.dispose();this.details.clear();this.cache.clear();this.fields=[];
    this.distant.dispose();this.group.removeFromParent();this.group.clear();}
}
