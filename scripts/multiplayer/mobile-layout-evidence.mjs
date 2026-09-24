import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const root=`docs/phases_archive/mobile-controls-2026-09-24/${process.env.LABEL||'before'}`;
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
  for(const [width,height,mobile] of [[844,390,true],[667,375,true],[568,320,true],[1440,810,false]]) {
    const page=await browser.newPage({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
    await page.addInitScript(mode=>localStorage.setItem('universe_gfx_mode',mode),mobile?'LOW':'HIGH');
    await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:3014/');await page.locator('#btn-start-game').click();await page.waitForTimeout(1600);
    const rects=await page.evaluate(()=>Object.fromEntries(['#hud-stats-container','.radar-shell','.mobile-joystick','.mobile-weapon-rail','.mobile-utility-rail','.mobile-action-cluster','.top-command-bar','.system-navigation'].map(sel=>{const e=document.querySelector(sel);return[sel,e?{...e.getBoundingClientRect().toJSON(),visibility:getComputedStyle(e).visibility}:null]})));
    await page.screenshot({path:`${root}/${width}x${height}.png`});results.push({width,height,mobile,rects});await page.close();
  }
}finally{await writeFile(`${root}/layout.json`,JSON.stringify(results,null,2));await browser.close();}
