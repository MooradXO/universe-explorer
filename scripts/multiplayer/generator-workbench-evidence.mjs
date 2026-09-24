import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='docs/phases_archive/generator-foundation-2026-09-24/workbench';await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[];
try{
  for(const quality of ['HIGH','LOW']){
    const page=await browser.newPage({viewport:quality==='LOW'?{width:844,height:390}:{width:1440,height:1000},hasTouch:quality==='LOW'});
    page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    const snap=()=>page.evaluate(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot());
    await page.goto(`http://127.0.0.1:3019/environments.html?world=8&quality=${quality}`);
    await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__?.snapshot().surface.baked);
    for(const preset of ['rock','ice','ocean','mineral','lava','gas']){
      await page.locator('#generator-seed').fill('survey-seed-77');await page.locator('#generator-preset').selectOption(preset);await page.locator('#generator-apply').click();
      await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().surface.baked);const state=await snap();assert.equal(state.editor.recipe.preset,preset);assert.equal(state.model.composition,preset);
      results.push({quality,preset,state});
    }
    await page.locator('#generator-pin').click();await page.locator('#generator-seed').fill('survey-seed-88');await page.locator('#generator-preset').selectOption('ocean');await page.locator('#generator-apply').click();await page.locator('#generator-compare').check();
    await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().generation.ready===2);await page.waitForTimeout(1100);
    let state=await snap();assert.equal(state.editor.comparing,true);assert.notEqual(state.editor.a,state.editor.b);assert.ok(state.generation.estimatedBytes<=state.generation.budgetBytes);
    await page.locator('#stage').screenshot({path:`${root}/${quality}-comparison.png`});const resources=[];
    for(let i=0;i<3;i++){await page.locator('#generator-compare').uncheck();await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().generation.ready===1);await page.waitForTimeout(100);resources.push(await snap());await page.locator('#generator-compare').check();await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().generation.ready===2);}
    assert.equal(resources[0].textures,resources[2].textures);assert.equal(resources[0].geometries,resources[2].geometries);
    await page.locator('.workbench details').evaluate(e=>e.open=true);await page.locator('#generator-json').fill('{"version":900}');await page.locator('#generator-import').click();assert.match(await page.locator('#generator-notice').textContent(),/не принят/);
    const valid={version:1,seed:'imported-97',preset:'ice',geography:3.5,activity:.4};await page.locator('#generator-json').fill(JSON.stringify(valid));await page.locator('#generator-import').click();await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().surface.baked);assert.deepEqual((await snap()).editor.recipe,valid);
    const downloadPromise=page.waitForEvent('download');await page.locator('#generator-export').click();const download=await downloadPromise;await download.saveAs(`${root}/${quality}-export.json`);
    results.push({quality,comparison:state.editor,resources:resources.map(s=>({textures:s.textures,geometries:s.geometries})),imported:(await snap()).editor.recipe});await page.close();
  }
  const fallback=await browser.newPage({viewport:{width:1280,height:800}});fallback.on('pageerror',e=>errors.push(e.message));
  await fallback.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Worker deliberately disabled for fallback verification');}};});
  await fallback.goto('http://127.0.0.1:3019/environments.html?world=3&quality=LOW');
  await fallback.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__?.snapshot().surface.baked);const s=await fallback.evaluate(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot());assert.equal(s.generation.mode,'incremental-fallback');results.push({fallback:s.generation});
  await fallback.locator('#stage').screenshot({path:`${root}/fallback.png`});await fallback.close();assert.deepEqual(errors,[]);
}finally{await writeFile(`${root}/evidence.json`,JSON.stringify({results,errors},null,2));await browser.close();}
console.log(JSON.stringify({cases:results.length,errors}));
