import {test,expect,type Page} from '@playwright/test';
import * as THREE from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {SOLAR_SYSTEM,bodyArrival} from '../../src/world/systems/SystemDescriptor';
import {stellarAddress} from '../../src/world/space/StellarAddress';
import {worldPosition,type Triple} from '../../src/world/space/WorldPosition';
const evidence='docs/phases_archive/environment-2026-09-17';
const snapshot=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
const a=bodyArrival(SOLAR_SYSTEM.bodies[2]),b=bodyArrival(SOLAR_SYSTEM.bodies[3]);
const point=(t:number):Triple=>a.map((v,i)=>v+(b[i]-v)*t) as unknown as Triple;
const direction=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction).toArray();
async function enter(page:Page,position:Triple){
  await page.goto('/');
  await page.evaluate(save=>localStorage.setItem('universe:stellar-flight:v1:guest',JSON.stringify(save)),{
    version:1,address:stellarAddress(SOLAR_SYSTEM.anchor,worldPosition(undefined,position)),spectrum:SOLAR_SYSTEM.spectrum,rotation,visited:[]});
  await page.goto('/');await page.locator('#btn-start-game').click();
  await expect.poll(async()=>(await snapshot(page)).world.space.system.openSpace.detailed).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
}
test('empty interplanetary distances contain stable fields, structures and phenomena in the actual game',async({page},info)=>{
  test.setTimeout(150000);const low=info.project.name.includes('mobile'),issues:string[]=[];
  page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
  await page.addInitScript(q=>localStorage.setItem('universe_gfx_mode',q),low?'LOW':'HIGH');const samples=[];
  await mkdir(`${evidence}/${low?'LOW':'HIGH'}/open-space`,{recursive:true});
  for(const t of [.13,.38,.67,.88,.13]){
    await enter(page,point(t));const data=await snapshot(page),space=data.world.space.system.openSpace;
    expect(data.world.space.system.fullPlanets).toBe(0);expect(space.fields.length).toBeGreaterThan(8);expect(space.farObjects).toBeGreaterThan(250);
    expect(space.cached).toBeLessThanOrEqual(125);expect(space.detailed).toBeLessThanOrEqual(space.maxDetails);
    expect(space.active.some((field:any)=>field.instances>=22)).toBe(true);
    expect(data.world.ship.hp).toBeGreaterThan(0);samples.push(data);
    await page.screenshot({path:`${evidence}/${low?'LOW':'HIGH'}/open-space/${samples.length}.png`});
  }
  expect(samples[4].world.space.system.openSpace.fields).toEqual(samples[0].world.space.system.openSpace.fields);
  expect(samples[4].renderer.geometries).toBeLessThanOrEqual(samples[0].renderer.geometries+2);
  expect(samples[4].renderer.textures).toBeLessThanOrEqual(samples[0].renderer.textures+2);
  expect(issues).toEqual([]);await writeFile(`${evidence}/${info.project.name}-open-space.json`,JSON.stringify({samples,issues},null,2));
});

test('continuous flight streams new cells and floating origins with bounded resources',async({page},info)=>{
  test.setTimeout(90000);const low=info.project.name.includes('mobile'),issues:string[]=[];
  page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
  await page.addInitScript(q=>localStorage.setItem('universe_gfx_mode',q),low?'LOW':'HIGH');await enter(page,point(.38));
  await page.locator('body').evaluate(()=> (document.activeElement as HTMLElement)?.blur());
  const before=await snapshot(page),samples=[];
  if(low)await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('DualJoystickMove',{detail:{x:0,y:1}}));window.dispatchEvent(new CustomEvent('TouchBoostOn'));});
  else{await page.keyboard.down('w');await page.keyboard.down('Shift');}
  for(let i=0;i<12;i++){await page.waitForTimeout(2000);samples.push(await snapshot(page));}
  if(low)await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('DualJoystickMove',{detail:{x:0,y:0}}));window.dispatchEvent(new CustomEvent('TouchBoostOff'));});
  else{await page.keyboard.up('w');await page.keyboard.up('Shift');}
  const last=samples[samples.length-1];
  expect(last.world.space.origin.shifts).toBeGreaterThan(before.world.space.origin.shifts);
  expect(new Set(samples.map(s=>s.world.space.system.openSpace.cell)).size).toBeGreaterThan(1);
  expect(last.world.space.system.openSpace.disposed).toBeGreaterThan(0);
  for(const data of samples){const env=data.world.space.system.openSpace;expect(env.farObjects).toBeGreaterThan(250);expect(env.cached).toBeLessThanOrEqual(125);
    expect(env.detailed).toBeLessThanOrEqual(env.maxDetails);expect(data.world.ship.hp).toBeGreaterThan(0);expect(data.renderer.geometries).toBeLessThan(160);expect(data.renderer.textures).toBeLessThan(48);}
  expect(issues).toEqual([]);await writeFile(`${evidence}/${info.project.name}-space-flight.json`,JSON.stringify({before,samples,issues},null,2));
});
