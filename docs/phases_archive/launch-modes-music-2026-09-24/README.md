# Orbital launch, separated modes and original music

Completed locally on September 24, 2026. No production access, SSH, deployment, Git commit or push. Existing production remains unchanged.

The launch screen now has Exploration/PvP selection, a pilot-name field and music controls. Its dedicated scene uses the existing carrier/scout models and the same planet renderer as the game. Legacy black-hole geometry cannot enter this view. The scout follows a path below the carrier and away from Earth; idle animation no longer overwrites its departure position. Cleanup retains the shared GLTF resources needed during flight. The scene supports HIGH/LOW, portrait menus and reduced motion.

Exploration and PvP run in distinct canonical Colyseus rooms with one shared admission cap. Ships, chat and proximity voice stay within the selected mode. Exploration rejects weapons and hostile bots and suppresses combat damage. Existing PvP identities/saves remain compatible; peaceful state and offline journals have separate storage. SYSTEM returns to launch, including during a connection loss. Reloading and choosing another mode releases this tab's former reconnect reservation.

**Far Horizons** is an original eight-chord Web Audio score with pads, sparse melody, stereo echo and reverb. Music has persistent volume/on-off controls on the launch screen and in SYSTEM, gesture activation, bounded scheduled voices and hidden-tab suspension. It uses no external recording or streaming service. Optional web fonts no longer block launch-screen rendering.

## Verification

- 152 unit tests across 33 files; frontend and backend TypeScript checks; space-only guard and production builds PASS.
- Existing real-WebSocket integration PASS, including 100-client local admission/rejection, proxy/origin rules, identity, input acknowledgement, signalling and reconnect.
- New mode integration PASS: same-mode visibility; cross-mode isolation; peaceful fire/bot rejection; real PvP damage; cruise; reconnect; independent saves; duplicate identity rejection; shared capacity and concurrent joins; seat release.
- Built-client browser checks PASS in HIGH and LOW: multiple guests, 360 sampled departure frames without carrier intersection, more than 1,397 units of conservative planet clearance, mode switching through SYSTEM and reload, music preference persistence, reduced motion and exit during disconnect. No page errors.
- Menu layout reviewed at 1440×900, 844×390, 568×320 and 390×844. The final 568×320 layout fits without scrolling. The portrait rotation blocker appears only after launch.
- Solo offline HIGH/LOW respects peaceful and combat rules. Existing two-thumb flight/steering/fire regression tests PASS at 844×390 LOW and 568×320 HIGH.
- 50 seconds of the actual score rendered through Chromium OfflineAudioContext at 24 kHz: peak 0.1713, RMS 0.02252 at default 45% volume, audible signal across every sampled phrase and no digital clipping. Gesture activation reaches a running AudioContext. Physical phone speakers and subjective listening preference remain for user review.
- Protected main dist and the portable ZIP retain their prior SHA-256 values. User tabs/storage and catalogue data were not changed. Test guests used disposable/local memory stores.

## Local review

The prepared production-style preview runs at **http://127.0.0.1:3032/** with a loopback backend on port 2582, two modes, a shared 50-player cap and hostile bots disabled. This preview uses memory-only online saves and is separate from the public game. Local screenshots and detailed diagnostics are in ignored `.release-work/launch-review/`; the built frontend is `.release-work/launch-build/`. The ordinary dist and portable export were not rebuilt.

Repeat network mode verification with `node --import tsx scripts/multiplayer/modes-integration.ts`. The built-client flow is `node scripts/multiplayer/launch-browser.mjs` against the prepared local preview. [Machine-readable summary](verification.json) · [Mode and music guide](../../GAME_MODES.md) · [Completed checklist](../../plans/launch-modes-music-2026-09-24.md).

There are still no three-small/three-large ship selectors: those need the separately proposed user-supplied models. This milestone does not publish workshop scenes or change the public server.
