import type { SystemDescriptor } from '../systems/SystemDescriptor';
import { orbitalZones, type OrbitalZone } from '../systems/OrbitalSite';
import { systemObstacles } from './SystemPhysics';
import { hashString } from '../celestial/WorldSeed';
import { SpaceEnvironment, environmentCell } from '../environments/SpaceEnvironment';
import type { Triple } from '../space/WorldPosition';
export type SiteKind='station'|'wreck'|'resources'|'anomaly';
export interface ExplorationSite { id:string; bodyId:string; zoneId:string; kind:SiteKind; name:string; description:string; objective:string; position:Triple; approach:Triple; scanRadius:number; }
const descriptions={
  station:['Listening outpost','A remote instrument array studies the parent world.','Record the array and its surrounding orbital field.'],
  wreck:['Broken assembly','Separated modules trace the remains of an abandoned installation.','Document the debris pattern from the clear approach.'],
  resources:['Exposed deposits','A fractured field exposes contrasting ice and mineral layers.','Survey the exposed composition; no extraction equipment is required.'],
  anomaly:['Orbital anomaly','A local luminous phenomenon threads through the orbital field.','Record the structure and luminous pattern from the observation point.'],
} as const;
export function siteIdentity(zone:OrbitalZone){
  const seed=hashString(`${zone.id}:purpose:v1`),kind:SiteKind=zone.structure!==null?(seed%2?'station':'wreck'):(seed%2?'resources':'anomaly');
  return {kind,name:descriptions[kind][0],description:descriptions[kind][1],objective:descriptions[kind][2]};
}
const cache=new WeakMap<SystemDescriptor,readonly ExplorationSite[]>();
/** Observation points are selected around existing fields, without adding or moving colliders. */
export function explorationSites(system:SystemDescriptor):readonly ExplorationSite[]{
  const old=cache.get(system);if(old)return old;
  const obstacles=systemObstacles(system),space=new SpaceEnvironment(system),sites:ExplorationSite[]=[];
  const clear=(p:Triple)=>{
    if(obstacles.some(o=>Math.hypot(...p.map((v,i)=>v-o.position[i]))<o.radius+650))return false;
    const c=environmentCell(p);
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const field=space.field([c[0]+x,c[1]+y,c[2]+z]);if(field&&Math.hypot(...p.map((v,i)=>v-field.center[i]))<field.bound+650)return false;
    }return true;
  };
  for(const body of system.bodies)for(const zone of orbitalZones(body)){
    let approach:Triple|null=clear(zone.arrival)?zone.arrival:null;
    for(let i=0;!approach&&i<32;i++){
      const angle=i*2.39996323,vertical=Math.sin(i*1.7)*.6,r=zone.bound+2200+i*30;
      const p=zone.center.map((v,a)=>v+[Math.cos(angle)*r,vertical*r,Math.sin(angle)*r][a]) as unknown as Triple;if(clear(p))approach=p;
    }
    if(!approach)continue;
    sites.push({id:`${zone.id}/survey-v1`,bodyId:body.id,zoneId:zone.id,...siteIdentity(zone),position:zone.center,approach,scanRadius:700});
  }
  cache.set(system,sites);return sites;
}
