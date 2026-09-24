import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {SOLAR_SYSTEM,bodyArrival} from '../../src/world/systems/SystemDescriptor';
import {explorationSites} from '../../src/world/generation/ExplorationSites';
import {stellarAddress} from '../../src/world/space/StellarAddress';
import {worldPosition} from '../../src/world/space/WorldPosition';
const root='docs/phases_archive/generator-foundation-2026-09-24/survey';await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),results:unknown[]=[],errors:string[]=[];
try{
  for(const quality of ['HIGH','LOW']){
    const body=SOLAR_SYSTEM.bodies[2],site=explorationSites(SOLAR_SYSTEM).find(s=>s.bodyId===body.id)!;
    const page=await browser.newPage({viewport:quality==='HIGH'?{width:1440,height:810}:{width:844,height:390},hasTouch:quality==='LOW',isMobile:quality==='LOW'});
    page.on('pageerror',e=>errors.push(e.message));
    const save={version:1,address:stellarAddress(SOLAR_SYSTEM.anchor,worldPosition(undefined,bodyArrival(body))),spectrum:SOLAR_SYSTEM.spectrum,rotation:[0,0,0,1],visited:[]};
    await page.addInitScript(({quality,save})=>{if(!sessionStorage.getItem('seeded-survey')){localStorage.setItem('universe_gfx_mode',quality);localStorage.setItem('universe:stellar-flight:v1:guest',JSON.stringify(save));sessionStorage.setItem('seeded-survey','yes');}}, {quality,save});
    await page.goto('http://127.0.0.1:3019/');await page.locator('#btn-start-game').click();await page.waitForTimeout(1000);
    const snap=()=>page.evaluate(()=>(window as any).__UNIVERSE_DEBUG__.snapshot());
    await page.locator('#btn-star-map').click();await page.locator('#star-map-search').fill('Sol');await page.getByRole('button',{name:'Select Sol',exact:true}).click();await page.getByRole('button',{name:'Inspect planet Earth',exact:true}).click();
    await page.locator('.star-map__planet-detail details').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.screenshot({path:`${root}/${quality}-sites.png`});
    await page.getByRole('button',{name:`Track ${site.name}`,exact:true}).first().click();assert.equal((await snap()).world.travel.selected,site.id);
    await page.getByRole('button',{name:'CRUISE',exact:true}).click();
    await page.waitForFunction(()=>(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel.status.startsWith('Destination reached'),{},{timeout:45000});
    let state=await snap();assert.equal(state.flightInputBlocked,false);
    await page.getByRole('button',{name:'Flight details',exact:true}).click();await page.getByRole('button',{name:'SURVEY SITE',exact:true}).click();await page.waitForTimeout(200);state=await snap();assert.ok(state.world.travel.journal.some((s:{id:string})=>s.id===site.id));
    await page.screenshot({path:`${root}/${quality}-recorded.png`});await page.keyboard.press('Escape');assert.equal((await snap()).flightInputBlocked,false);
    await page.reload();await page.locator('#btn-start-game').click();await page.waitForTimeout(700);const restored=await snap();assert.ok(restored.world.travel.journal.some((s:{id:string})=>s.id===site.id));assert.equal(await page.locator('.object-window').count(),0);
    results.push({quality,site,state,restored});await page.close();
  }assert.deepEqual(errors,[]);
}finally{await writeFile(`${root}/evidence.json`,JSON.stringify({results,errors},null,2));await browser.close();}
console.log(JSON.stringify({cases:results.length,errors}));
