import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const label=process.env.LABEL||'after',url=process.env.PREVIEW_URL||'http://127.0.0.1:3019';
const root=`docs/phases_archive/generator-foundation-2026-09-24/${label}`;await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[];
try{
  for(const quality of ['HIGH','LOW']){
    const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await page.goto(`${url}/environments.html?world=4&quality=${quality}`);
    for(const world of [4,2,8,9,10,11]){
      await page.locator('#world').selectOption(String(world));
      if(label!=='before')await page.waitForFunction(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot().surface.baked);
      await page.waitForTimeout(800);
      const frameTimes=await page.evaluate(()=>new Promise(resolve=>{let prev=performance.now(),samples=[];function frame(now){samples.push(now-prev);prev=now;if(samples.length<45)requestAnimationFrame(frame);else resolve(samples.slice(1).sort((a,b)=>a-b));}requestAnimationFrame(frame);}));
      const state=await page.evaluate(()=>window.__UNIVERSE_ENVIRONMENTS__.snapshot());
      if(label!=='before'){assert.equal(state.generation.mode,'worker');assert.ok(state.generation.estimatedBytes<=state.generation.budgetBytes);}
      if([4,8,10].includes(world))await page.locator('#stage').screenshot({path:`${root}/${quality}-${world}.png`});
      results.push({quality,world,state,frameMedian:frameTimes[Math.floor(frameTimes.length*.5)],frameP95:frameTimes[Math.floor(frameTimes.length*.95)]});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
}finally{await writeFile(`${root}/evidence.json`,JSON.stringify({results,errors},null,2));await browser.close();}
console.log(JSON.stringify({label,cases:results.length,errors,metrics:results.map(({quality,world,state,frameMedian,frameP95})=>({quality,world,calls:state.drawCalls,triangles:state.triangles,frames:[frameMedian,frameP95],generation:state.generation}))}));
