# Contributing

Keep changes focused and describe the player-visible problem, resulting behaviour and verification.

## Development

```sh
npm ci
npm test
npm run multiplayer:check
npm run build
```

Use Node.js 24.19+. Browser and catalogue integration tests require the setup in [DEBUG_API.md](docs/DEBUG_API.md) and [CATALOG_PIPELINE.md](docs/CATALOG_PIPELINE.md).

## Working conventions

- Preserve deterministic seeds, physical compatibility and existing saves.
- Keep authoritative decisions on the server; do not trust client positions or hits.
- Use explicit ship-local configuration: the player nose is -Z and engine exhaust is +Z.
- Verify visual/control changes on HIGH and LOW and include touch coverage when relevant.
- Dispose GPU resources and cancel stale asynchronous work.
- Write project documentation in English. Keep current instructions separate from dated evidence.
- Do not commit .env files, credentials, guest tokens/state, databases, build output or local recordings.
- Keep third-party attribution and licenses with their resources.
- Run browser/combat/voice/load tests on isolated local services, never against public players.
- Deployment needs an explicit release decision, a backup and a rollback route; source publication alone does not deploy.

## Reporting an issue

Include reproducible steps, expected/actual behaviour, browser/device, HIGH/LOW setting and whether the problem is local or online. A screenshot or sanitized read-only diagnostic snapshot is helpful. Do not include passwords, tokens or complete localStorage dumps.

Feature proposals belong in [ROADMAP.md](docs/ROADMAP.md) after discussion. User-supplied art should include its provenance and usage terms.
