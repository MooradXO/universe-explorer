# Authoritative multiplayer

The current source uses two canonical Colyseus rooms: `universe-v1` (PvP, preserving its existing identity) and `universe-exploration-v1` (peaceful Exploration). They share one configured player cap, including disconnected players in their reconnect grace period. The production admission cap is 50; the configurable local ceiling of 100 is not a guarantee of VPS capacity. See the [September 25 release record](phases_archive/release-2026-09-25/README.md) for deployment status.

## Local setup

Use Node.js 24.19+ and `npm ci`. Prepare catalogue data separately for interstellar travel.

```sh
npm run multiplayer:build
npm run multiplayer:dev
# Another terminal:
npm run multiplayer:preview
```

The client runs at http://127.0.0.1:3012/, backend at 127.0.0.1:2567. The separate `.colyseus-dist/` build preserves normal dist. Empty VITE_MULTIPLAYER_URL means offline flight. A configured but unavailable server shows reconnect rather than silently switching offline. VITE_LEGACY_REALTIME=true opts into the older Supabase transport only when no Colyseus URL is configured.

Server variables: MULTIPLAYER_HOST, MULTIPLAYER_PORT, MULTIPLAYER_ORIGINS, MULTIPLAYER_CATALOG, MULTIPLAYER_SAVE, MULTIPLAYER_BOTS and MULTIPLAYER_MAX_PLAYERS. Keep production on loopback behind its reverse proxy.

## Simulation

- Each mode contains active star-system simulations; inactive systems are released. No extra rooms are created when full. Admission is checked synchronously across both modes after authentication, including concurrent joins.
- Shared flight mathematics runs at 50 Hz; snapshots at 10 Hz per player, staggered over five steps.
- Local prediction replays unacknowledged inputs. Epoch changes handle travel, reconnect and queue overflow without permanently freezing controls.
- Interest radius: 16,000 units; exit radius: 18,000. One unit is 10 km. Other systems are not broadcast, and stationary nearby ships remain visible.
- Protocol v3 uses short IDs, changed metadata and binary records: 24 bytes/entity movement, 36 bytes/projectile. Remote positions use observer-relative 0.1-unit quantization; server physics and acknowledged self state retain full precision.
- Movement limits, shots, swept collision, damage, shields, death, rewards, repair and destinations are server-controlled. Client hits and positions are untrusted.
- Projectiles are sent on creation/removal, with homing corrections. Damage runs each step; hit notifications are aggregated per target for the next snapshot.
- In PvP, SpawnBots creates shared bots, up to 100, at most once per minute when the server allows it. Exploration rejects weapons and hostile bots on the server and does not apply combat damage.
- Cruise uses shared physical obstacles. Warp takes 2.4 seconds and requires a validated destination. Damage may interrupt travel.
- Text chat stays within a mode. Sonar and voice signalling also follow proximity/system rules. WebRTC audio travels between browsers, not through game WebSockets.
- Voice signalling uses a 512-message queue, paced at approximately 13/second, separate from flight input. Three seconds without snapshots blocks controls and triggers reconnect.

Physics, appearance and survey versions are independent. Older saves without metadata retain physical version 1. Unsupported physics is rejected during handshake; visual updates need not change physical positions, radii or colliders.

## Guest persistence

The server issues a random bearer token, stored separately from offline saves. Server storage retains token hashes and authoritative state. Client IDs/localStorage XYZ cannot claim or teleport another ship. New guests start at the base; offline positions are not imported as trusted online state.

Disconnected ships remain present for 20 seconds and are vulnerable in PvP. Reload/reconnect restores identity and mode; longer absences use stored state. One guest cannot occupy both modes at once. The old `state` field remains the PvP save; `exploration` stores the peaceful save independently. Offline positions, visited bodies and survey journals are also scoped by mode, preserving existing PvP storage keys. Switching modes after reloading releases the same tab's former reconnect reservation before joining.

Flushes occur every 30 seconds, on departure and graceful shutdown; crashes can lose up to the last 30 seconds. Limits: 10,000 guests, 30-day inactivity retention.

Never publish guest files, browser storage, reconnect query tokens or process environments.

## Verification

```sh
npm test
npm run multiplayer:check
npm run multiplayer:test
node --import tsx scripts/multiplayer/modes-integration.ts
npm run multiplayer:browser
```

Integration creates disposable loopback servers and checks identity, admission, proxy prefixes, origins, acknowledgement, forged actions, signalling, latency and reconnect. Set MULTIPLAYER_MAX_PLAYERS=50 to verify that the 51st client is rejected. Browser cases require a fresh build and prepared map where applicable.

The load tool accepts only local scenario settings: LOCAL_LOAD_SECONDS, LOCAL_LOAD_SIZES and LOCAL_LOAD_MODES. Evidence goes to ignored .multiplayer-evidence. **Never run combat, synthetic microphones or load tests against public players.**

## Evidence and limitations

On September 19, the VPS handled 50 combatants at 40.6% of one CPU core, approximately 50 Hz and 12.70 Mbit/s outgoing socket traffic. With 100 spawned bots: 52.35% and 21.17 Mbit/s. At 100 combatants one core reached approximately 98.9%, with degraded snapshot timing/input queues.

Common combat at 50 players is approximately 5.71 GB/hour total or 1.37 TB/month at eight hours/day. Downloads, catalogue requests, overhead and other services are additional. Short tests do not establish many-hour internet stability. [Dated report](phases_archive/colyseus-deploy-2026-09-19/README.md).

Two-browser voice tests do not establish 50 simultaneous speakers. Mesh/STUN has no dedicated TURN/SFU. Historical hit rewind for high latency is not implemented.

[Deployment and rollback](DEPLOYMENT.md). Upstream references: [Room](https://docs.colyseus.io/room), [Server](https://docs.colyseus.io/server), [Reconnection](https://docs.colyseus.io/room/reconnection), [Scalability](https://docs.colyseus.io/scalability). Versions are pinned in package-lock.json.
