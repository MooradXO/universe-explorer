import type { SystemBody } from '../systems/SystemDescriptor';
import { createSeededRandom } from '../celestial/WorldSeed';
import { SOLAR_MOONS } from '../environments/SolarMoonData';
export function moonDescriptors(body: SystemBody) {
  if(body.id.startsWith('sol/'))return SOLAR_MOONS.filter(m=>m.parent===body.id).map(m=>({...m,origin:'catalogue' as const}));
  const p=body.environment,rng=createSeededRandom(p.seed+119),mode=p.moonOrbit;
  return Array.from({length:p.moonCount},(_,i)=>{
    const radius=body.radius*(.035+rng()*.095)*(p.editor?.moonSize??1),ringOuter=p.ring?.outer??1.8;
    let distance=body.radius*(ringOuter+1.4+i*(mode===7?3.2:1.2));
    let phase=rng()*Math.PI*2,inclination=.15;
    if(mode===1)phase=i*Math.PI+.3;
    if(mode===2)phase=i*.36+.5;
    if(mode===3){phase=i*2.09;distance*=Math.pow(1.3,i);}
    if(mode===4)inclination=.7;
    if(mode===5)inclination=Math.PI/2;
    if(mode===6)distance*=i%2?1.8:1;
    if(mode===8)inclination=2.8;
    if(mode===9){inclination=i*.35;phase=i*.6;}
    if(mode===10)inclination=i%2?.9:-.3;
    if(mode===11){distance=body.radius*(ringOuter+1.1+i*.7);inclination=p.ring?.tilt[0]??.3;}
    distance*=p.editor?.moonDistance??1;
    return {parent:body.id,id:`${body.id}/moon-${i+1}`,name:`Moon ${i+1} · generated`,radius,
      position:[Math.cos(phase)*distance,Math.sin(phase)*Math.sin(inclination)*distance,Math.sin(phase)*Math.cos(inclination)*distance],
      style:(p.moonStyle+i*7)%24,origin:'procedural' as const};
  });
}
