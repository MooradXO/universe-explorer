import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const evidence = 'docs/phases_archive/flight-feedback-2026-09-16';
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
async function enter(page: Page, low: boolean) {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), low ? 'LOW' : 'HIGH');
  await page.goto('/'); await page.locator('#btn-start-game').click();
  await expect(page.locator('.system-navigation')).toBeVisible();
}

test('picker remains open through HUD refreshes, pointer selection, keyboard and phone touch', async ({ page }, info) => {
  const low = info.project.name.includes('mobile'); await enter(page, low);
  const picker = page.getByRole('combobox', { name: 'System destination', exact: true });
  if (low) await picker.tap(); else await picker.click();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(350); await expect(page.getByRole('listbox')).toBeVisible();
  }
  if (low) await page.getByRole('option', { name: 'Mars', exact: true }).tap();
  else await page.getByRole('option', { name: 'Mars', exact: true }).click();
  await expect(picker).toContainText('Mars');
  expect((await snapshot(page)).world.travel.selected).toBe('sol/mars');
  await picker.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(1100);
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(picker).toContainText('Mercury');
  await picker.click(); await page.keyboard.press('End'); await page.keyboard.press('Escape');
  await expect(picker).toContainText('Mercury'); await expect(page.getByRole('listbox')).toBeHidden();
  if (low) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.mobile-portrait-blocker')).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 }); await picker.tap(); await page.waitForTimeout(1200);
    await page.getByRole('option', { name: 'Neptune', exact: true }).tap(); await expect(picker).toContainText('Neptune');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/${info.project.name}-picker.png` });
});

test('normal forward reverse and strafe movement renders dust on HIGH and LOW', async ({ page }, info) => {
  const low = info.project.name.includes('mobile'), issues: string[] = [];
  page.on('pageerror', e => issues.push(e.message)); page.on('console', m => { if (['warning', 'error'].includes(m.type())) issues.push(m.text()); });
  await enter(page, low);
  await page.locator('body').evaluate(el => (document.activeElement as HTMLElement)?.blur());
  await page.waitForTimeout(1600); const idle = await snapshot(page);
  await page.waitForTimeout(500); expect((await snapshot(page)).world.flightDust.sample).toEqual(idle.world.flightDust.sample);
  if (low) await page.evaluate(() => window.dispatchEvent(new CustomEvent('DualJoystickLook', { detail: { dx: 0, dy: 3 } })));
  else await page.keyboard.down('q');
  await page.waitForTimeout(600);
  expect((await snapshot(page)).world.flightDust.sample).toEqual(idle.world.flightDust.sample);
  expect((await snapshot(page)).world.flightDust.speed).toBe(0);
  if (!low) await page.keyboard.up('q');
  const states: any[] = [idle];
  for (const [key, x, y] of [['w', 0, 1], ['s', 0, -1], ['d', 1, 0]] as const) {
    if (low) await page.evaluate(({ x, y }) => window.dispatchEvent(new CustomEvent('DualJoystickMove', { detail: { x, y } })), { x, y });
    else await page.keyboard.down(key);
    await page.waitForTimeout(1100); const state = await snapshot(page); states.push(state);
    expect(state.world.flightDust.speed).toBeGreaterThan(100);
    expect(state.world.flightDust.sample).not.toEqual(idle.world.flightDust.sample);
    expect(state.world.flightDust.opacity).toBeGreaterThan(.9);
    expect(state.world.flightDust.maxOffset).toBeLessThanOrEqual(620);
    await mkdir(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/${info.project.name}-${key}.png` });
    if (low) await page.evaluate(() => window.dispatchEvent(new CustomEvent('DualJoystickMove', { detail: { x: 0, y: 0 } })));
    else await page.keyboard.up(key);
    await page.waitForTimeout(1600);
  }
  if (low) await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('DualJoystickMove', { detail: { x: 0, y: 1 } }));
    window.dispatchEvent(new CustomEvent('TouchBoostOn'));
  });
  else { await page.keyboard.down('w'); await page.keyboard.down('Shift'); }
  await page.waitForTimeout(1300);
  const boosted = await snapshot(page); expect(boosted.world.flightDust.speed).toBeGreaterThan(550); states.push(boosted);
  if (low) await page.evaluate(() => window.dispatchEvent(new CustomEvent('TouchBoostOff')));
  else { await page.keyboard.up('Shift'); await page.keyboard.up('w'); }
  expect(issues).toEqual([]);
  await writeFile(`${evidence}/${info.project.name}-motion.json`, JSON.stringify({ states, issues }, null, 2));
});
