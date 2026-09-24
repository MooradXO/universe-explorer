import {expect,it} from 'vitest';
import {explorationSites} from '../../src/world/generation/ExplorationSites';
import {SurveyJournal} from '../../src/world/generation/SurveyJournal';
import {REVIEW_SYSTEMS} from '../../src/world/environments/EnvironmentReviewWorlds';
import {systemObstacles} from '../../src/world/generation/SystemPhysics';
import {CruiseNavigator} from '../../src/world/systems/CruiseNavigator';
import {bodyArrival} from '../../src/world/systems/SystemDescriptor';
import {SpaceEnvironment,environmentCell} from '../../src/world/environments/SpaceEnvironment';
import {Simulation} from '../../server/Simulation';
it('creates all four site purposes and safe approaches outside original obstacles and streamed fields',()=>{
  const kinds=new Set();
  for(const system of REVIEW_SYSTEMS){
    const sites=explorationSites(system);expect(sites.length).toBeGreaterThan(0);expect(sites).toEqual(explorationSites(structuredClone(system)));
    for(const site of sites){kinds.add(site.kind);
      for(const o of systemObstacles(system))expect(Math.hypot(...site.approach.map((v,i)=>v-o.position[i]))).toBeGreaterThanOrEqual(o.radius+650);
      const c=environmentCell(site.approach),space=new SpaceEnvironment(system);
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const field=space.field([c[0]+x,c[1]+y,c[2]+z]);if(field)expect(Math.hypot(...site.approach.map((v,i)=>v-field.center[i]))).toBeGreaterThanOrEqual(field.bound+650);}
    }
  }expect([...kinds].sort()).toEqual(['anomaly','resources','station','wreck']);
});
it('cruises to local observation sites and accepts the same destinations on the authority',()=>{
  const system=REVIEW_SYSTEMS[0],simulation=new Simulation(()=>null),pilot=simulation.add('test','Tester');
  for(const body of system.bodies){const site=explorationSites(system).find(s=>s.bodyId===body.id)!;const nav=new CruiseNavigator();let p=bodyArrival(body),state='moving';
    for(let i=0;i<3600&&state==='moving';i++){const step=nav.step(p,site.approach,systemObstacles(system),1/60);p=step.position;state=step.state;}
    expect(state).toBe('arrived');expect(p).toEqual(site.approach);pilot.position.fromArray(bodyArrival(body));expect(simulation.action(pilot.id,'cruise',{target:site.id,epoch:pilot.epoch})).toBe(true);
  }
});
it('records only nearby surveys, deduplicates them, caps history and validates persisted input',()=>{
  const system=REVIEW_SYSTEMS[0],site=explorationSites(system)[0],journal=new SurveyJournal();
  expect(journal.scan(site,system.anchor.catalogId,[0,0,0])).toBe(false);expect(journal.scan(site,system.anchor.catalogId,site.approach,42)).toBe(true);
  journal.scan(site,system.anchor.catalogId,site.approach,99);expect(journal.snapshot()).toHaveLength(1);expect(journal.snapshot()[0].at).toBe(42);
  expect(new SurveyJournal(journal.serialize()).has(site.id)).toBe(true);expect(new SurveyJournal('{bad').snapshot()).toEqual([]);
  expect(new SurveyJournal(JSON.stringify({version:1,records:[{id:4,systemId:null,at:'x'}]})).snapshot()).toEqual([]);
  for(let i=0;i<300;i++)journal.scan({...site,id:`test/${i}`},system.anchor.catalogId,site.approach,100+i);expect(journal.snapshot()).toHaveLength(256);
});
