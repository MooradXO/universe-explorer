import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.LAUNCH_URL ?? 'http://127.0.0.1:3032';
assert.equal(new URL(base).hostname,'127.0.0.1');
const out='.release-work/launch-review';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results=[],errors=[];
async function open(quality,width,height,reducedMotion='no-preference') {
  const context=await browser.newContext({viewport:{width,height},hasTouch:quality==='LOW',isMobile:quality==='LOW',reducedMotion});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.addInitScript(q=>localStorage.setItem('universe_gfx_mode',q),quality);
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__UNIVERSE_DEBUG__?.snapshot().starMap.ready);
  return {context,page};
}
async function launch(page,mode) {
  await page.locator(`.mode-card:has(input[value="${mode}"])`).click();
  const samples=page.evaluate(()=>new Promise(resolve=>{const samples=[],start=performance.now();const sample=()=>{samples.push(window.__UNIVERSE_DEBUG__.snapshot().starMap);if(performance.now()-start<2700)requestAnimationFrame(sample);else resolve(samples);};requestAnimationFrame(sample);}));
  await page.locator('#btn-start-game').click();
  await page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().realtime.subscribed,{},{timeout:25000});
  const frames=await samples, departing=frames.filter(f=>f.type==='launch'&&f.phase>0);
  assert(departing.length>4);assert(departing.every(f=>!f.intersectsCarrier&&f.planetClearance>0));
  assert.equal(await page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().realtime.mode),mode);
  await page.locator('#start-screen').waitFor({state:'detached'});
  return {frames:departing.length,minimumPlanetClearance:Math.min(...departing.map(f=>f.planetClearance))};
}
try {
  const first=await open('HIGH',1440,900), friend=await open('HIGH',1280,800), fighter=await open('LOW',844,390);
  const launchResult=await launch(first.page,'exploration'); await launch(friend.page,'exploration'); await launch(fighter.page,'pvp');
  await first.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote===1);
  assert.equal(await fighter.page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote),0);
  await first.page.evaluate(()=>{window.dispatchEvent(new Event('PrimaryFireStart'));window.dispatchEvent(new Event('SpawnBots'));});
  await first.page.waitForTimeout(450);
  const peaceful=await first.page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot());
  assert.equal(peaceful.world.projectiles,0);assert.equal(peaceful.world.players.bots,0);
  await first.page.getByRole('button',{name:'SYSTEM',exact:true}).click();
  await first.page.locator('#flight-music-volume').fill('24');
  await first.page.getByRole('button',{name:'Ambient music',exact:true}).click();
  assert.equal(await first.page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.audio.music.enabled),false);
  await first.page.screenshot({path:`${out}/flight-settings.png`});
  await first.page.locator('[data-action="launch"]').click();
  await first.page.waitForSelector('#start-screen');await first.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__?.snapshot().starMap.ready);
  assert.equal(await first.page.locator('#launch-music-volume').inputValue(),'24');
  assert.equal(await first.page.getByRole('button',{name:'Ambient music',exact:true}).getAttribute('aria-pressed'),'false');
  await first.page.getByRole('button',{name:'Ambient music',exact:true}).click();
  await launch(first.page,'pvp');
  await first.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote===1);
  await friend.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote===0);
  await first.page.evaluate(()=>window.dispatchEvent(new Event('PrimaryFireStart')));await first.page.waitForTimeout(300);
  assert((await first.page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.projectiles))>0);
  await first.page.evaluate(()=>window.dispatchEvent(new Event('PrimaryFireEnd')));
  await first.page.reload({waitUntil:'domcontentloaded'});await first.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__?.snapshot().starMap.ready);
  await launch(first.page,'exploration');
  await friend.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote===1);
  await fighter.page.waitForFunction(()=>window.__UNIVERSE_DEBUG__.snapshot().world.players.remote===0);
  results.push({profile:'HIGH and LOW',...launchResult,modes:true,peacefulNoFire:true,pvpFire:true,exitAndSwitch:true,reloadAndSwitch:true,musicPersistence:true});
  for (const {page,context} of [first,friend,fighter]) { await page.getByRole('button',{name:'SYSTEM',exact:true}).click();await page.locator('[data-action="launch"]').click();await page.waitForSelector('#start-screen');await context.close(); }
  const portrait=await open('LOW',390,844,'reduce');
  assert.equal(await portrait.page.locator('.mobile-portrait-blocker').isVisible(),false);
  await portrait.page.locator('#btn-start-game').click(); await portrait.page.waitForFunction(()=>!!window.__UNIVERSE_DEBUG__.snapshot().world.ship);
  assert.equal(await portrait.page.locator('.mobile-portrait-blocker').isVisible(),true);
  await portrait.page.setViewportSize({width:844,height:390});assert.equal(await portrait.page.locator('.mobile-portrait-blocker').isVisible(),false);
  assert.equal(await portrait.page.locator('.mobile-action--fire').isVisible(),false);
  await portrait.page.screenshot({path:`${out}/mobile-exploration.png`});
  await portrait.page.routeWebSocket('ws://127.0.0.1:2582/**',socket=>socket.close());
  await portrait.page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await portrait.page.getByRole('button',{name:'SYSTEM',exact:true}).click();await portrait.page.locator('[data-action="launch"]').click();await portrait.page.waitForSelector('#start-screen',{timeout:7000});await portrait.context.close();
  assert.deepEqual(errors,[]);results.push({portraitMenu:true,landscapeFlight:true,reducedMotion:true,exitDuringDisconnect:true,errors});
}finally{await browser.close();await writeFile(`${out}/browser-result.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
