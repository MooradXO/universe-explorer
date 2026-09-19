import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page, mobile: boolean) {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mobile ? 'LOW' : 'HIGH');
  await page.goto('/');
  await page.locator('#btn-start-game').click();
  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await expect.poll(() => page.evaluate(() => !!window.__UNIVERSE_DEBUG__.snapshot().world.ship)).toBe(true);
}
async function assertWindow(page: Page, id: string | null) {
  await expect.poll(() => page.evaluate(() => document.body.dataset.hudWindow || null)).toBe(id);
  const state = await page.evaluate(() => {
    const visible = [...document.querySelectorAll<HTMLElement>('[data-hud-panel], .star-map[open]')].filter(e => {
      const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden';
    });
    const within = visible.every(e => { const r=e.getBoundingClientRect(); return r.x>=0 && r.y>=0 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1; });
    const overlap = visible.some(e => {
      const a=e.getBoundingClientRect();
      return [...document.querySelectorAll('.top-command-bar,.system-navigation')].some(n => {
        if (getComputedStyle(n).visibility==='hidden' || n.contains(e)) return false;
        const b=n.getBoundingClientRect();
        return Math.min(a.right,b.right)>Math.max(a.left,b.left)+1 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
      });
    });
    return { count:visible.length, within, overlap, blocked:window.__UNIVERSE_DEBUG__.snapshot().flightInputBlocked };
  });
  expect(state.count).toBe(id ? 1 : 0);
  expect(state.within).toBe(true); expect(state.overlap).toBe(false);
  expect(state.blocked).toBe(!!id && id !== 'destination-picker');
}

test('windows replace one another, remain in bounds and return input to flight', async ({page}, info) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page, info.project.name === 'mobile-low');
  await page.getByRole('button',{name:'SYSTEM',exact:true}).click();await assertWindow(page,'system');
  await page.locator('[data-action="manual"]').click();await assertWindow(page,'manual');
  await expect(page.getByRole('dialog',{name:'Flight manual'})).toContainText('Toggle microphone');
  await page.getByRole('button',{name:'BOUNTIES',exact:true}).click();await assertWindow(page,'bounties');
  await expect(page.locator('.command-leaderboard__row').first()).toBeVisible();
  await page.getByRole('button',{name:'COMMS',exact:true}).click();await assertWindow(page,'comms');
  const before=await page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.ship!.viewMode);
  const input=page.getByRole('textbox',{name:'Message',exact:true});
  await input.pressSequentially('vwasd123');
  expect(await page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.ship!.viewMode)).toBe(before);
  await expect(input).toHaveValue('vwasd123');
  await page.keyboard.press('Escape');await assertWindow(page,null);
  await page.keyboard.press('v');
  expect(await page.evaluate(()=>window.__UNIVERSE_DEBUG__.snapshot().world.ship!.viewMode)).not.toBe(before);
  await page.keyboard.press('v');
  await page.locator('#btn-hangar').click();await assertWindow(page,'hangar');
  await page.locator('#btn-buy-shotgun').click();
  await expect(page.locator('#btn-hangar-close')).toBeInViewport();
  await expect(page.locator('#btn-buy-shotgun')).toHaveText('EQUIPPED');
  await page.locator('#btn-equip-laser').click();
  await expect(page.locator('#btn-equip-laser')).toHaveText('EQUIPPED');
  await page.getByRole('button',{name:'Flight details',exact:true}).click();await assertWindow(page,'navigation');
  await page.getByRole('combobox',{name:'System destination'}).click();await assertWindow(page,'destination-picker');
  await page.locator('#btn-star-map').click();await expect(page.locator('.star-map[open]')).toBeVisible();await assertWindow(page,'star-map');
  await expect(page.locator('#star-map-title')).toHaveText('STAR MAP');
  await page.keyboard.press('Escape');await assertWindow(page,null);
  expect(errors).toEqual([]);
});

test('opening another window cancels a map that is still loading', async ({page}, info) => {
  await enter(page, info.project.name === 'mobile-low');
  await page.route('**/StarMapUI-*.js', async route => { await new Promise(resolve=>setTimeout(resolve,800)); await route.continue(); });
  await page.locator('#btn-star-map').click();
  await page.getByRole('button',{name:'COMMS',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message',exact:true})).toBeFocused();
  await page.waitForTimeout(1100);
  await assertWindow(page,'comms');
  await expect(page.locator('.star-map')).toHaveCount(0);
});

test('generated artwork loads, header aligns and flight HUD remains uncluttered', async ({page}, info) => {
  await enter(page, info.project.name === 'mobile-low');
  await page.locator('#btn-hangar').click();
  const images=await page.evaluate(async()=>{
    const all=[...document.querySelectorAll<HTMLImageElement>('img[src*="titan-v1"]')];
    await Promise.all(all.map(i=>i.decode()));
    return all.every(i=>i.naturalWidth>0);
  });expect(images).toBe(true);
  await page.keyboard.press('Escape');
  const bounds=await page.locator('.top-command-bar button').evaluateAll(all=>all.map(e=>{ const b=e.getBoundingClientRect();return {y:b.y,h:b.height};}));
  expect(new Set(bounds.map(b=>b.y)).size).toBe(1);expect(new Set(bounds.map(b=>b.h)).size).toBe(1);
  await expect(page.locator('.combat-controls,.controls-hint')).toHaveCount(0);
  await expect(page.locator('#hud-fps-counter')).toBeHidden();
  await expect(page.getByRole('meter',{name:'HULL',exact:true})).toBeVisible();
  if (info.project.name === 'mobile-low') {
    await expect(page.locator('.mobile-flight-controls')).toBeVisible();
    await page.getByRole('button',{name:'SYSTEM',exact:true}).click();
    await expect(page.locator('.mobile-flight-controls')).toBeHidden();
  }
});
