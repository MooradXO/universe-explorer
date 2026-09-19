import { expect,it } from 'vitest';
import { orbitalSite } from '../../src/world/systems/OrbitalSite';
import { SOLAR_SYSTEM,bodyArrival } from '../../src/world/systems/SystemDescriptor';
import { cruiseStep } from '../../src/world/systems/CruiseMotion';
import type { Triple } from '../../src/world/space/WorldPosition';

it('keeps deterministic game debris inside its safety sphere and clear of arrival points',()=>{
  const original=JSON.stringify(SOLAR_SYSTEM);
  for(const body of SOLAR_SYSTEM.bodies){
    const site=orbitalSite(body);expect(site).toEqual(orbitalSite(body));
    expect(site.origin).toBe('procedural-gameplay');
    for(const rock of site.rocks)expect(Math.hypot(...rock.offset)+rock.radius).toBeLessThan(site.bound);
    expect(Math.hypot(...bodyArrival(body).map((v,i)=>v-site.center[i]))).toBeGreaterThan(site.bound+150);
  }
  expect(JSON.stringify(SOLAR_SYSTEM)).toBe(original);
  expect(orbitalSite(SOLAR_SYSTEM.bodies[2]).rocks).not.toEqual(orbitalSite(SOLAR_SYSTEM.bodies[3]).rocks);
});

it('keeps the Earth–Mars route usable with debris while stopping a course through a field',()=>{
  const fields=SOLAR_SYSTEM.bodies.map(body=>{const site=orbitalSite(body);return {position:site.center,radius:site.bound,margin:150};});
  const obstacles=[{position:[0,0,0] as Triple,radius:SOLAR_SYSTEM.starRadius},...SOLAR_SYSTEM.bodies,...fields];
  let current=bodyArrival(SOLAR_SYSTEM.bodies[2]),state='';const target=bodyArrival(SOLAR_SYSTEM.bodies[3]);
  for(let i=0;i<3600;i++){
    const step=cruiseStep(current,target,obstacles,1/60);current=step.position;state=step.state;
    for(const field of fields)expect(Math.hypot(...current.map((v,axis)=>v-field.position[axis]))).toBeGreaterThan(field.radius+field.margin);
    if(state!=='moving')break;
  }
  expect(state).toBe('arrived');
  const blocked=cruiseStep([0,0,0],[5000,0,0],[{position:[850,0,0],radius:800,margin:150}],.1);
  expect(blocked.state).toBe('obstructed');
});
