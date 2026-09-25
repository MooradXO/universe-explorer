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

**Published and deployed.** Source [`15be0749be37f6989b148c6080027c3427d825f0`](https://github.com/MooradXO/universe-explorer/commit/15be0749be37f6989b148c6080027c3427d825f0) was pushed to main without rewriting history and independently verified. [GitHub Verify passed](https://github.com/MooradXO/universe-explorer/actions/runs/36113233710), including a fresh Linux dependency installation, tests, types, build and documentation checks. Later documentation-only commits do not change the installed game code.

Both frontend and multiplayer links select `20260925-15be074`, installed **2026-09-25 at 08:32:16 UTC**. Client entry: `main-CPro2Weu.js`. All 202 candidate frontend files were checked against the production build; only nine changed files needed uploading. Previous hashed assets remain available to existing tabs. Users must refresh to load the new menu and mode selection.

| Artifact | SHA256 |
| --- | --- |
| Frontend overlay archive | `690f4ccf0e8152f94901fcac518416443713e9770bfefc06cf69f7bbe5dd0aa5` |
| Backend source archive | `3681aca0f0ba4e0729d6fd22d9c950cec410e801b32f1c331833d1f0117a382c` |
| Full frontend manifest | `ec1220355b478a2e87534d99f98cb82e5256607eff38cc355c2f2909e5e87601` |
| Main client bundle | `f7a53efbfc9a510ea78993b39b46b16863155aad8544169393d76cb78aa4dc53` |

## Installed verification

- Linux production dependencies installed from the committed lockfile. A separate loopback candidate with in-memory saves passed joins/decoded state for both modes, peaceful fire rejection, capacity 50 and origin rejection before switching.
- Existing guest storage was read for compatibility. A second backup was taken after graceful shutdown. All 17 guest identities and existing PvP saves remained equal after installation.
- No players were connected at the switch. Only multiplayer restarted; it is active with no subsequent restart and both canonical modes under the shared cap of 50.
- Public game/workshop HTML and all directly referenced asset hashes match the build. HIGH desktop and LOW mobile orbital menu/mode selection and English Jupiter workshop checks passed with no page errors. These passive public checks did not join gameplay or run combat, microphone or load tests.
- Public two-mode health and catalogue search pass; metrics, missing assets and `.env` remain inaccessible. Previous client assets remain available.
- Catalogue process identity, Universe service/proxy configuration, neighbouring virtual-host hashes and container identities remained unchanged. No Nginx reload or unrelated service restart was needed.
- Protected local main dist and portable ZIP remain unchanged; local review on port 3032 remains available.

[Public verification](public-check.json).

## Backup and rollback

Backup: `/var/backups/universe-explorer/release-20260925-15be074/`. It contains prior release references, configuration copies, guest snapshots, upload hashes and operational checks. These private files and credentials are excluded from Git.

Previous frontend: `20260924-f4ceaf7`. Previous multiplayer: `20260924-7a2c2f4`. An operator-authorized rollback can restore both links and restart only multiplayer:

```sh
set -eu
test -d /var/www/universe-explorer/releases/20260924-f4ceaf7/public
test -d /var/www/universe-multiplayer/releases/20260924-7a2c2f4/server
ln -s /var/www/universe-explorer/releases/20260924-f4ceaf7 /var/www/universe-explorer/current.rollback-20260925
mv -Tf /var/www/universe-explorer/current.rollback-20260925 /var/www/universe-explorer/current
ln -s /var/www/universe-multiplayer/releases/20260924-7a2c2f4 /var/www/universe-multiplayer/current.rollback-20260925
mv -Tf /var/www/universe-multiplayer/current.rollback-20260925 /var/www/universe-multiplayer/current
systemctl restart universe-multiplayer.service
curl --fail http://127.0.0.1:2567/health
curl --fail http://127.0.0.1:4312/healthz
```

Keep current guest and catalogue data. The previous backend offers only PvP; Exploration requires this release. Rollback references were checked; a live rollback was unnecessary.

## Known limitations and next work

- One active tab per guest identity. The generic connection warning also covers duplicate tabs; see the user guide for recovery.
- No first-flight tutorial, party/rendezvous flow or three-small/three-large ship selector yet.
- The 50-player cap is shared across both modes. Existing short load checks do not establish many-hour stability on every client or network.
- Physical phone performance and group play need closed-alpha feedback. Keep map and status indicators in Exploration as accepted by the user.
