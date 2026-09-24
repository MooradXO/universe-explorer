import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { startServer } from '../../server/index';

const base=process.env.VISUAL_PREVIEW_URL ?? 'http://127.0.0.1:3030';
assert.equal(new URL(base).hostname,'127.0.0.1','Only an isolated local preview is allowed');
const out=process.env.VISUAL_EVIDENCE ?? '.release-work/ship-visual-after';
const verify=process.env.VISUAL_BASELINE!=='true';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results:any[]=[];
try{for(const quality of ['HIGH','LOW']){
 const running=await startServer({port:2577,store:null,allowBots:false,maxPlayers:50,origins:[new URL(base).origin]});
 running.server.simulateLatency(240);
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:quality==='LOW'?{width:844,height:390}:{width:1440,height:810},isMobile:quality==='LOW',hasTouch:quality==='LOW'})));
 const errors:string[]=[];
 try{
  const pages=await Promise.all(contexts.map(c=>c.newPage()));const [a,b]=pages;
  for(const page of pages){
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/matchmake/**',route=>new URL(route.request().url()).origin==='http://127.0.0.1:2577'?route.continue():route.abort('blockedbyclient'));
   await page.addInitScript(q=>localStorage.setItem('universe_gfx_mode',q),quality);
   await page.goto(base);await page.locator('#btn-start-game').click();
   await page.waitForFunction(()=>(window as any).__UNIVERSE_DEBUG__?.snapshot().realtime.subscribed);
  }
  const [ap,bp]=[...running.room.game.pilots.values()];
  // Controlled positions are confined to this disposable in-memory backend.
  ap.model.resetMotion();ap.quaternion.identity();
  bp.model.resetMotion();bp.position.copy(ap.position).add(new Vector3(0,0,-1100));bp.quaternion.identity();
  for(const p of [ap,bp]){p.epoch++;p.queue=[];p.seq=p.receivedSeq=0;running.room.game.announce(p);}
  await a.waitForFunction(()=>(window as any).__UNIVERSE_DEBUG__.snapshot().world.remoteVisuals.detailedPlayers===1);
  await a.waitForTimeout(900);
  const visual=await a.evaluate(()=>(window as any).__UNIVERSE_DEBUG__.snapshot().world.remoteVisuals);
  await a.screenshot({path:`${out}/${quality}-other-ship.png`});
  if(verify)assert(visual.playerModelSize![0]>200&&visual.playerModelSize![0]<210,'Remote ship should retain its approximately 205-unit model width');
  // A second real guest must receive hits on the visible ship, not a private copy.
  const shield=bp.shield;
  await a.evaluate(()=>window.dispatchEvent(new CustomEvent('PrimaryFireStart')));
  await b.waitForFunction(shield=>(window as any).__UNIVERSE_DEBUG__.snapshot().realtime.shield!<shield,shield,{timeout:10000});
  await a.evaluate(()=>window.dispatchEvent(new CustomEvent('PrimaryFireEnd')));
  const damage=shield-bp.shield;
  // Remove nearby combat before measuring cruise's automatic turn.
  bp.position.add(new Vector3(100000,0,0));bp.epoch++;bp.queue=[];bp.seq=bp.receivedSeq=0;running.room.game.announce(bp);
  await contexts[1].close();
  await a.waitForTimeout(4500);
  await a.getByRole('combobox',{name:'System destination',exact:true}).click();
  await a.getByRole('option',{name:'Mercury',exact:true}).click();
  await a.getByRole('button',{name:'CRUISE',exact:true}).click();
  await a.waitForFunction(()=>(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel?.cruising);
  const frames:any[]=await a.evaluate(`new Promise(resolve=>{
   const samples=[],start=performance.now();
   const sample=()=>{const s=window.__UNIVERSE_DEBUG__.snapshot();samples.push({at:performance.now(),frameMs:s.lastFrameTimeMs,q:s.world.ship.rotation,cruise:s.world.travel?.cruising,cameraOffset:s.world.ship.cameraOffset,received:s.realtime.received});if(performance.now()-start<6500)requestAnimationFrame(sample);else resolve(samples);};requestAnimationFrame(sample);
  })`);
  await writeFile(`${out}/${quality}-frames.json`,JSON.stringify(frames));
  const motion=frames.slice(1).map((s,i)=>{const dt=Number.isFinite(s.frameMs)?Math.min(s.frameMs/1000,.05):(s.at-frames[i].at)/1000,angle=new Quaternion().fromArray(s.q).angleTo(new Quaternion().fromArray(frames[i].q));return{dt,angle,speed:angle/dt,cruise:s.cruise&&frames[i].cruise};}).filter(s=>s.cruise&&s.dt>.0001&&s.dt<.25);
  const turning=motion.filter(s=>s.angle>1e-5), maxAngularSpeed=Math.max(...turning.map(s=>s.speed));
  assert(turning.length>5,`Cruise must actually turn during this scenario: ${turning.length}/${frames.length}`);
  if(verify)assert(maxAngularSpeed<1.21,`Render turn must not exceed the server's automatic turn speed: ${maxAngularSpeed}`);
  assert(frames.every(s=>Math.hypot(...s.cameraOffset)<700),'Camera must follow cruise translation');
  await a.screenshot({path:`${out}/${quality}-cruise.png`});
  await a.getByRole('button',{name:'STOP',exact:true}).click();
  await a.waitForFunction(()=>!(window as any).__UNIVERSE_DEBUG__.snapshot().world.travel?.cruising&&!(window as any).__UNIVERSE_DEBUG__.snapshot().flightInputBlocked);
  assert.equal((await a.evaluate(()=>(window as any).__UNIVERSE_DEBUG__.snapshot())).flightInputBlocked,false);
  assert.deepEqual(errors,[]);
  const result={quality,visual,damage,frames:frames.length,turningFrames:turning.length,maxAngularSpeed,errors};results.push(result);
  await writeFile(`${out}/${quality}-frames.json`,JSON.stringify(frames));console.log(JSON.stringify(result));
 }finally{await Promise.all(contexts.map(c=>c.close()));await running.close();}
}}finally{await browser.close();await writeFile(`${out}/result.json`,JSON.stringify({passed:verify,baseline:!verify,latencyMs:240,results},null,2));}
