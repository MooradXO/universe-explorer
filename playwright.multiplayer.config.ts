import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/multiplayer-browser', workers: 1, fullyParallel: false, timeout: 150000,
  outputDir: '.multiplayer-evidence/browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:3012', channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
  projects: [ { name: 'HIGH', use: { viewport: { width: 1440, height: 810 } } },
    { name: 'LOW', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } } ],
  webServer: [
    { command: 'node --import tsx server/index.ts', url: 'http://127.0.0.1:2567/health', reuseExistingServer: true },
    { command: 'node node_modules/vite/bin/vite.js preview --outDir .colyseus-dist --host 127.0.0.1 --port 3012 --strictPort', url: 'http://127.0.0.1:3012', reuseExistingServer: true },
  ],
});
