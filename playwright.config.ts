import { defineConfig } from '@playwright/test';

const port = Number(process.env.UNIVERSE_TEST_PORT || 3000);

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: { args: ['--enable-precise-memory-info'] },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-high', use: { viewport: { width: 1440, height: 810 } } },
    { name: 'mobile-low', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } },
  ],
  webServer: {
    command: `node --use-system-ca node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
