# Debugging and verification

## Read-only diagnostics

window.__UNIVERSE_DEBUG__ provides a version, snapshot() and planets() in development and production. Results are deeply frozen and expose no live scene/renderer/ship references, credentials or voice payloads.

```js
const state = window.__UNIVERSE_DEBUG__.snapshot();
console.table(state.renderer);
console.log(state.fps, state.frameTimeMs, state.p95FrameTimeMs);
console.log(state.world, state.realtime);
const planets = window.__UNIVERSE_DEBUG__.planets();
```

| Field | Meaning |
| --- | --- |
| fps / frameTimeMs / p95FrameTimeMs | Last 180 nonzero frames, before the 50 ms simulation clamp; not GPU queries |
| lastFrameTimeMs | Most recent engine frame duration, before the simulation clamp; use this to measure rendered movement rather than the timing of a later debug callback |
| renderer | Frame draw counts, WebGL resource counts, buffer size and pixel ratio |
| memory | JS heap when supported; gpuBytes is null |
| starMap | Selection, camera/centre/scale, blocks/cache/requests/errors and point budgets |
| world.ship | Positions, world address, camera offset, speed, health and mobile input copy |
| world.remoteVisuals | Detailed player/bot instance counts, distant ships and the baked player model dimensions at its configured scale |
| world.space | Floating origin, streaming/cache/jobs, navigation batches and resource lifecycle |
| world.flightDust / flightFX | Motion samples, readiness, positions, particles and effect budgets |
| world.travel | System address, target, cruise/warp status and surveyed sites |
| realtime | Transport, state, epoch, input acknowledgement, prediction queue and corrections |

WebGL counters represent uploaded resources, not all allocated JS objects. Heap is GC-dependent and is not GPU memory. Network counters are not delivery receipts or provider billing. Stellar-flight planet positions are star-relative at 10 km/unit; legacy fixtures use sector-relative positions. Offline saves remain separate from online guest state.

## Explicit fixtures

After guest entry:

- /?spaceSmoke=near-base: ship [0,100,9800], base [0,0,8000].
- /?spaceSmoke=planet-showcase: first legacy catalogue planet.
- /?spaceSmoke=sector-boundary: start near [0,0,-24950].
- /?spaceSmoke=sector-tour: six scheduled relocations, including a distant sector and returns home.

Only sector-tour relocates automatically. Unknown fixture names are ignored. Normal / starts at the Solar System base or restores a saved address. /visual-lab.html?locations=1 contains experimental location previews; /environments.html is the current workshop.

## Run checks

```sh
npm ci
npm test
npm run multiplayer:check
npm run build
npx playwright install chromium
npm run test:smoke
```

On Windows, PLAYWRIGHT_CHANNEL=msedge selects installed Edge. scripts/run.ps1 can use the original workspace's portable npm.

Browser tests use one worker. UNIVERSE_TEST_PORT and UNIVERSE_TEST_OUT_DIR select an isolated preview and matching fresh build; never test stale output as current source. Catalogue/travel tests require prepared map-v1 data, absent from Git. SMOKE_PHASE and SECTOR_EVIDENCE select evidence destinations; preserve earlier comparisons.

Specialized scripts/multiplayer checks cover cruise, warp, weapons, touch input, generator compatibility and workshop composition/catalogue/projects/flight. Inspect each script's local ports and output paths before running it.

Use fresh browser contexts, not an open user game or its storage. Public checks remain passive menu/assets/catalogue/health checks. Combat, microphones and load run on isolated services. HIGH/LOW and mobile emulation do not establish real-phone FPS or internet capacity. LAN helpers need a currently valid local address; microphone access normally requires HTTPS or localhost.
