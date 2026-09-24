import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'docs/phases_archive/warp-transition-2026-09-24/reference';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(process.env.REFERENCE_URL || 'https://www.youtube.com/watch?v=01z0nGEGuG4', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const reject = page.getByRole('button', { name: /Reject all|Отклонить все/ }).first();
  if (await reject.isVisible()) await reject.click();
  if (page.url().includes('/results')) {
    console.log(JSON.stringify(await page.locator('a#video-title').evaluateAll(links => links.slice(0, 16).map(a => ({ text: a.textContent, href: a.href })))));
    await browser.close(); process.exit(0);
  }
  await page.locator('video').waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('video').evaluate(v => { v.muted = true; void v.play().catch(() => {}); });
  await page.waitForTimeout(5000);
  const info = await page.locator('video').evaluate(v => ({ duration: v.duration, readyState: v.readyState, currentTime: v.currentTime, error: v.error?.message }));
  console.log(JSON.stringify({ info, title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 2000) }));
  await writeFile(`${dir}/source.json`, JSON.stringify({ url: page.url(), title: await page.title(), ...info }, null, 2));
  await page.screenshot({ path: `${dir}/page.png` });
  if (info.readyState >= 2 && info.duration > 5) {
    const times = process.env.REFERENCE_TIMES ? process.env.REFERENCE_TIMES.split(',').map(Number) : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    for (const t of times.filter(t => t < info.duration)) {
      await page.locator('video').evaluate((v, t) => { v.pause(); v.currentTime = t; }, t);
      await page.waitForFunction(t => { const v = document.querySelector('video'); return v && !v.seeking && Math.abs(v.currentTime - t) < .05 && v.readyState >= 2; }, t);
      await page.waitForTimeout(650);
      await page.locator('video').screenshot({ path: `${dir}/frame-${t}.png` });
    }
  }
} finally { await browser.close(); }
