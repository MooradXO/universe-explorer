import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output='docs/phases_archive/visual-review-2026-09-15';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1040}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:3001/visual-lab.html');
await page.waitForFunction(()=>window.__UNIVERSE_VISUAL_LAB__?.snapshot()?.ship==='ready');
await page.waitForTimeout(1500);
for(const id of ['quiet','cinema','vivid']) {
  await page.locator(`[data-direction="${id}"]`).click();
  await page.screenshot({path:`${output}/${id}-desktop.png`,fullPage:true});
}
await page.locator('[data-direction="cinema"]').click();
const effects=[];
for(const id of ['warp','scan','anomaly']) {
  await page.locator(`[data-effect="${id}"]`).click();
  await page.waitForFunction(id=>{const s=window.__UNIVERSE_VISUAL_LAB__.snapshot();return s.effect.selected===id&&s.effect.ready;},id);
  await page.waitForTimeout(id==='scan'?400:2000);
  effects.push(await page.evaluate(()=>window.__UNIVERSE_VISUAL_LAB__.snapshot()));
  await page.screenshot({path:`${output}/${id}-desktop.png`,fullPage:true});
}
const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto('http://192.168.100.182:3002/visual-lab.html?quality=LOW');
await mobile.waitForFunction(()=>window.__UNIVERSE_VISUAL_LAB__?.snapshot()?.ship==='ready');
await mobile.waitForTimeout(1000);
await mobile.screenshot({path:`${output}/portrait.png`,fullPage:true});
await mobile.setViewportSize({width:844,height:390});
await mobile.waitForTimeout(500);
await mobile.screenshot({path:`${output}/landscape.png`,fullPage:true});
await writeFile(`${output}/initial-probe.json`,JSON.stringify({errors,effects,mobile:await mobile.evaluate(()=>window.__UNIVERSE_VISUAL_LAB__.snapshot())},null,2));
console.log(JSON.stringify({errors,effects},null,2));
await browser.close();
