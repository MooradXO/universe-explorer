# Changelog

## 2026-09-25 orbital launch and game modes

- Added a responsive orbital launch scene, safe scout departure, pilot names and Exploration/PvP selection.
- Separated peaceful and combat players, chat and voice into two server-controlled modes under one shared admission cap. Existing PvP saves remain compatible; Exploration has independent state and journals.
- Added the original synthesized Far Horizons ambient score with persistent volume/mute controls and hidden-tab suspension.
- Added return-to-launch and mode switching, including reconnect and interrupted connections.
- Kept hull, shield, boost and the aiming reticle visible in first-person flight without a 3D cockpit. Exploration retains its map and ship indicators.
- Verified server mode isolation, shared capacity, peaceful weapon rejection, PvP damage, mobile presentation and first-person HUD updates.

[Publication and deployment record](docs/phases_archive/release-2026-09-25/README.md).

## 2026-09-24 multiplayer visual hotfix

- Smoothed automatic cruise turns between network snapshots, including mobile rendering and the return to manual steering.
- Restored internal GLB transforms in instanced ships. Other players' ships now retain the same model size as the local ship instead of appearing 100 times smaller.
- Added real two-browser HIGH/LOW checks for visible remote ships, damage and cruise rotation at 240 ms simulated latency.

## 2026-09-24 source update

### Flight, presentation and controls

- Stabilized cruise navigation, escape from planet safety margins and obstacle-aware alignment.
- Smoothed flight/camera orientation and kept warp presentation aligned with network travel.
- Fixed missile visibility in first-person view and removed stationary projectile artifacts.
- Added moving laser pulses, shared projectile/impact renderers and original synthesized weapon sounds.
- Improved star-map continuity, selection handling, system previews and space composition.
- Removed accidental object-information popups during ordinary flight; map/navigation information remains available.
- Added compact mobile status bars and independent flight/steering/fire touch controls.

### Generation and workshop

- Separated deterministic physical, appearance and survey versions while preserving existing physical worlds and saves.
- Added packed spherical detail maps, worker generation, bounded caches and a time-sliced fallback.
- Expanded environment layers, Solar System surface presentation and local survey sites/journal.
- Replaced the recipe viewer with a 17-type scene workshop: parenting, transforms, per-type parameters, undo/redo, named projects, full JSON import/export, PNG and image/live A/B.
- Added a separate local preview flight with game controls and weapon visuals.

### Multiplayer

- Includes the authoritative Colyseus implementation deployed on September 19: shared flight mathematics, snapshot encoding, prediction/reconciliation, server combat, guest persistence and rate-limited admission.
- Keeps one canonical universe and the production cap of 50. The local ceiling of 100 is not a claim about VPS capacity.
- Includes later cruise, travel and generator compatibility fixes required by the current client.

### Documentation

- Reorganized current guides and historical reports in English.
- Separated source, reproducible checks and compact evidence from local recordings, builds, source backups, credentials and catalogue databases.

## 2026-09-19

The public site adopted Colyseus, catalogue services and the Titan & Copper HUD. Constellation artwork was removed. Historical reports record the individual verification and deployment steps.
