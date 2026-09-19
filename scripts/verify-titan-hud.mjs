import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output='docs/art-direction/hud-redesign-2026-09-18/implementation';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={screens:[], errors:[]};
try {
 for (const mode of ['desktop','laptop','touch']) {
  const context=await browser.newContext({viewport:mode==='desktop'?{width:1920,height:1080}:mode==='laptop'?{width:1366,height:768}:{width:844,height:390},hasTouch:mode==='touch',isMobile:mode==='touch'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(mode+': '+e.message));
  await page.addInitScript(m=>localStorage.setItem('universe_gfx_mode',m),mode==='desktop'?'HIGH':'LOW');
  await page.goto('http://127.0.0.1:3012/');
  await page.locator('#btn-start-game').click();
  await page.locator('#start-screen').waitFor({state:'detached'});
  await page.waitForTimeout(1700);
  const take=async name=>{
   await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('img[src*="titan-v1"]')].map(i=>i.decode().catch(()=>{}))); await new Promise(requestAnimationFrame); });
   await page.screenshot({path:output+'/'+mode+'-'+name+'.png'});
   const state=await page.evaluate(()=>({
    active:document.body.dataset.hudWindow,
    inputBlocked:window.__UNIVERSE_DEBUG__.snapshot().flightInputBlocked,
    bounds:[...document.querySelectorAll('.top-command-bar,.system-navigation,.radar-shell,#hud-stats-container,[data-hud-panel],.star-map')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden').map(e=>({id:e.id||e.className,b:e.getBoundingClientRect().toJSON()})),
    missingImages:[...document.querySelectorAll('img[src*="titan-v1"]')].filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src)
   }));
   report.screens.push({mode,name,...state});
  };
  await take('flight');
  await page.getByRole('button',{name:'SYSTEM',exact:true}).click();
  await page.locator('[data-action="manual"]').click(); await take('manual');
  await page.getByRole('button',{name:'BOUNTIES',exact:true}).click();await page.waitForTimeout(150);await take('bounties');
  await page.getByRole('button',{name:'COMMS',exact:true}).click();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Flight check 123 WASD');
  await take('comms');
  await page.keyboard.press('Escape');
  await page.locator('#btn-hangar').click(); await take('hangar');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox',{name:'System destination'}).click(); await take('picker');
  await page.keyboard.press('Escape');
  await page.locator('#btn-star-map').click();
  await page.locator('.star-map[open]').waitFor();await page.waitForTimeout(1500);await take('map');
  await page.keyboard.press('Escape'); await take('returned');
  await context.close();
 }
}finally{await browser.close();await writeFile(output+'/layout-report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({screens:report.screens.map(s=>({mode:s.mode,name:s.name,active:s.active,inputBlocked:s.inputBlocked,missing:s.missingImages})),errors:report.errors}));
