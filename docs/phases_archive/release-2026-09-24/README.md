# September 24 source publication and deployment

## Source scope

Includes the authoritative Colyseus implementation and subsequent flight/cruise/camera, map, weapon, mobile, generator and workshop work. The workshop and shared content labels are now English. Existing user project names and stored parameters are preserved.

Documentation has been reorganized in English with getting-started, architecture, workshop, multiplayer, catalogue, deployment and contribution guides, a real screenshot gallery, changelog and a current roadmap. Historical reports have concise English summaries; original working documentation is backed up locally. Temporary recordings, source copies, verbose per-frame measurements and credentials are excluded from Git.

## Verification before publication

- 142 unit tests across 31 files; frontend/backend TypeScript and the space-only guard.
- Seven-system/32-world physical baseline checked against original data. Only display labels changed. The dedicated physics fixture excludes labels and retains original full-snapshot hashes for provenance.
- Local WebSocket integration at a 50-player cap: identity, origin/admission rules, proxy/private metrics, prediction, simulated RTT 180, reconnect and rejection of client 51.
- English workshop HIGH/LOW: all 17 types, layered rendering, history/parents, projects/reload, JSON preservation/rejection and local flight.
- All 69 FX, four model choices and four projectile presentations in HIGH/LOW.
- Mobile editor in 390×844 and 844×390; independent two-thumb movement/steering/fire.
- English page language and interface labels/options across all 17 object inspectors.
- Production-dependency audit: zero reported vulnerabilities at preparation time.
- Documentation language and local-link check.

Compact results: [network](network.json), [workshop](workshop.json), [mobile](mobile.json), [catalogue](catalogue.json), [English interface](english-ui.json). Main dist, the portable archive and user browser storage remain untouched.

## Publication / deployment status

**Published and deployed.** Installed source: [`7a2c2f407cbfaa916018e47588047f00afba5462`](https://github.com/MooradXO/universe-explorer/commit/7a2c2f407cbfaa916018e47588047f00afba5462). The main branch was updated without rewriting history and independently checked with `git ls-remote`. The [GitHub Verify run](https://github.com/MooradXO/universe-explorer/actions/runs/36031023152) passed. A separate clean checkout with fresh dependencies also passed all 142 tests, both TypeScript checks, the production build and documentation checks. All 77 published Markdown files passed the English/local-link check.

The repository About section now has an English description, live homepage and project topics. README includes real flight, map and workshop screenshots.

Deployment completed **2026-09-24 at 17:07:36 UTC**. Both release links select `20260924-7a2c2f4`. Client build settings are `VITE_MULTIPLAYER_URL=wss://universe.projectai.biz/multiplayer` and `VITE_LEGACY_REALTIME=false`. Production dependencies were installed on Linux from the committed lockfile. Archive hashes were verified before extraction.

| Artifact | SHA256 |
| --- | --- |
| Frontend archive | `2b40dd61175a9352f9fa8692ce59af51e3c23cd51ed0864df861ceece88cc534` |
| Backend source archive | `ba473f9c65ec84affa8556e204eb9e197c25ac29140fb17997261b878dab04d4` |
| `main-D-MSJXpr.js` | `3e2f5cd7572cf9ae18d56ca6ac04760402f896c9dee258fd5f3bc9f22958376b` |
| `environments-Cf9vsOIZ.js` | `688b6a0ae259e718bfbd39fe196600d9c685d2957715ab3f8566df52ae653163` |

## Installed checks

- Candidate backend passed a single-client WebSocket/decoded-state check on loopback port 2579, with in-memory guest state, a 50-player cap and origin rejection. The temporary process exited cleanly.
- The existing guest file was read successfully by the new code before switching. A second backup was taken after gracefully stopping the old multiplayer service.
- Zero players were connected at the switch. The restarted service is healthy with a cap of 50 and no subsequent restarts during verification.
- Live HTML and every directly referenced bundle/style were byte-checked against the candidate build: 11 assets for the game entry and seven for the workshop entry.
- Public menu and English Jupiter workshop loaded in HIGH and LOW with no page errors. These browser checks opened no public game WebSocket connections.
- Public multiplayer health and Proxima catalogue search returned success. Public metrics, missing assets and `.env` requests returned 404. The previous hashed main bundle remains available for already-open clients.
- Catalogue process, Nginx/Universe service configuration hashes, all neighbouring virtual-host hashes, nine container identities and 22 neighbouring/catalogue process identities remained unchanged. No Nginx reload was needed; `nginx -t` passed.
- Main local dist/index, its protected main bundle and the portable ZIP retained their pre-release hashes. User browser tabs/storage were not modified.

Machine-readable public checks: [public-check.json](public-check.json). No public combat, microphone, voice or load test was run. The 50-player admission check is not a sustained Internet load guarantee.

Historical service logs contained 400 failures before this release, last recorded September 22 at 11:23:06 UTC, caused by `ENOSPC` during temporary writes. At deployment, the filesystem had approximately 75 GB available and 89% free inodes. The new Linux startup check passed; this release did not perform unrelated server cleanup.

## Backup and rollback

Backup directory: `/var/backups/universe-explorer/release-20260924-7a2c2f4/`. It holds previous release references, Universe service/proxy configuration, guest snapshots, uploaded archives and private operational verification. Credentials and guest state are not in Git.

Both previous releases remain at `20260919-colyseus-v3`. The catalogue server directory was retained unchanged in the frontend release, and the catalogue service was not restarted. Rollback references and existing paths were verified; a live rollback was not exercised after successful deployment.

For an operator-authorized rollback, restore the two links atomically, then restart only multiplayer:

```sh
set -eu
test -d /var/www/universe-explorer/releases/20260919-colyseus-v3/public
test -d /var/www/universe-multiplayer/releases/20260919-colyseus-v3/server
ln -s /var/www/universe-explorer/releases/20260919-colyseus-v3 /var/www/universe-explorer/current.rollback
mv -Tf /var/www/universe-explorer/current.rollback /var/www/universe-explorer/current
ln -s /var/www/universe-multiplayer/releases/20260919-colyseus-v3 /var/www/universe-multiplayer/current.rollback
mv -Tf /var/www/universe-multiplayer/current.rollback /var/www/universe-multiplayer/current
systemctl restart universe-multiplayer.service
curl --fail http://127.0.0.1:2567/health
curl --fail http://127.0.0.1:4312/healthz
```

Keep the current guest file and catalogue data. No save migration, proxy change or global service restart is part of this rollback. Inspect newer deployment records before using these references for a later release.
