import {it,expect} from 'vitest';
import {buildSystem,SOLAR_SYSTEM,SOLAR_CATALOG_OBJECT} from '../../src/world/systems/SystemDescriptor';
import {SURFACES,LIBRARY_COUNTS} from '../../src/world/environments/EnvironmentLibrary';
import {orbitalZones,layoutPoint} from '../../src/world/systems/OrbitalSite';
import {objectGeometry,landmarkGeometry} from '../../src/world/environments/EnvironmentGeometry';
import {moonDescriptors} from '../../src/world/environments/PlanetMoons';
import {createSeededRandom} from '../../src/world/celestial/WorldSeed';
import {REVIEW_WORLDS} from '../../src/world/environments/EnvironmentReviewWorlds';
import {environmentFX} from '../../src/world/environments/EnvironmentFX';
import {ENVIRONMENT_FX_PRESETS} from '../../src/world/environments/EnvironmentFXPresets';

it('covers all authored recipes across catalogue seeds with stable identities and distinct neighboring environments',()=>{
 const surfaces=new Set<number>(),materials=new Set<number>(),backdrops=new Set<number>(),presets=new Set<string>();
 for(let i=10;i<360;i++){
  const source={...SOLAR_CATALOG_OBJECT,id:`athyg:4.0:${i}`},system=buildSystem(source);expect(buildSystem(source)).toEqual(system);
  const profiles=system.bodies.map(b=>b.environment);
  for(const key of ['surface','objects','layout','phenomenon'] as const)expect(new Set(profiles.map(p=>p[key])).size).toBe(4);
  for(const p of profiles){surfaces.add(p.surface);materials.add(p.material);backdrops.add(p.backdrop.shape);expect(p.zones).toBeGreaterThanOrEqual(2);expect(p.zones).toBeLessThanOrEqual(6);}
  for(const body of system.bodies)for(const zone of orbitalZones(body)){const fx=environmentFX(zone);if(fx)presets.add(fx.id);}
 }
 expect(surfaces.size).toBe(64);expect(materials.size).toBe(128);expect(backdrops.size).toBe(11);expect(presets.size).toBe(ENVIRONMENT_FX_PRESETS.length);
 expect(SOLAR_SYSTEM.bodies[2].environment.backdrop).toMatchObject({shape:1,warm:'#ad6256',cool:'#31768c'});
 expect(LIBRARY_COUNTS).toMatchObject({surfaces:64,clouds:32,atmospheres:24,rings:32,objects:32,layouts:48,structures:24,phenomena:32});
});

it('keeps zone geometry inside bounds and the 32-world route clear at its arrival points',()=>{
 expect(REVIEW_WORLDS.length).toBe(32);
 for(const {body} of REVIEW_WORLDS){const zones=orbitalZones(body);expect(orbitalZones(body)).toEqual(zones);
  for(const zone of zones){
   for(const rock of zone.rocks)expect(Math.hypot(...rock.offset)+rock.radius).toBeLessThan(zone.bound);
   for(const other of zones)expect(Math.hypot(...zone.arrival.map((v,i)=>v-other.center[i]))).toBeGreaterThan(other.bound+150);
   expect(Math.hypot(...zone.arrival.map((v,i)=>v-body.position[i]))).toBeGreaterThan(body.radius+3000);
   const main=zones[0].arrival,offset=zone.center.map((v,i)=>v-main[i]);
   for(const dir of body.environment.approachDirections){const along=Math.max(0,dir.reduce((sum,v,i)=>sum+v*offset[i],0));expect(Math.hypot(...offset.map((v,i)=>v-dir[i]*along))).toBeGreaterThan(zone.bound+150);}
  }
 }
});

it('uses distinct bounded geometry for all 192 object forms and 48 layouts',()=>{
 const geometries=new Set<string>(),layouts=new Set<string>(),owners=new Map<string,string>(),duplicates:string[]=[];
 for(let i=0;i<32;i++)for(let v=0;v<6;v++){
  const g=objectGeometry(i,v,false),array=g.getAttribute('position').array;
  expect(g.boundingSphere!.radius).toBeLessThanOrEqual(1.001);
  const fingerprint=Array.from(array).map(v=>v.toFixed(4)).join(',');if(owners.has(fingerprint))duplicates.push(`${owners.get(fingerprint)} = ${i}/${v}`);owners.set(fingerprint,`${i}/${v}`);
  geometries.add(fingerprint);g.dispose();
 }
 expect(duplicates).toEqual([]);expect(geometries.size).toBe(192);
 for(let i=0;i<48;i++){const random=createSeededRandom(123);layouts.add(JSON.stringify(Array.from({length:40},(_,j)=>layoutPoint(i,j/40,random))));}
 expect(layouts.size).toBe(48);
 const graphs=new Set<string>();for(let i=0;i<24;i++)for(let v=0;v<8;v++)graphs.add(JSON.stringify(landmarkGeometry(i,v)));
 expect(graphs.size).toBe(192);
});

it('preserves sourced moon scale and does not place procedural moons inside their parent',()=>{
 const moon=moonDescriptors(SOLAR_SYSTEM.bodies[2])[0];expect(moon.radius).toBe(173.74);expect(Math.hypot(...moon.position)).toBeGreaterThan(35000);expect(Math.hypot(...moon.position)).toBeLessThan(41000);
 for(const {body} of REVIEW_WORLDS)for(const moon of moonDescriptors(body))expect(Math.hypot(...moon.position)).toBeGreaterThan(body.radius+moon.radius);
});

it('distinguishes major geological classes between neighboring small worlds',()=>{
 for(let i=10;i<80;i++){const system=buildSystem({...SOLAR_CATALOG_OBJECT,id:`athyg:4.0:${i}`});
  const small=system.bodies.filter(b=>b.radius<1800);expect(new Set(small.map(b=>SURFACES[b.environment.surface].group)).size).toBe(small.length);
 }
});
