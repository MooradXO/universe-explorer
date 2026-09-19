import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const evidence = 'docs/phases_archive/flight-feedback-2026-09-16';
test('distinct spatial proposals animate, rotate, change quality, and release resources on phone and desktop', async ({ page }, info) => {
  const low = info.project.name.includes('mobile'), issues: string[] = [];
  page.on('pageerror', e => issues.push(e.message)); page.on('console', m => { if (['error', 'warning'].includes(m.type())) issues.push(m.text()); });
  await page.goto(`/visual-lab.html?locations=1&quality=${low ? 'LOW' : 'HIGH'}`);
  const snap = () => page.evaluate(() => (window as any).__UNIVERSE_LOCATIONS__?.snapshot());
  await expect.poll(async () => (await snap())?.location).toBe('ice');
  await mkdir(evidence, { recursive: true }); const states = [];
  for (const id of ['ice', 'yard', 'rift']) {
    await page.locator(`[data-location=${id}]`).click(); await page.waitForTimeout(400);
    const first = await snap(); await page.waitForTimeout(800);
    const next = await snap(); expect(first.camera).not.toEqual(next.camera);
    expect(next.quality).toBe(low ? 'LOW' : 'HIGH'); states.push(next);
    await page.screenshot({ path: `${evidence}/${info.project.name}-${id}.png`, fullPage: true });
  }
  await page.locator('[data-location=ice]').click(); await page.waitForTimeout(250); const baseline = await snap();
  for (let i = 0; i < 3; i++) {
    for (const id of ['yard', 'rift', 'ice']) await page.locator(`[data-location=${id}]`).click();
    await page.waitForTimeout(100); const current = await snap();
    expect(current.geometries).toBe(baseline.geometries); expect(current.textures).toBe(baseline.textures);
  }
  await page.locator('#flight').click(); expect((await snap()).flight).toBe(false);
  const paused = await snap(); await page.waitForTimeout(300);
  (await snap()).camera.forEach((value: number, axis: number) => expect(value).toBeCloseTo(paused.camera[axis], 6));
  const canvas = page.locator('#stage canvas'); const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .6, { steps: 10 }); await page.mouse.up();
  expect((await snap()).camera).not.toEqual(paused.camera);
  await page.locator('#quality').selectOption(low ? 'HIGH' : 'LOW'); expect((await snap()).quality).toBe(low ? 'HIGH' : 'LOW');
  await page.locator('#quality').selectOption(low ? 'LOW' : 'HIGH');
  if (low) {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['ice', 'yard', 'rift']) { await page.locator(`[data-location=${id}]`).tap(); expect((await snap()).location).toBe(id); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/locations-portrait.png`, fullPage: true });
  }
  expect(issues).toEqual([]); await writeFile(`${evidence}/${info.project.name}-locations.json`, JSON.stringify({ states, issues }, null, 2));
});
