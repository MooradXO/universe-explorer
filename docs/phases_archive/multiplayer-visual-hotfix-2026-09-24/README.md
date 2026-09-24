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

Source commit, installed client release and passive verification will be recorded after publication. The previous client release remains available for rollback. Both existing Universe services and persistent data are retained.
