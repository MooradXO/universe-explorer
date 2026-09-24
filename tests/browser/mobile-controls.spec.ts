import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const snapshot = (page: Page): Promise<any> => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
const neutral = { thrust: 0, yaw: 0, pitch: 0, firing: false };

for (const [width, height, mode] of [[844, 390, 'LOW'], [568, 320, 'HIGH']] as const) {
  test(`two thumbs fly, steer and hold fire at ${width}x${height} ${mode}`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'mobile-low');
    const evidence = `docs/phases_archive/mobile-controls-2026-09-24/touch-${width}-${mode}`;
    await mkdir(evidence, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mode);
    await page.goto('/'); await page.locator('#btn-start-game').click();
    await expect.poll(async () => !!(await snapshot(page)).world.ship).toBe(true);
    const cd = await context.newCDPSession(page);
    const rect = await page.locator('.mobile-joystick').boundingBox();
    const fire = await page.getByRole('button', { name: 'FIRE', exact: true }).boundingBox();
    const point = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 });
    const centre = point(1, rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    const left = point(1, centre.x + 28, centre.y - 14);
    const right = point(2, fire!.x + fire!.width / 2, fire!.y + fire!.height / 2);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: typeof left[]) => cd.send('Input.dispatchTouchEvent', { type, touchPoints });
    const samples: any[] = [];
    const sample = async (label: string) => { const state = await snapshot(page); samples.push({ label, state }); return state; };
    const before = await sample('idle');
    await touch('touchStart', [centre]);
    expect((await snapshot(page)).world.ship.mobileInput).toEqual({ ...neutral, thrust: 1 });
    await touch('touchStart', [centre, right]); await touch('touchMove', [left, right]);
    await page.waitForTimeout(1200);
    const held = await sample('both-held');
    expect(held.world.ship.mobileInput.thrust).toBe(1);
    expect(held.world.ship.mobileInput.yaw).toBeLessThan(-.1);
    expect(held.world.ship.mobileInput.pitch).toBeGreaterThan(.05);
    expect(held.world.ship.mobileInput.firing).toBe(true);
    expect(held.world.ship.speed).toBeGreaterThan(100);
    const dot = held.world.ship.rotation.reduce((sum: number, value: number, i: number) => sum + value * before.world.ship.rotation[i], 0);
    expect(2 * Math.acos(Math.min(1, Math.abs(dot)))).toBeGreaterThan(.15);
    expect(held.world.audio.weapons.played.laser - before.world.audio.weapons.played.laser).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: `${evidence}/both-held.png` });
    // Releasing either finger must leave the other control active.
    await touch('touchEnd', [right]);
    expect((await sample('fire-released')).world.ship.mobileInput).toMatchObject({ thrust: 1, firing: false });
    await touch('touchStart', [left, right]); await touch('touchEnd', [left]);
    expect((await sample('stick-released')).world.ship.mobileInput).toEqual({ ...neutral, firing: true });
    await page.waitForTimeout(600); expect((await snapshot(page)).world.ship.mobileInput.firing).toBe(true);
    await touch('touchEnd', []); expect((await snapshot(page)).world.ship.mobileInput).toEqual(neutral);
    // Dragging beyond the stick keeps ownership; cancellation clears both controls.
    await touch('touchStart', [centre, right]);
    await touch('touchMove', [point(1, centre.x + 140, centre.y - 60), right]);
    expect((await snapshot(page)).world.ship.mobileInput.thrust).toBe(1);
    await touch('touchCancel', []); expect((await sample('cancelled')).world.ship.mobileInput).toEqual(neutral);
    // Modal menus release held controls and must never resume an old touch on close.
    await touch('touchStart', [left, right]);
    await page.getByRole('button', { name: 'SYSTEM', exact: true }).evaluate((button: HTMLElement) => button.click());
    await expect(page.locator('.mobile-flight-controls')).toBeHidden();
    expect((await sample('panel-open')).world.ship.mobileInput).toEqual(neutral);
    await touch('touchEnd', []); await page.keyboard.press('Escape');
    expect((await snapshot(page)).world.ship.mobileInput).toEqual(neutral);
    await touch('touchStart', [left, right]); await page.setViewportSize({ width: height, height: width });
    await expect(page.locator('.mobile-portrait-blocker')).toBeVisible();
    expect((await sample('rotated')).world.ship.mobileInput).toEqual(neutral);
    await touch('touchEnd', []); await page.setViewportSize({ width, height });
    await expect(page.locator('.mobile-portrait-blocker')).toBeHidden();
    expect((await snapshot(page)).world.ship.mobileInput).toEqual(neutral);
    // All mobile HUD regions remain in bounds and separate from one another.
    const layout = await page.evaluate(() => {
      const selectors = ['#hud-stats-container', '.radar-shell', '.mobile-joystick', '.mobile-weapon-rail', '.mobile-utility-rail', '.mobile-action-cluster', '.top-command-bar', '.system-navigation'];
      return selectors.map(selector => ({ selector, ...document.querySelector(selector)!.getBoundingClientRect().toJSON() }));
    });
    for (let i = 0; i < layout.length; i++) {
      const a = layout[i]; expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.right).toBeLessThanOrEqual(width); expect(a.bottom).toBeLessThanOrEqual(height);
      for (const b of layout.slice(i + 1)) expect(Math.min(a.right, b.right) <= Math.max(a.x, b.x) || Math.min(a.bottom, b.bottom) <= Math.max(a.y, b.y), `${a.selector} overlaps ${b.selector}`).toBe(true);
    }
    expect(layout[0].height).toBeLessThan(45);
    await expect(page.locator('.flight-status__bar-value')).toHaveCount(3);
    for (const value of await page.locator('.flight-status__bar-value').all()) expect(await value.getAttribute('data-mobile-value')).toMatch(/^\d+%$/);
    expect(errors).toEqual([]);
    await writeFile(`${evidence}/evidence.json`, JSON.stringify({ samples, layout, errors }, null, 2));
  });
}
