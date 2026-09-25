# Development roadmap

## Current delivery: September 2026 publication

- [x] Authoritative Colyseus multiplayer and a production admission limit of 50.
- [x] Cruise safety escape, stable routing and smoother turns.
- [x] First-person missile visibility, shared projectile visuals and original weapon audio.
- [x] Continuous star-map view, system previews and clearer navigation.
- [x] Compact mobile HUD and independent two-thumb flight/steering/fire.
- [x] Versioned procedural world generation, worker detail maps, bounded caches and survey journal.
- [x] Composite scene workshop with 17 object types, full JSON projects and isolated preview flight.
- [x] Publish the complete source revision with English documentation and an English workshop.
- [x] Deploy that revision to the existing server and verify rollback references and neighbouring services.

## Current milestone: orbital launch, game modes and music

Implementation and verification: [single checklist](plans/launch-modes-music-2026-09-24.md). Published to main and deployed as `20260925-15be074` after user review on September 25. [Release record](phases_archive/release-2026-09-25/README.md).

## Proposed next milestone: closed group alpha

These items are proposals, not completed features.

- [x] Redesign the start screen as a responsive orbital departure scene.
- [ ] Integrate three user-supplied small ship models and three large ship models.
- [ ] Persist ship selection and display it consistently to other players.
- [x] Implement server-enforced Exploration and PvP rules.
- [ ] Replace generic connection failures with specific duplicate-tab, full-room and unavailable-server guidance.
- [ ] Add a short first-flight introduction and clear initial exploration objectives.
- [ ] Design friend rendezvous/navigation markers and validate shared exploration with the group.
- [ ] Test first-time onboarding, reconnect, mobile controls and an extended multiplayer session.
- [ ] Invite players in stages, keeping the 50-player cap and CPU headroom.
- [ ] Collect feedback before expanding scope or moving hosting.

## Deferred decisions

Ship-specific combat statistics, larger server capacity, voice SFU/TURN, high-ping hit compensation, a new hosting provider and publishing workshop scenes into authoritative gameplay need separate design and validation. The current workshop preview is not a multiplayer world deployment tool.

Completed implementation plans remain in [plans/](plans/); dated verification belongs in [phases_archive/](phases_archive/).
