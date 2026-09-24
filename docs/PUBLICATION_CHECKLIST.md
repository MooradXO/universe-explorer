# Publication checklist

Canonical repository: https://github.com/MooradXO/universe-explorer, branch main.

## Source release

- [x] Current gameplay, Colyseus, generation, workshop and regression sources are included.
- [x] Documentation distinguishes implemented features from proposed ship selection and game modes.
- [x] Existing resource attribution and license texts are retained.
- [x] Local .env files, databases, guest state, builds and recordings are excluded.
- [x] Production dependency audit reports no known vulnerabilities at preparation time.
- [x] Complete English documentation and English workshop verification.
- [x] Verify documentation links and a clean-clone source build.
- [x] Scan staged files for secrets and oversized accidental artifacts.
- [x] Commit and push without rewriting remote history; independently verify the remote SHA.

## Deployment

- [x] Record the source commit and build with the production multiplayer URL.
- [x] Inspect the actual server state and preserve neighbouring services.
- [x] Back up current releases/configuration and persistent guest state.
- [x] Stage and verify new client/backend before switching.
- [x] Preserve the production cap of 50.
- [x] Verify live menu/assets/catalogue/health and document rollback.

The old Inaklarnet repository is not a publication destination. Source uses MIT; ship/station models and other resources have their own terms. Generic ambient streaming remains opt-in and requires permission; the build includes no SomaFM stream.
