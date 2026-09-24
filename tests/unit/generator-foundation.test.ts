import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REVIEW_SYSTEMS } from '../../src/world/environments/EnvironmentReviewWorlds';
import { orbitalZones } from '../../src/world/systems/OrbitalSite';
import { SpaceEnvironment } from '../../src/world/environments/SpaceEnvironment';
import { compatibleGenerator, GENERATOR } from '../../src/world/generation/GeneratorContract';
import { physicsFingerprint, systemObstacles } from '../../src/world/generation/SystemPhysics';
import { Simulation } from '../../server/Simulation';
import { planetModel, starModel, coherentAppearance } from '../../src/world/generation/WorldModel';
import { buildSystem, SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';
import { SURFACES } from '../../src/world/environments/EnvironmentLibrary';
import { createSurfaceBake, bakeSurfaceRows } from '../../src/world/generation/SurfaceBake';

it('bakes deterministic multiscale maps with closed seams, constant poles and independent row chunks',()=>{
  for(const kind of ['rock','ice','gas','ocean','mineral','lava']){
    const recipe={seed:123,kind,geography:5,activity:.7,ice:.4},all=createSurfaceBake(64),chunks=createSurfaceBake(64);
    bakeSurfaceRows(recipe,all,0,all.height);for(let r=0;r<chunks.height;r+=3)bakeSurfaceRows(recipe,chunks,r,r+3);
    expect(chunks.pixels).toEqual(all.pixels);
    for(let y=0;y<all.height;y++){const row=y*all.width*4;expect(all.pixels.slice(row,row+4)).toEqual(all.pixels.slice(row+(all.width-1)*4,row+all.width*4));}
    for(const y of [0,all.height-1])for(let x=1;x<all.width;x++)expect(all.pixels.slice((y*all.width+x)*4,(y*all.width+x+1)*4)).toEqual(all.pixels.slice(y*all.width*4,y*all.width*4+4));
    expect(new Set(all.pixels).size).toBeGreaterThan(30);
  }
});

it('links fictional climate to stellar energy and distance without mutating physical profiles',()=>{
  const star=starModel('G2 V');
  expect(planetModel('sample',500,.1,star).temperatureK).toBeGreaterThan(planetModel('sample',500,10,star).temperatureK);
  expect(planetModel('sample',500,1,star).temperatureK).toBeGreaterThan(planetModel('sample',500,1,starModel('M5 V')).temperatureK);
  for(let i=0;i<64;i++){
    const s=buildSystem({...SOLAR_CATALOG_OBJECT,id:`athyg:4.0:${900000+i}`,spectrum:['G2','M5','K2','F3'][i%4]});
    expect(s).toEqual(buildSystem({...SOLAR_CATALOG_OBJECT,id:`athyg:4.0:${900000+i}`,spectrum:['G2','M5','K2','F3'][i%4]}));
    for(const b of s.bodies){
      expect(SURFACES[b.appearance.surface].kind).toBe(b.model.composition);
      expect(b.model.temperatureK).toBeGreaterThanOrEqual(30);
      const prior=JSON.stringify(b.environment);coherentAppearance(b.environment,b.model);expect(JSON.stringify(b.environment)).toBe(prior);
      if(b.model.composition==='ice')expect(b.model.polarIce).toBe(1);
    }
  }
});

it('preserves original positions, physical profiles, zones and open-space fields in all 32 reference worlds',()=>{
  // Display labels may be translated without changing collision or generation data.
  // These hashes were checked against the original snapshots with their legacy labels.
  const baseline=JSON.parse(readFileSync('tests/fixtures/physics-v1.json','utf8'));
  for(const s of REVIEW_SYSTEMS){
    const data={star:s.starRadius,bodies:s.bodies.map(b=>({id:b.id,position:b.position,radius:b.radius,orbit:b.orbit,environment:b.environment,zones:orbitalZones(b)})),fields:[[12,0,4],[20,2,7],[-12,1,15]].map(c=>new SpaceEnvironment(s).field(c as [number,number,number]))};
    expect(createHash('sha256').update(JSON.stringify(data,(key,value)=>key==='label'?undefined:value)).digest('hex')).toBe(baseline.find((b:{id:string})=>b.id===s.anchor.catalogId).hash);
    expect(physicsFingerprint(s)).toBe(physicsFingerprint(structuredClone(s)));
  }
});
it('accepts legacy physical worlds, rejects incompatible metadata and shares server/offline collision data',()=>{
  expect(compatibleGenerator(undefined)).toBe(true);expect(compatibleGenerator(GENERATOR)).toBe(true);
  expect(compatibleGenerator({...GENERATOR,appearance:99})).toBe(true);
  expect(compatibleGenerator({...GENERATOR,physics:2})).toBe(false);expect(compatibleGenerator(null)).toBe(false);
  const s=REVIEW_SYSTEMS[0], server=new Simulation(()=>null);
  expect(server.systems.get(s.anchor.catalogId)?.obstacles).toEqual(systemObstacles(s));
});
