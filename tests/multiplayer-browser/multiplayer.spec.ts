import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const snapshot = (page: Page): Promise<any> => page.evaluate(() => JSON.parse(JSON.stringify(window.__UNIVERSE_DEBUG__.snapshot())));
async function enter(page: Page, mode: string) {
  await page.addInitScript(mode => localStorage.setItem('universe_gfx_mode', mode), mode);
  await page.goto('/'); await page.locator('#btn-start-game').click();
  await expect.poll(async () => (await snapshot(page)).realtime.subscribed, { timeout: 20000 }).toBe(true);
  await expect.poll(async () => (await snapshot(page)).flightInputBlocked, { timeout: 20000 }).toBe(false);
}
test('two real browsers: flight, hit, chat, all weapons, warp, cruise, reconnect, persistent guest', async ({ browser }, info) => {
  const contexts = await Promise.all([browser.newContext(info.project.use), browser.newContext(info.project.use)]);
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const errors: string[] = []; for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  try {
    await enter(a, info.project.name); await enter(b, info.project.name);
    await expect.poll(async () => (await snapshot(a)).world.players.remote).toBe(1);
    const initialA = await snapshot(a), initialB = await snapshot(b);
    expect(initialA.realtime.id).not.toBe(initialB.realtime.id);
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('ToggleVoiceMute')));
    await expect.poll(async () => (await snapshot(a)).world.voice.microphone, { timeout: 10000 }).toBe(true);
    await expect.poll(async () => (await snapshot(b)).world.voice.connected, { timeout: 10000 }).toBe(1);
    // B flies ahead of A, then A fires along the initial forward direction.
    await b.keyboard.down('KeyW'); await b.waitForTimeout(1300); await b.keyboard.up('KeyW'); await b.waitForTimeout(1800);
    const moved = await snapshot(b); expect(moved.realtime.ack).toBeGreaterThan(initialB.realtime.ack);
    const initialShield = moved.realtime.shield;
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('PrimaryFireStart')));
    await expect.poll(async () => (await snapshot(b)).realtime.shield, { timeout: 8000 }).toBeLessThan(initialShield);
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('PrimaryFireEnd')));
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('SendChatMessage', { detail: 'Colyseus browser test' })));
    await expect(b.getByText('Colyseus browser test', { exact: true })).toBeAttached();
    for (const key of ['Digit2', 'Digit3', 'Digit1']) {
      await a.keyboard.press(key); await a.waitForTimeout(700);
      await a.evaluate(() => window.dispatchEvent(new CustomEvent('LeftClickShoot')));
      await expect.poll(async () => (await snapshot(a)).world.projectiles).toBeGreaterThan(0);
    }
    const id = (await snapshot(a)).realtime.id, epoch = (await snapshot(a)).realtime.epoch;
    // The SDK handles the browser's normal offline event by closing with its reconnect code.
    await a.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect.poll(async () => (await snapshot(a)).realtime.epoch, { timeout: 15000 }).toBeGreaterThan(epoch);
    expect((await snapshot(a)).realtime.id).toBe(id);
    await a.locator('#btn-star-map').click(); await a.locator('#star-map-search').fill('Proxima');
    await a.getByRole('button', { name: 'Select Proxima Centauri', exact: true }).click();
    await a.getByRole('button', { name: 'Warp to star', exact: true }).click();
    await expect.poll(async () => (await snapshot(a)).world.travel.systemId, { timeout: 12000 }).toBe('athyg:4.0:1440825');
    await expect.poll(async () => (await snapshot(b)).world.players.remote).toBe(0);
    await a.reload(); await a.locator('#btn-start-game').click();
    await expect.poll(async () => (await snapshot(a)).realtime.subscribed, { timeout: 30000 }).toBe(true);
    expect((await snapshot(a)).realtime.id).toBe(id);
    await expect.poll(async () => (await snapshot(a)).world.travel.systemId).toBe('athyg:4.0:1440825');
    await a.evaluate(() => window.dispatchEvent(new CustomEvent('ReturnToBase')));
    await expect.poll(async () => (await snapshot(a)).world.travel.atHome, { timeout: 12000 }).toBe(true);
    await expect.poll(async () => (await snapshot(a)).world.players.remote).toBe(1);
    await a.getByRole('combobox', { name: 'System destination', exact: true }).click();
    await a.getByRole('option', { name: 'Mars', exact: true }).click(); await a.getByRole('button', { name: 'CRUISE', exact: true }).click();
    await expect.poll(async () => (await snapshot(a)).world.travel.cruising).toBe(true);
    await expect.poll(async () => (await snapshot(a)).world.travel.status, { timeout: 65000 }).toContain('Destination reached');
    await expect.poll(async () => (await snapshot(a)).flightInputBlocked).toBe(false);
    await mkdir('.multiplayer-evidence', { recursive: true });
    await a.screenshot({ path: `.multiplayer-evidence/${info.project.name}-mars.png` });
    await writeFile(`.multiplayer-evidence/${info.project.name}-browser.json`, JSON.stringify({ initialA, initialB, moved, final: await snapshot(a), errors }, null, 2));
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    // An abrupt tab close intentionally keeps the ship in the world for the 20s reconnect window.
    await expect.poll(async () => (await (await fetch('http://127.0.0.1:2567/metrics')).json()).players, { timeout: 24000 }).toBe(0);
  }
});
