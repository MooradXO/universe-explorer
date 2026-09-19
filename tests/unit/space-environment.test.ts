import {it,expect} from 'vitest';
import {SpaceEnvironment,SPACE_ENVIRONMENT,environmentCell} from '../../src/world/environments/SpaceEnvironment';
import {SOLAR_SYSTEM,bodyArrival} from '../../src/world/systems/SystemDescriptor';
import {neighborhood,type Triple} from '../../src/world/space/WorldPosition';
import {cruiseStep} from '../../src/world/systems/CruiseMotion';

it('populates long interplanetary routes with persistent fields on both sides of the clear cruise corridor',()=>{
  const generator=new SpaceEnvironment(SOLAR_SYSTEM),a=bodyArrival(SOLAR_SYSTEM.bodies[2]),b=bodyArrival(SOLAR_SYSTEM.bodies[3]);
  const objects=new Set<number>(),layouts=new Set<number>(),phenomena=new Set<number>();let structures=0;
  for(let step=1;step<30;step++){
    const point=a.map((v,i)=>v+(b[i]-v)*step/30) as unknown as Triple;
    const fields=neighborhood(environmentCell(point),2).map(cell=>generator.field(cell)).filter(field=>field!==null);
    const nearby=fields.filter(field=>Math.hypot(...field.center.map((v,i)=>v-point[i]))<SPACE_ENVIRONMENT.farRange);
    expect(nearby.length).toBeGreaterThan(8);
    for(const field of fields){
      expect(generator.clear(field.center,field.bound)).toBe(true);
      objects.add(field.objects);layouts.add(field.layout);if(field.showPhenomenon)phenomena.add(field.phenomenon);if(field.structure!==null)structures++;
      for(const rock of field.rocks)expect(Math.hypot(...rock.offset)+rock.radius).toBeLessThan(field.bound);
    }
  }
  expect(objects.size).toBe(32);expect(layouts.size).toBe(48);expect(phenomena.size).toBe(32);expect(structures).toBeGreaterThan(100);
});

it('keeps negative cell boundaries, load order and returning to distant addresses deterministic',()=>{
  expect(environmentCell([-.01,-9000,-9000.01])).toEqual([-1,-1,-2]);
  const cells=neighborhood([-1337,857,-74],2),generator=new SpaceEnvironment(SOLAR_SYSTEM);
  const first=cells.map(cell=>generator.field(cell)),second=new SpaceEnvironment(SOLAR_SYSTEM);
  const reversed=[...cells].reverse().map(cell=>second.field(cell)).reverse();
  expect(reversed).toEqual(first);expect(cells.map(cell=>generator.field(cell))).toEqual(first);
});

it('excludes the star, planets and arrival areas without relocating those bodies',()=>{
  const generator=new SpaceEnvironment(SOLAR_SYSTEM),before=JSON.stringify(SOLAR_SYSTEM);
  expect(generator.clear([0,0,0],1800)).toBe(false);
  for(const body of SOLAR_SYSTEM.bodies){expect(generator.clear(body.position,1800)).toBe(false);expect(generator.clear(bodyArrival(body),1800)).toBe(false);}
  for(const cell of neighborhood([188,-922,0],2))generator.field(cell);
  expect(JSON.stringify(SOLAR_SYSTEM)).toBe(before);
});

it('keeps the established cruise speed beside scenery while retaining swept obstacle checks',()=>{
  const free=cruiseStep([0,0,0],[0,0,-1e6],[],.1);
  const beside=cruiseStep([0,0,0],[0,0,-1e6],[{position:[5000,0,-3000],radius:1000,margin:150,speedLimit:false}],.1);
  expect(beside).toEqual(free);
  const blocked=cruiseStep([0,0,0],[0,0,-1e6],[{position:[0,0,-3000],radius:1000,margin:150,speedLimit:false}],.1);
  expect(blocked.state).toBe('obstructed');
});
