import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidence=process.env.VISUAL_EVIDENCE || 'docs/phases_archive/visual-review-2026-09-15';
const snapshot=(page:Page)=>page.evaluate(()=> (window as unknown as {__UNIVERSE_VISUAL_LAB__:{snapshot():any}}).__UNIVERSE_VISUAL_LAB__.snapshot());
async function selectEffect(page:Page,id:string){
  await page.locator(`[data-effect="${id}"]`).click();
  await expect.poll(async()=> (await snapshot(page)).effect.selected).toBe(id);
  await expect.poll(async()=> (await snapshot(page)).effect.ready).toBe(id!=='none');
  if(id!=='none')await expect.poll(async()=> (await snapshot(page)).effect.particles).toBeGreaterThan(0);
}

test('visual directions, FX compatibility, budgets, resource release and phone layout',async({page},info)=>{
  const low=info.project.name.includes('mobile'),issues:string[]=[],requests:string[]=[];
  page.on('pageerror',e=>issues.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')issues.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  await page.goto(`/visual-lab.html?quality=${low?'LOW':'HIGH'}`);
  await expect.poll(async()=> (await snapshot(page))?.ship).toBe('ready');
  expect((await snapshot(page)).quality).toBe(low?'LOW':'HIGH');
  expect(requests.some(url=>url.includes('fx-preview/')||url.includes('/assets/epic-fx-'))).toBe(false);
  for(const id of ['quiet','cinema','vivid']){
    await page.locator(`[data-direction="${id}"]`).click();
    expect((await snapshot(page)).direction).toBe(id);
    await expect(page.locator(`[data-direction="${id}"]`)).toHaveAttribute('aria-pressed','true');
  }
  await page.locator('[data-direction="cinema"]').click();
  const states=[];
  for(const id of ['warp','scan','anomaly']){
    await selectEffect(page,id);await page.waitForTimeout(1000);
    const state=await snapshot(page);expect(state.effect.particles).toBeLessThanOrEqual(state.effect.budget);states.push(state);
  }
  await selectEffect(page,'none');await page.waitForTimeout(100);
  const baseline=await snapshot(page);
  for(let i=0;i<3;i++){
    await selectEffect(page,'warp');await selectEffect(page,'anomaly');await selectEffect(page,'none');
    await page.waitForTimeout(100);const cleared=await snapshot(page);
    expect(cleared.geometries).toBe(baseline.geometries);expect(cleared.textures).toBe(baseline.textures);
  }
  // Rapid overlapping requests must not leave an orphan effect after cancellation.
  await page.evaluate(()=>{
    for(const id of ['scan','warp','anomaly','none'])document.querySelector<HTMLButtonElement>(`[data-effect="${id}"]`)!.click();
  });
  await page.waitForTimeout(500);
  expect((await snapshot(page)).effect.ready).toBe(false);
  expect((await snapshot(page)).geometries).toBe(baseline.geometries);
  await selectEffect(page,'warp');
  await page.locator('#quality').selectOption(low?'HIGH':'LOW');
  await expect.poll(async()=> (await snapshot(page)).effect.ready).toBe(true);
  expect((await snapshot(page)).quality).toBe(low?'HIGH':'LOW');
  await page.locator('#quality').selectOption(low?'LOW':'HIGH');
  await expect.poll(async()=> (await snapshot(page)).effect.ready).toBe(true);
  await page.locator('#pause').click();expect((await snapshot(page)).paused).toBe(true);
  await page.locator('#pause').click();expect((await snapshot(page)).paused).toBe(false);
  await page.locator('#reset').click();
  await mkdir(evidence,{recursive:true});
  await page.screenshot({path:`${evidence}/${info.project.name}-verified.png`,fullPage:true});
  if(low){
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const id of ['quiet','cinema','vivid'])await page.locator(`[data-direction="${id}"]`).click();
    await page.locator('[data-direction="cinema"]').click();
    await page.screenshot({path:`${evidence}/portrait-verified.png`,fullPage:true});
  }
  expect(requests.some(url=>url.includes('/__catalog/')||url.endsWith('.wav'))).toBe(false);
  expect(issues).toEqual([]);
  await writeFile(`${evidence}/${info.project.name}-compatibility.json`,JSON.stringify({issues,baseline,states,final:await snapshot(page)},null,2));
});

test('game entry stays separate from visual review resources',async({page},info)=>{
  const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>localStorage.setItem('universe_gfx_mode',mode),info.project.name.includes('mobile')?'LOW':'HIGH');
  await page.goto('/');await page.locator('#btn-start-game').click();
  await expect(page.locator('.system-navigation')).toBeVisible();
  await expect.poll(async()=>page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.travel?.atHome)).toBe(true);
  expect(requests.some(url=>url.includes('visualLab-') || url.includes('/assets/locations-'))).toBe(false);
  // Approved FX can load lazily near an orbital point; art proposals never load in gameplay.
  await expect.poll(async()=>page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.flightFX?.effects.anomaly.ready)).toBe(true);
  expect(errors).toEqual([]);
});
