import { CruiseNavigator, cruiseDeparture } from '../../src/world/systems/CruiseNavigator';
import { SOLAR_SYSTEM, bodyArrival, systemArrival } from '../../src/world/systems/SystemDescriptor';
import { orbitalZones } from '../../src/world/systems/OrbitalSite';
import { SpaceEnvironment, environmentCell } from '../../src/world/environments/SpaceEnvironment';
import type { Triple } from '../../src/world/space/WorldPosition';
const system = SOLAR_SYSTEM;
const obstacles = [{position: [0,0,0] as Triple, radius: system.starRadius}, ...system.bodies.map(b=>({position:b.position,radius:b.radius})),
  ...system.bodies.flatMap(b=>orbitalZones(b).map(s=>({position:s.center,radius:s.bound,margin:150})))];
const source = new SpaceEnvironment(system), cache = new Map<string, any[]>();
for (const body of system.bodies) {
  let position = systemArrival(system).map((v,i)=>v+(i===1?100:i===2?300:0)) as unknown as Triple;
  const target = bodyArrival(body), nav = new CruiseNavigator(); nav.reset(cruiseDeparture(position,target,system));
  let n=0, state='moving', detours=0;
  for (;n<12000 && state==='moving';n++) {
    const cell=environmentCell(position), key=cell.join(',');
    if (!cache.has(key)) {
      const local=[];
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
        const f=source.field([cell[0]+x,cell[1]+y,cell[2]+z]);
        if(f)local.push({position:f.center,radius:f.bound,margin:150,speedLimit:false});
      }
      cache.set(key,local);
    }
    const step=nav.step(position,target,[...obstacles,...cache.get(key)!],.02);
    position=step.position;state=step.state;if(step.avoiding)detours++;
  }
  console.log(JSON.stringify({body:body.name,seconds:n*.02,state,detours,remaining:Math.hypot(...position.map((v,i)=>v-target[i])),position,waypoints:(nav as any).waypoints}));
}
