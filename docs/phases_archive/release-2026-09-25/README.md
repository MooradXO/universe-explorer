# September 25 orbital launch and game-mode release

## Scope

User-approved local work: orbital launch, pilot names, separate Exploration/PvP sessions and saves, original ambient music, and persistent first-person hull/shield/boost indicators without a 3D cockpit. Exploration retains the map and ship indicators. No additional proposed gameplay features are part of this release.

The server enforces peaceful weapon/bot rejection, mode-local players/chat/voice and one shared 50-player production admission cap. Existing PvP guest state remains compatible; Exploration uses a separate field. Detailed implementation checks: [launch milestone](../launch-modes-music-2026-09-24/README.md). [User guide](../../GAME_MODES.md).

## Verification

- 152 unit tests across 33 files; frontend/backend TypeScript and space-only source guard passed.
- Isolated WebSocket integration passed at 50 players, including rejection of client 51, proxy/origin protection, identity, 50 Hz timing and reconnect.
- Mode integration passed: same-mode visibility, cross-mode separation, peaceful weapon/bot rejection, PvP damage, mode saves and shared admission under concurrent joins.
- First-person HUD passed four browser scenarios: HIGH desktop and LOW mobile, each in PvP and Exploration. Hull/shield/boost and reticle stay visible, boost readings update, repeated camera switching and closing SYSTEM restore the expected HUD. No page errors.
- Production frontend built with `wss://universe.projectai.biz/multiplayer` and legacy realtime disabled. Existing main dist and portable ZIP were not rebuilt.

[First-person browser results](first-person-hud.json). Earlier menu/music and two-thumb checks are linked in the implementation report above.

## Publication status

Release preparation is in progress. Publication and deployment are explicitly authorized; installed source, artifact hashes, verification and rollback references will be recorded here after completion. Do not treat a source push as confirmation that the public server has been updated.

## Known limitations and next work

- One active tab per guest identity. The generic connection warning also covers duplicate tabs; see the user guide for recovery.
- No first-flight tutorial, party/rendezvous flow or three-small/three-large ship selector yet.
- The 50-player cap is shared across both modes. Existing short load checks do not establish many-hour stability on every client or network.
- Physical phone performance and group play need closed-alpha feedback. Keep map and status indicators in Exploration as accepted by the user.
