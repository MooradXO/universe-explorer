import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const evidence='docs/phases_archive/cinematic-flight-2026-09-15';

test('cinematic catalogue planets and ring detail render in normal flight',async({page},info)=>{
  const issues:string[]=[];page.on('pageerror',e=>issues.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')issues.push(m.text());});
  await page.addInitScript(mode=>localStorage.setItem('universe_gfx_mode',mode),info.project.name.includes('mobile')?'LOW':'HIGH');
  await page.goto('/');await page.locator('#btn-start-game').click();
  await expect(page.locator('.system-navigation')).toBeVisible();
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
  await expect.poll(async()=>(await snapshot()).world.space.system.sky.status).toBe('ready');
  const home=await snapshot();expect(home.world.space.system.visualStyle).toBe('cinematic');
  expect(home.world.space.system.debris.instances).toBeGreaterThanOrEqual(14);
  expect(home.world.space.system.debris.instances).toBeLessThanOrEqual(54);expect(home.world.planetCount).toBe(8);
  await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/${info.project.name}-final-earth.png`});
  await page.locator('#btn-star-map').click();await page.locator('#star-map-search').fill('Proxima');
  await page.getByRole('button',{name:'Select Proxima Centauri',exact:true}).click();
  await page.getByRole('button',{name:'Warp to star',exact:true}).click();
  await expect.poll(async()=>(await snapshot()).world.travel.systemId).toBe('athyg:4.0:1440825');
  await expect.poll(async()=>(await snapshot()).world.space.system.sky.status).toBe('ready');
  await page.waitForTimeout(2000);
  await page.screenshot({path:`${evidence}/${info.project.name}-final-proxima.png`});
  expect(issues).toEqual([]);
  await writeFile(`${evidence}/${info.project.name}-final.json`,JSON.stringify({issues,home,proxima:await snapshot()},null,2));
});
