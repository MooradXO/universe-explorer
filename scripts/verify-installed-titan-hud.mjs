import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
try {
 for(const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1920,height:1080},isMobile:mobile,hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>localStorage.setItem('universe_gfx_mode',mode),mobile?'LOW':'HIGH');
  await page.goto('http://127.0.0.1:3001/');
  expect(await page.locator('script[type="module"]').getAttribute('src')).toBe('/assets/main-ChoRyZbd.js');
  await page.locator('#btn-start-game').click(); await page.locator('#start-screen').waitFor({state:'detached'});
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(900);
  if(!mobile) await page.screenshot({path:'docs/phases_archive/titan-hud-2026-09-18/installed-flight.png'});
  await page.getByRole('button',{name:'SYSTEM',exact:true}).click();await page.locator('[data-action="manual"]').click();
  await expect(page.getByRole('dialog',{name:'Flight manual'})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'COMMS',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeFocused();
  await page.locator('#btn-hangar').click();await expect(page.locator('#chat-container')).toBeHidden();
  await expect(page.locator('#hangar-panel')).toBeVisible();
  await page.evaluate(async()=>Promise.all([...document.querySelectorAll('img[src*="titan-v1"]')].map(i=>i.decode())));
  if(!mobile) await page.screenshot({path:'docs/phases_archive/titan-hud-2026-09-18/installed-hangar.png'});
  await page.locator('#btn-hangar-close').click();
  expect(await page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().flightInputBlocked)).toBe(false);
  results.push({mode:mobile?'LOW / touch':'HIGH / desktop',entry:'main-ChoRyZbd.js',errors,pass:errors.length===0});
  await page.close();
 }
}finally{await browser.close();}
await writeFile('docs/phases_archive/titan-hud-2026-09-18/installed-smoke.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
