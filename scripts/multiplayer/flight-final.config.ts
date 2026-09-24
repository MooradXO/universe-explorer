import { defineConfig } from '@playwright/test';
import base from '../../playwright.multiplayer.config';
/** Uses the already-built isolated preview; each test owns a stateless backend on 2577. */
export default defineConfig({ ...base, testDir: '../../tests/multiplayer-browser', webServer: undefined,
  outputDir: '../../docs/phases_archive/warp-transition-2026-09-24/browser-artifacts',
  use: { ...base.use, launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] } },
});
