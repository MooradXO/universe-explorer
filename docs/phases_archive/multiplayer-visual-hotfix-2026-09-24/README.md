# Multiplayer visual hotfix — September 24, 2026

## Reported issues and fixes

- Network cruise applied each 10 Hz server quaternion directly to the rendered ship. The client now advances automatic rotation at the same bounded 1.2 rad/s rate on every frame. Remaining rotation offset fades when returning to manual control, while new steering applies immediately. Arrival/reconnect resets presentation history. Position smoothing uses an exponential factor independent of frame rate.
- Instanced ship geometry omitted the GLB mesh-to-root transform. The current player model contains an internal scale of 100, so its remote width was approximately 2.05 units instead of 205.43. Instancing now bakes the internal transform into a geometry clone, preserving the configured outer ship transform and the shared local model geometry.
- Read-only diagnostics expose actual engine-frame duration and remote mesh dimensions/counts so browser tests verify rendered ships and turns, not just received player names.

Protocol, combat rules, saved state and the server's numerical turn rate are unchanged. Only the client release needs replacing; the multiplayer and catalogue processes can remain running.

## Verification

- 150 unit tests across 32 files, both TypeScript checks, space-only guard and production build passed.
- New regressions cover 10 Hz updates at 20/30/60/120 FPS, left/right reversals, quaternion signs, manual-control handoff, reset and actual player GLB scale. Shared model geometry remains unchanged.
- Two real isolated browser guests in HIGH desktop and LOW mobile emulation, with 240 ms simulated round-trip latency: the remote ship is rendered at the expected size and receives weapon damage; cruise turns stay within 1.2 rad/s per engine frame; camera offset remains bounded and STOP restores manual control. No page errors.
- The pre-fix browser capture showed a 2.05-unit remote model width and 0.12-radian jumps on incoming snapshots. After correction, the width is 205.43 units and turns advance over intervening render frames.

Compact result: [verification.json](verification.json). Raw frame measurements and comparison screenshots remain local under `.release-work/ship-visual-before/` and `.release-work/ship-visual-after/`. Browser emulation does not establish performance on every physical phone. No public combat, voice or load test was run.

## Reproduction

Build a separate client with `VITE_MULTIPLAYER_URL=ws://127.0.0.1:2577` and `VITE_LEGACY_REALTIME=false`; serve it at `http://127.0.0.1:3030`. Then run:

```sh
node --import tsx scripts/multiplayer/ship-visual-regression.ts
```

The script starts its own in-memory backend on loopback port 2577 and closes its browser contexts/server. `VISUAL_PREVIEW_URL` accepts only a loopback host; `VISUAL_EVIDENCE` chooses the output directory. `VISUAL_BASELINE=true` records the old visual behaviour without asserting the fixed width and angular-speed limits.

## Deployment

Published source: [`f4ceaf752f70799ce61ba2474ddc13a90d31974e`](https://github.com/MooradXO/universe-explorer/commit/f4ceaf752f70799ce61ba2474ddc13a90d31974e). Remote main was independently verified and [GitHub Verify passed](https://github.com/MooradXO/universe-explorer/actions/runs/36037164779).

Installed **2026-09-24 at 17:53:20 UTC** as `/var/www/universe-explorer/releases/20260924-f4ceaf7`. Main client: `main-DD8BFON6.js`, SHA256 `984ec4d2c3ccb6e845c6945126988e0f11a008514c2950e95a77648421fd6843`. Build uses `VITE_MULTIPLAYER_URL=wss://universe.projectai.biz/multiplayer` and `VITE_LEGACY_REALTIME=false`.

Only seven changed frontend files were uploaded in a 103,037-byte archive (SHA256 `a7fd8fd2f408c81517b5aebc2d7d421585339f9c82f912a1372f05f46a0a6ed1`). A separate release was copied from the previous version and patched, then **all 202 candidate files** were verified against the local production build before switching the frontend symlink. Previously hashed assets remain available for existing tabs.

Both Universe service process IDs/restart counts, the backend release link, all Nginx virtual-host hashes, service configuration and neighbouring container identities remained unchanged. No service restart or Nginx reload was performed. Persistent guest and catalogue data were not rewritten by the deployment. The production cap remains 50.

Public game/workshop HTML and referenced asset hashes matched the build. HIGH/LOW menu and English workshop loaded without page errors or public game WebSocket connections; multiplayer health, catalogue search and private-path checks passed. See [public-verification.json](public-verification.json).

Backup: `/var/backups/universe-explorer/hotfix-20260924-f4ceaf7/`. Previous client: `/var/www/universe-explorer/releases/20260924-7a2c2f4`. To roll back this client hotfix, atomically restore only the frontend link:

```sh
set -eu
test -d /var/www/universe-explorer/releases/20260924-7a2c2f4/public
ln -s /var/www/universe-explorer/releases/20260924-7a2c2f4 /var/www/universe-explorer/current.rollback
mv -Tf /var/www/universe-explorer/current.rollback /var/www/universe-explorer/current
curl --fail https://universe.projectai.biz/
```

The backend requires no restart for this rollback. Existing browser tabs need a manual page refresh to load the newly selected client. Rollback references were retained and checked; a live rollback was not necessary.
