import {createSeededRandom,hashString} from '../celestial/WorldSeed';
import {bodyArrival,type SystemDescriptor} from '../systems/SystemDescriptor';
import {layoutPoint,type OrbitalZone} from '../systems/OrbitalSite';
import type {Triple} from '../space/WorldPosition';
import {OBJECTS} from './EnvironmentLibrary';

export const SPACE_ENVIRONMENT={cellSize:9000,farRange:19000,detailRange:11000,cacheLimit:125,highDetails:6,lowDetails:3} as const;
export const environmentCell=(position:Triple):Triple=>position.map(v=>Math.floor(v/SPACE_ENVIRONMENT.cellSize)) as unknown as Triple;

/** Fixed system-space fields. Cell addresses never depend on the camera, time or load order. */
export class SpaceEnvironment {
  private routes:{start:Triple;direction:Triple;length:number}[]=[];
  private salt:number;
  constructor(readonly system:SystemDescriptor){
    this.salt=hashString(`${system.anchor.catalogId}:interplanetary-art:v1`);
    const points=system.bodies.map(bodyArrival);
    points.push([0,0,system.starRadius*1.6+6000]);
    // Keep the existing direct planet-to-planet cruise corridors clear of new scenery.
    points.forEach((start,i)=>points.slice(i+1).forEach(end=>{
      const delta=end.map((v,a)=>v-start[a]),length=Math.hypot(...delta);
      this.routes.push({start,direction:delta.map(v=>v/length) as unknown as Triple,length});
    }));
  }
  clear(center:Triple,bound:number){
    if(Math.hypot(...center)<this.system.starRadius+bound+8000)return false;
    for(const body of this.system.bodies){
      if(Math.hypot(...center.map((v,i)=>v-body.position[i]))<body.radius+bound+5000)return false;
      if(Math.hypot(...center.map((v,i)=>v-bodyArrival(body)[i]))<bound+6500)return false;
    }
    return this.routes.every(({start,direction,length})=>{
      const offset=center.map((v,i)=>v-start[i]),along=Math.max(0,Math.min(length,offset.reduce((s,v,i)=>s+v*direction[i],0)));
      return Math.hypot(...offset.map((v,i)=>v-direction[i]*along))>bound+800;
    });
  }
  field(cell:Triple):OrbitalZone|null{
    const id=`${this.system.anchor.catalogId}/space/${cell.join(',')}`,seed=hashString(id),random=createSeededRandom(seed);
    // Broad density regions contain different-sized fields; individual cells need not be occupied.
    const region=(Math.sin(cell[0]*.21+this.salt%29)+Math.sin(cell[1]*.19+cell[2]*.17))/2;
    if(random()>.83+region*.1)return null;
    const center=cell.map(v=>(v+.2+random()*.6)*SPACE_ENVIRONMENT.cellSize) as unknown as Triple;
    const bound=1050+random()*1100;if(!this.clear(center,bound))return null;
    const source=this.system.bodies[seed%this.system.bodies.length].environment;
    const objects=(seed+Math.abs(cell[0])+Math.abs(cell[2])*3)%32,layout=Math.floor(random()*48),phenomenon=Math.floor(random()*32);
    const structure=random()<.18?Math.floor(random()*24):null,showPhenomenon=random()<.32;
    const variant=Math.floor(random()*8),count=22+Math.floor(random()*(region>0?43:27));
    const rotation:[number,number,number]=[random()*6.28,random()*6.28,random()*6.28];
    const rocks=Array.from({length:count},(_,i)=>{
      const p=layoutPoint(layout,i/count,random),c=Math.cos(rotation[2]),s=Math.sin(rotation[2]);
      const x=p[0]*c-p[1]*s,y=p[0]*s+p[1]*c,cz=Math.cos(rotation[0]),sz=Math.sin(rotation[0]);
      const offset:Triple=[x*bound*.82,(y*cz-p[2]*sz)*bound*.82,(y*sz+p[2]*cz)*bound*.82];
      return {offset,radius:35+random()**2*115,rotation:[random()*6,random()*6,random()*6] as Triple,shade:.4+random()*.3,variant:i%6};
    });
    const anomaly:Triple=[center[0]+(random()-.5)*bound,center[1]+(random()-.5)*bound,center[2]+(random()-.5)*bound];
    const profile={...source,seed,signature:`space.${seed}.${objects}.${layout}`,variant,objects,layout,phenomenon,structure,
      backdrop:{...source.backdrop,density:.15+random()*.25,drift:.001+random()*.003}};
    return {id,index:0,label:OBJECTS[objects].name,origin:'procedural-gameplay',arrival:center,center,anomaly,rocks,bound,layout,objects,phenomenon,structure,profile,showPhenomenon};
  }
}
