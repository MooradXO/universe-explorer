# Development roadmap

## Current delivery: September 2026 publication

- [x] Authoritative Colyseus multiplayer and a production admission limit of 50.
- [x] Cruise safety escape, stable routing and smoother turns.
- [x] First-person missile visibility, shared projectile visuals and original weapon audio.
- [x] Continuous star-map view, system previews and clearer navigation.
- [x] Compact mobile HUD and independent two-thumb flight/steering/fire.
- [x] Versioned procedural world generation, worker detail maps, bounded caches and survey journal.
- [x] Composite scene workshop with 17 object types, full JSON projects and isolated preview flight.
- [ ] Publish the complete source revision with English documentation.
- [ ] Deploy that revision to the existing server and verify rollback and neighbouring services.

## Proposed next milestone: closed group alpha

These items are proposals, not completed features.

- [ ] Redesign the start screen as a responsive hangar.
- [ ] Integrate three user-supplied small ship models and three large ship models.
- [ ] Persist ship selection and display it consistently to other players.
- [ ] Implement server-enforced exploration and PvP rules.
- [ ] Test first-time onboarding, reconnect, mobile controls and an extended multiplayer session.
- [ ] Invite players in stages, keeping the 50-player cap and CPU headroom.
- [ ] Collect feedback before expanding scope or moving hosting.

## Deferred decisions

Ship-specific combat statistics, larger server capacity, voice SFU/TURN, high-ping hit compensation, a new hosting provider and publishing workshop scenes into authoritative gameplay need separate design and validation. The current workshop preview is not a multiplayer world deployment tool.

Completed implementation plans remain in [plans/](plans/); dated verification belongs in [phases_archive/](phases_archive/).
