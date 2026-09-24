import { spawnSync } from 'node:child_process';
const env = { ...process.env, VITE_MULTIPLAYER_URL: process.env.VITE_MULTIPLAYER_URL || 'ws://127.0.0.1:2567', VITE_LEGACY_REALTIME: 'false' };
for (const args of [['scripts/check-space-only.mjs'], ['node_modules/typescript/bin/tsc'],
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.colyseus-dist']]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1);
}
