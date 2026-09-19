import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {REVIEW_WORLDS} from '../../src/world/environments/EnvironmentReviewWorlds';
import {stellarAddress} from '../../src/world/space/StellarAddress';
import {worldPosition} from '../../src/world/space/WorldPosition';
import {bodyArrival} from '../../src/world/systems/SystemDescriptor';
const evidence=join('docs','phases_archive','environment-2026-09-17');
const review=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify((window as any).__UNIVERSE_ENVIRONMENTS__.snapshot())));
const game=(page:Page)=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));

test('all 64 surface morphologies render in the production planet material',async({page},info)=>{
 test.setTimeout(120000);const issues:string[]=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
 const quality=info.project.name.includes('mobile')?'LOW':'HIGH';await page.goto(`/environments.html?quality=${quality}&world=9`);await page.locator('.catalog summary').click();
 const samples=[];await mkdir(join(evidence,quality,'surfaces'),{recursive:true});
 for(let i=0;i<64;i++){await page.getByLabel('Рецепт',{exact:true}).selectOption(String(i));await expect.poll(async()=>(await review(page)).profile.surface).toBe(i);await page.waitForTimeout(100);
  await page.locator('#stage').screenshot({path:join(evidence,quality,'surfaces',`${i.toString().padStart(2,'0')}.png`)});samples.push(await review(page));}
 await writeFile(join(evidence,`${quality}-surfaces.json`),JSON.stringify({samples,issues},null,2));expect(issues).toEqual([]);
});

test('32 game profiles render planets, zones and changing glows without shader errors or resource growth',async({page},info)=>{
 test.setTimeout(240000);const issues:string[]=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
 const quality=info.project.name.includes('mobile')?'LOW':'HIGH';await mkdir(join(evidence,quality),{recursive:true});await page.goto(`/environments.html?quality=${quality}`);
 await expect(page.locator('#stage canvas')).toBeVisible();const samples=[];
 for(let i=0;i<32;i++){
  await page.getByLabel('Мир',{exact:true}).selectOption(String(i));await page.getByLabel('Ракурс').selectOption('planet');
  await expect.poll(async()=>(await review(page)).world).toBe(i);await page.waitForTimeout(180);
  await page.locator('#stage').screenshot({path:join(evidence,quality,`planet-${i.toString().padStart(2,'0')}.png`)});
  await page.getByLabel('Ракурс').selectOption('zone');await page.waitForTimeout(250);
  await page.locator('#stage').screenshot({path:join(evidence,quality,`zone-${i.toString().padStart(2,'0')}.png`)});samples.push(await review(page));
 }
 const repeats=[];for(let i=0;i<3;i++){await page.getByLabel('Мир',{exact:true}).selectOption('2');await page.waitForTimeout(250);repeats.push(await review(page));await page.getByLabel('Мир',{exact:true}).selectOption('8');await page.waitForTimeout(250);}
 expect(repeats[2].geometries).toBeLessThanOrEqual(repeats[0].geometries);expect(repeats[2].textures).toBeLessThanOrEqual(repeats[0].textures);
 expect(new Set(samples.map(s=>s.profile.signature)).size).toBe(32);expect(new Set(samples.map(s=>s.profile.backdrop.shape)).size).toBeGreaterThan(7);
 await writeFile(join(evidence,`${quality}-review.json`),JSON.stringify({samples,repeats,issues},null,2));expect(issues).toEqual([]);
});

test('curated 66 Epic presets create visible bounded particles and release each effect',async({page},info)=>{
 test.setTimeout(240000);const issues:string[]=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
 const quality=info.project.name.includes('mobile')?'LOW':'HIGH';await page.goto(`/environments.html?quality=${quality}`);await page.locator('.catalog summary').click();await page.getByLabel('Категория рецептов').selectOption('fx');
 const options=await page.getByLabel('Рецепт',{exact:true}).locator('option').allTextContents();expect(options.length).toBe(66);const samples=[];
 await mkdir(join(evidence,quality,'fx'),{recursive:true});
 for(let i=0;i<options.length;i++){
  await page.getByLabel('Рецепт',{exact:true}).selectOption(String(i));await expect.poll(async()=>(await review(page)).soloFX?.particles??0,{timeout:10000}).toBeGreaterThan(0);await page.waitForTimeout(250);
  const data=await review(page);expect(data.soloFX.particles).toBeLessThanOrEqual(quality==='LOW'?260:700);samples.push({name:options[i],...data});
  await page.locator('#stage').screenshot({path:join(evidence,quality,'fx',`${i.toString().padStart(2,'0')}.png`)});
 }
 await writeFile(join(evidence,`${quality}-fx.json`),JSON.stringify({samples,issues},null,2));expect(issues).toEqual([]);
});

test('all 32 worlds are installed in the actual game and preserve their physical addresses',async({page},info)=>{
 test.setTimeout(300000);const issues:string[]=[];page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))issues.push(m.text());});
 const quality=info.project.name.includes('mobile')?'LOW':'HIGH';await page.goto('/');await page.evaluate(q=>localStorage.setItem('universe_gfx_mode',q),quality);const samples=[];await mkdir(join(evidence,quality,'game'),{recursive:true});
 for(let i=0;i<32;i++){
  const {body,system}=REVIEW_WORLDS[i],save={version:1,address:stellarAddress(system.anchor,worldPosition(undefined,bodyArrival(body))),spectrum:system.spectrum,rotation:[0,0,0,1],visited:[]};
  await page.evaluate(value=>localStorage.setItem('universe:stellar-flight:v1:guest',JSON.stringify(value)),save);
  await page.goto('/');await page.locator('#btn-start-game').click();await expect(page.locator('.system-navigation')).toBeVisible();
  await expect.poll(async()=>(await game(page)).world.space.system.fullPlanets).toBeGreaterThan(0);
  await expect.poll(async()=>(await game(page)).world.space.system.backdrop?.shape).toBe(body.environment.backdrop.shape);
  await page.waitForTimeout(300);const data=await game(page);const actual=data.world.space.system.bodies.find((b:any)=>b.id===body.id);
  expect(actual.radius).toBe(body.radius);actual.position.forEach((v:number,axis:number)=>expect(v).toBeCloseTo(body.position[axis],4));expect(actual.environment).toEqual(body.environment);
  expect(data.world.space.system.zones.length).toBeGreaterThan(0);samples.push({index:i,body:body.id,renderer:data.renderer,zone:data.world.space.system.debris,backdrop:data.world.space.system.backdrop});
  await page.screenshot({path:join(evidence,quality,'game',`${i.toString().padStart(2,'0')}.png`)});
  // Remove the previous game's pagehide writer before installing the next test save.
  await page.goto('/');
 }
 await writeFile(join(evidence,`${quality}-game.json`),JSON.stringify({samples,issues},null,2));expect(issues).toEqual([]);
});
