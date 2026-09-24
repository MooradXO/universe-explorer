import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { SOLAR_SYSTEM } from '../../src/world/systems/SystemDescriptor';
import { stellarAddress } from '../../src/world/space/StellarAddress';
import { worldPosition } from '../../src/world/space/WorldPosition';
const root = `docs/phases_archive/cruise-missile-fix-2026-09-24/${process.env.LABEL || 'before'}`;
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const target of (process.env.TARGETS || 'Mercury,Uranus').split(',')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const frames: any[] = []; const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.NEAR_EARTH) {
      const earth = SOLAR_SYSTEM.bodies[2];
      const save = { version: 1, address: stellarAddress(SOLAR_SYSTEM.anchor, worldPosition(undefined,
        earth.position.map((v,i)=>v+(i===2?earth.radius+1800:0)) as [number,number,number])), spectrum: SOLAR_SYSTEM.spectrum, rotation: [0,0,0,1], visited: [] };
      await page.addInitScript(save => localStorage.setItem('universe:stellar-flight:v1:guest', JSON.stringify(save)), save);
    }
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:3014/');
    await page.locator('#btn-start-game').click(); await page.waitForTimeout(1000);
    await page.getByRole('combobox', { name: 'System destination', exact: true }).click();
    await page.getByRole('option', { name: target, exact: true }).click();
    await page.getByRole('button', { name: 'CRUISE', exact: true }).click();
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(100);
      const s = await page.evaluate(() => (window as any).__UNIVERSE_DEBUG__.snapshot());
      frames.push({ t: i / 10, travel: s.world.travel, ship: s.world.ship, fields: s.world.space.system?.openSpace });
      if (!s.world.travel.cruising) break;
    }
    await page.screenshot({ path: `${root}/${target}.png` });
    await writeFile(`${root}/${target}.json`, JSON.stringify({ frames, errors }, null, 2));
    console.log(JSON.stringify({ target, seconds: frames.length / 10, last: frames[frames.length - 1]?.travel, errors }));
    await page.close();
  }
} finally { await browser.close(); }
