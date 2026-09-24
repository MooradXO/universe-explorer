# Deployment

Public game: https://universe.projectai.biz/

Current client source: `f4ceaf752f70799ce61ba2474ddc13a90d31974e`, release `20260924-f4ceaf7`, deployed September 24, 2026 at 17:53 UTC. The multiplayer backend and catalogue service remain on the unchanged `20260924-7a2c2f4` implementation. See the [client hotfix record](phases_archive/multiplayer-visual-hotfix-2026-09-24/README.md) for its verification and rollback, and the [initial release record](phases_archive/release-2026-09-24/README.md) for the backend installation. Later documentation-only commits do not require rebuilding these releases.

Deploy only the Universe virtual host and its dedicated services. Keep catalogue data, guest saves and other hosted projects intact. Source publication and deployment are separate operations; the deployment report records which commit is actually installed.

## Layout

| Path / service | Purpose |
| --- | --- |
| `/var/www/universe-explorer/releases/<release>/public/` | Vite client build |
| `/var/www/universe-explorer/releases/<release>/server/` | Catalogue service code and dependencies |
| `/var/www/universe-explorer/current` | Active client/catalogue release link |
| `/var/www/universe-multiplayer/releases/<release>/` | Colyseus code and Linux dependencies |
| `/var/www/universe-multiplayer/current` | Active multiplayer release link |
| `/var/lib/universe-explorer/map-v1/` | Manifest, search.sqlite and map tiles |
| `/var/lib/universe-explorer/online-cache/` | Bounded 32 MiB scientific-response cache |
| `/var/lib/universe-multiplayer/guests.json` | Persistent guest state; never publish |
| `/opt/universe-explorer/runtime/node-v24.19.0-linux-x64/` | Dedicated runtime, separate from system Node |
| `universe-catalog.service` | Catalogue API on loopback 4312 |
| `universe-multiplayer.service` | Colyseus on loopback 2567 |

The existing service user is `universe-explorer`. Catalogue limits are 512 MiB and half a CPU core. Multiplayer limits are 1536 MiB and 150% CPU; **MULTIPLAYER_MAX_PLAYERS=50**. These limits do not guarantee capacity.

Templates: [catalogue service](../deploy/universe-catalog.service), [multiplayer service](../deploy/universe-multiplayer.service), [multiplayer proxy](../deploy/multiplayer.nginx.conf.example). Inspect the installed configuration before applying templates.

## Release procedure

1. Record the source commit. Run unit tests, both TypeScript checks, the space-only guard, production build and isolated browser/network checks.
2. Build the client with `VITE_MULTIPLAYER_URL=wss://universe.projectai.biz/multiplayer` and `VITE_LEGACY_REALTIME=false`. Do not include environment secrets.
3. Inspect current release links, service health, storage, CPU/memory and the Universe proxy. Record neighbouring virtual-host checksums and service/container identities.
4. Back up both current release references, the Universe Nginx configuration and persistent guest state. Retain the previous releases.
5. Upload new, separately named releases. Verify archive SHA256. Install production dependencies with `npm ci --omit=dev` on Linux; do not upload Windows node_modules.
6. Reuse the existing verified catalogue data. If catalogue code has not changed, retain its running service and configuration.
7. Validate the new backend on an isolated loopback port with separate guest state. Validate the candidate frontend in isolated browser contexts. Do not run combat, microphone or load tests against public players.
8. Switch only the relevant current links and restart only the changed Universe service. Backend changes can briefly disconnect clients; verify reconnection compatibility before the switch.
9. Run `nginx -t` if its configuration changed; use a graceful reload only when needed.
10. Verify HTTPS entry/assets, catalogue endpoints and multiplayer health. Compare the installed build/source hashes, capacity setting and neighbouring services. Record the release, checks and rollback references.

## Health checks

```sh
systemctl is-active universe-catalog.service universe-multiplayer.service
curl --fail http://127.0.0.1:4312/healthz
curl --fail http://127.0.0.1:2567/health
curl --fail 'https://universe.projectai.biz/__catalog/search?q=Proxima'
nginx -t
```

Keep metrics restricted to loopback. Do not log WebSocket reconnect query tokens, service environments, passwords or guest files.

## Rollback

Restore the previous client and multiplayer release links atomically, then restart only the multiplayer service if its code changed. Restore the Universe Nginx backup only if the release changed that configuration; validate it before reload. Keep guest state unless a separately verified migration requires its backup. Never erase catalogue data or release directories as part of routine rollback.

The initial September 19 catalogue backup is under `/var/backups/universe-explorer/2026-09-19/`. The subsequent Colyseus backup is under `/var/backups/universe-explorer/colyseus-20260919/`. Later releases must record their own backup locations.

No global PM2/Docker restart, system Node replacement or changes to unrelated virtual hosts are needed.

See [MULTIPLAYER.md](MULTIPLAYER.md), [CATALOG_PIPELINE.md](CATALOG_PIPELINE.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).
