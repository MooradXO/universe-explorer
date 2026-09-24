# Publication checklist

Canonical repository: https://github.com/MooradXO/universe-explorer, branch main.

## Source release

- [x] Current gameplay, Colyseus, generation, workshop and regression sources are included.
- [x] Documentation distinguishes implemented features from proposed ship selection and game modes.
- [x] Existing resource attribution and license texts are retained.
- [x] Local .env files, databases, guest state, builds and recordings are excluded.
- [x] Production dependency audit reports no known vulnerabilities at preparation time.
- [ ] Complete English documentation and English workshop verification.
- [ ] Verify documentation links and a clean-clone source build.
- [ ] Scan staged files for secrets and oversized accidental artifacts.
- [ ] Commit and push without rewriting remote history; independently verify the remote SHA.

## Deployment

- [ ] Record the source commit and build with the production multiplayer URL.
- [ ] Inspect the actual server state and preserve neighbouring services.
- [ ] Back up current releases/configuration and persistent guest state.
- [ ] Stage and verify new client/backend before switching.
- [ ] Preserve the production cap of 50.
- [ ] Verify live menu/assets/catalogue/health and document rollback.

The old Inaklarnet repository is not a publication destination. Source uses MIT; ship/station models and other resources have their own terms. Generic ambient streaming remains opt-in and requires permission; the build includes no SomaFM stream.
