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

Source commit, remote verification, installed release, service checks and rollback references will be recorded after their respective operations complete. Deployment is explicitly authorized for the existing Universe server, with the production admission cap kept at 50. No public combat/voice/load test is part of this release.
