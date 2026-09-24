import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SOLAR_SYSTEM, SOLAR_CATALOG_OBJECT, buildSystem } from '../../src/world/systems/SystemDescriptor';
import { stellarAddress } from '../../src/world/space/StellarAddress';
import { worldPosition } from '../../src/world/space/WorldPosition';
const mode = process.env.CRUISE_QUALITY || 'HIGH';
const root = `docs/phases_archive/cruise-missile-fix-2026-09-24/after-${mode}`;
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results: any[] = [], errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: mode === 'LOW' ? { width: 844, height: 390 } : { width: 1440, height: 810 }, isMobile: mode === 'LOW', hasTouch: mode === 'LOW', recordVideo: { dir: root } });
  await page.addInitScript('window.__name = (fn) => fn;');
  page.on('pageerror', e => errors.push(e.message));
  const snap = () => page.evaluate(() => (window as any).__UNIVERSE_DEBUG__.snapshot());
  const select = async (name: string) => {
    await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
    await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
  };
  const proxima = buildSystem({ ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:1440825', title: 'Proxima Centauri', spectrum: 'M5 V' });
  const cases = [{ system: SOLAR_SYSTEM, index: 2, target: mode === 'HIGH' ? 'Mercury' : 'Uranus', complete: true },
    ...proxima.bodies.map((body,index) => ({ system: proxima, index: (index+1)%4, target: body.name, complete: false }))];
  for (const entry of cases) {
    const body = entry.system.bodies[entry.index];
    const save = { version: 1, address: stellarAddress(entry.system.anchor, worldPosition(undefined,
      body.position.map((v,i)=>v+(i===2?body.radius+1800:0)) as [number,number,number])), spectrum: entry.system.spectrum, rotation: [0,0,0,1], visited: [] };
    await page.goto('http://127.0.0.1:3016/');
    await page.evaluate(({save,mode})=>{localStorage.setItem('universe:stellar-flight:v1:guest',JSON.stringify(save));localStorage.setItem('universe_gfx_mode',mode);}, {save,mode});
    await page.reload(); await page.locator('#btn-start-game').click(); await page.waitForTimeout(500);
    // Frame-level attitude samples include the click, the departure and each corner.
    await page.evaluate(() => {
      const w = window as any; w.__turnFrames=[];
      let last=performance.now(), previous=w.__UNIVERSE_DEBUG__.snapshot().world.ship.rotation;
      const tick=()=>{const now=performance.now(), s=w.__UNIVERSE_DEBUG__.snapshot(); const q=s.world.ship.rotation;
        const dot=Math.abs(q.reduce((v:number,x:number,i:number)=>v+x*previous[i],0));
        w.__turnFrames.push({dt:(now-last)/1000,angle:2*Math.acos(Math.min(1,dot)),cruising:s.world.travel.cruising});
        previous=q;last=now;w.__turnRaf=requestAnimationFrame(tick);};w.__turnRaf=requestAnimationFrame(tick);
    });
    await select(entry.target); const frames: any[] = [];
    for (let i=0;i<(entry.complete?1600:90);i++) {
      await page.waitForTimeout(100); const s=await snap(); frames.push({travel:s.world.travel,ship:s.world.ship});
      assert.ok(!s.world.travel.status.startsWith('Obstacle'), `${entry.target}: blocked`);
      if (!s.world.travel.cruising) break;
    }
    const turns=await page.evaluate(()=>{const w=window as any;cancelAnimationFrame(w.__turnRaf);return w.__turnFrames;});
    const last=frames[frames.length-1];
    if(entry.complete) assert.ok(last.travel.status.startsWith('Destination reached'), entry.target);
    else {
      assert.ok(last.travel.cruising,entry.target);
      assert.ok(frames.some(f=>f.travel.cruiseSpeed>0),`${entry.target}: movement`);
      await page.getByRole('button',{name:'STOP',exact:true}).click();
      assert.equal((await snap()).world.travel.cruising,false);
      await page.getByRole('button',{name:'CRUISE',exact:true}).click();await page.waitForTimeout(1200);
      assert.ok((await snap()).world.travel.cruising);
    }
    const maxAngle=Math.max(...turns.map((t:any)=>t.angle));
    assert.ok(maxAngle < .13, `${entry.target}: camera/ship snap ${maxAngle}`);
    await page.screenshot({path:`${root}/${entry.target.replace(/[^a-z0-9]/gi,'-')}.png`});
    results.push({target:entry.target,complete:entry.complete,frames,maxAngle,turns});
    console.log(JSON.stringify({mode,target:entry.target,complete:entry.complete,status:last.travel.status,maxFrameTurnDegrees:maxAngle*180/Math.PI}));
  }
  assert.deepEqual(errors,[]);
  const video=page.video();await page.close();if(video)await rename(await video.path(),`${root}/flight.webm`);
} finally { await writeFile(`${root}/evidence.json`,JSON.stringify({mode,results,errors},null,2));await browser.close(); }
