import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const evidence = 'docs/phases_archive/flight-feedback-2026-09-16';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  await page.goto('http://127.0.0.1:3001/');
  await page.locator('#btn-start-game').click(); await page.locator('#btn-guest-login').click();
  const select = page.getByLabel('Объект системы', { exact: true });
  await select.waitFor(); await page.waitForTimeout(1500);
  // Real pointer opens Chromium's popup. :open exposes its actual state.
  const samples = [];
  for (const guard of [false, true]) {
    if (guard) await select.evaluate(el => {
      const property = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
      Object.defineProperty(el, 'disabled', { get() { return property.get.call(this); },
        set(value) { if (property.get.call(this) !== value) property.set.call(this, value); } });
    });
    await select.click();
    const opened = await select.evaluate(el => el.matches(':open'));
    await page.waitForTimeout(1400);
    const held = await select.evaluate(el => el.matches(':open'));
    await page.screenshot({ path: `${evidence}/dropdown-${guard ? 'guard' : 'before'}.png` });
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    samples.push({ guard, opened, held, value: await select.inputValue() });
    await page.keyboard.press('Escape');
  }
  await writeFile(`${evidence}/dropdown-probe.json`, JSON.stringify(samples, null, 2));
  console.log(JSON.stringify(samples));
} finally { await browser.close(); }
