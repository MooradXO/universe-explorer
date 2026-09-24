import type { Triple } from '../space/WorldPosition';
import { bodyArrival, type SystemBody } from './SystemDescriptor';
import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import { LAYOUTS, OBJECTS, PHENOMENA } from '../environments/EnvironmentLibrary';

export function layoutPoint(recipe:number,t:number,random:()=>number):Triple {
  const {shape,pattern}=LAYOUTS[recipe],a=t*Math.PI*2,j=()=>random()-.5;
  let x=0,y=0,z=0;
  switch(shape){
    case 0:x=Math.cos(a*.7)*.75;y=j()*.18;z=Math.sin(a*.7)*.65;break;
    case 1:x=(t<.5?-.48:.48)+j()*.35;y=j()*.35;z=j()*.4;break;
    case 2:x=j()*.9;y=j()*1.6;z=j()*.12;break;
    case 3:x=Math.cos(a)*.65;y=Math.sin(a*3.)*.1;z=Math.sin(a)*.65;break;
    case 4:x=Math.cos(a*2)*(.2+t*.65);y=(t-.5)*.45;z=Math.sin(a*2)*(.2+t*.65);break;
    case 5:x=(t-.5)*1.65;y=Math.sin(a)*.15+j()*.12;z=j()*.25;break;
    case 6:{const v=j()*2,r=Math.sqrt(1-v*v)*.68;x=Math.cos(a)*r;y=v*.68;z=Math.sin(a)*r;break;}
    case 7:x=j()*1.6;y=j()*1.25;z=j()*1.4;break;
    case 8:{const branch=Math.floor(t*3),u=(t*3)%1;x=Math.cos(branch*2.094)*u*.8;y=Math.sin(branch*2.094)*u*.7;z=j()*.2;break;}
    case 9:x=Math.cos(a*3)*(.1+t*.7);y=(t-.5)*1.2;z=Math.sin(a*3)*(.1+t*.7);break;
    case 10:x=(t-.5)*1.6;y=Math.sin(t*12.)*.2;z=j()*1.2;break;
    case 11:{const island=Math.floor(t*5);x=(island-2)*.32+j()*.14;y=Math.sin(island*1.2)*.35+j()*.14;z=j()*.23;break;}
  }
  if(pattern===1){x+=Math.sign(x)*.15;y+=Math.sign(y)*.12;}
  if(pattern===2){y+=(Math.floor(t*3)-1)*.28;z*=.7;}
  if(pattern===3){const c=Math.cos(t*5.),s=Math.sin(t*5.),old=x;x=x*c-y*s;y=old*s+y*c;z+=Math.sin(t*13.)*.22;}
  const length=Math.hypot(x,y,z),scale=length>.86?.86/length:1;
  return [x*scale,y*scale,z*scale];
}

/** Stable game zones; scientific body coordinates and the orbit random stream are untouched. */
export function orbitalZones(body:SystemBody){
  const profile=body.environment,main=bodyArrival(body);
  const arrivals=Array.from({length:profile.zones},(_,index):Triple=>{
    const angle=index*2.39996323+(profile.layout/48)*Math.PI*2,R=body.radius*3+6000;
    const y=Math.sin(index*2.1+profile.variant)*.65,radial=Math.sqrt(1-y*y);
    // Existing artistic orbital sites keep their established radius; closer cruise
    // viewpoints must not drag collision fields into the planet surface.
    return index===0?[body.position[0],body.position[1],body.position[2]+R]:[body.position[0]+Math.cos(angle)*R*radial,body.position[1]+y*R,body.position[2]+Math.sin(angle)*R*radial];
  });
  return arrivals.map((arrival,index)=>{
    const random=createSeededRandom(hashString(`${body.id}:orbital-art:v2:${index}`));
    let center:Triple=arrival,theta=random()*Math.PI*2;
    for(let attempt=0;attempt<48;attempt++){
      const radial=2400+random()*1800;
      const offset:Triple=body.id==='sol/earth'&&index===0&&attempt===0?[1800,-750,-2500]:[Math.cos(theta)*radial,Math.sin(theta)*radial,-1800-random()*1600];
      center=arrival.map((v,i)=>v+offset[i]) as unknown as Triple;
      const fromMain=center.map((v,i)=>v-main[i]);
      const clearRoutes=profile.approachDirections.every(dir=>{const along=Math.max(0,dir.reduce((sum,v,i)=>sum+v*fromMain[i],0));return Math.hypot(...fromMain.map((v,i)=>v-dir[i]*along))>1250;});
      if(clearRoutes&&arrivals.every(point=>Math.hypot(...center.map((v,i)=>v-point[i]))>1250))break;
      theta+=2.39996323;
    }
    const layout=(profile.layout+index*7)%48,objects=(profile.objects+index*5)%32,phenomenon=(profile.phenomenon+index*9)%32;
    const count=LAYOUTS[layout].shape===7?14:26+Math.floor(random()*29),bound=1000;
    const rocks=Array.from({length:count},(_,i)=>{
      const offset=layoutPoint(layout,i/count,random).map(v=>v*880) as unknown as Triple;
      const radius=LAYOUTS[layout].shape===7?65+random()*100:20+random()**2*74;
      return {offset,radius,rotation:[random()*6,random()*6,random()*6] as Triple,shade:.37+random()*.26,variant:i%6};
    });
    const a=theta+1.4+random()*1.6,r=1000+random()*1600,anomalyOffset=[Math.cos(a)*r,Math.sin(a)*r,-1000-random()*1800];
    const anomaly=arrival.map((value,i)=>value+anomalyOffset[i]) as unknown as Triple;
    const structure=profile.structure===null?null:(profile.structure+index*5)%24;
    return {id:`${body.id}/zone-${index}`,index,label:`${index+1} · ${index%2===0?OBJECTS[objects].name:PHENOMENA[phenomenon].name}`,
      origin:'procedural-gameplay' as const,arrival,center,anomaly,rocks,bound,layout,objects,phenomenon,structure,profile,showPhenomenon:true};
  });
}
export type OrbitalZone=ReturnType<typeof orbitalZones>[number];
export function orbitalSite(body:SystemBody){return orbitalZones(body)[0];}
