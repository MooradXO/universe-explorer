import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'docs/art-direction/hud-redesign-2026-09-18';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(() => localStorage.setItem('universe_gfx_mode', 'HIGH'));
  await page.goto('http://127.0.0.1:3001/');
  await page.locator('#btn-start-game').click();
  await page.locator('#start-screen').waitFor({ state: 'detached' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${output}/current-flight.png` });
  const commands = page.locator('.top-command-bar');
  const layout = await commands.locator('button').evaluateAll(buttons => buttons.map(button => {
    const bounds = button.getBoundingClientRect();
    return { name: button.textContent.trim(), display: getComputedStyle(button).display, bounds: bounds.toJSON() };
  }));
  await commands.getByRole('button', { name: 'SYSTEM', exact: true }).click();
  await page.locator('[data-action="manual"]').click();
  const manual = await page.locator('.command-manual').evaluate(element => ({
    display: getComputedStyle(element).display,
    bounds: element.getBoundingClientRect().toJSON(),
    viewport: { width: innerWidth, height: innerHeight },
    parent: element.parentElement.getBoundingClientRect().toJSON(),
  }));
  await page.screenshot({ path: `${output}/current-manual.png` });
  await commands.getByRole('button', { name: 'BOUNTIES', exact: true }).click();
  await page.screenshot({ path: `${output}/current-bounties.png` });
  await commands.getByRole('button', { name: 'COMMS', exact: true }).click();
  await page.screenshot({ path: `${output}/current-comms.png` });
  await commands.getByRole('button', { name: 'COMMS', exact: true }).click();
  const hangarVisible = await page.locator('#btn-hangar').isVisible();
  if (hangarVisible) {
    await page.locator('#btn-hangar').click();
    await page.screenshot({ path: `${output}/current-hangar.png` });
    await page.locator('#btn-hangar-close').click();
  }
  await page.locator('#btn-star-map').click();
  await page.locator('#star-map-title').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${output}/current-map.png` });
  const report = { layout, manual, hangarVisible };
  await writeFile(`${output}/current-layout.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
