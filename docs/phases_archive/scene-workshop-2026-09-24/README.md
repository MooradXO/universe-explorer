# Composite scene workshop

Replaced the limited recipe viewer with 17 object types, the full existing content libraries and simultaneous layers. Projects retain parameters, transforms, parent links, visibility, lighting and background. Features include gizmos, numeric fields, variants, duplication, branch removal, undo/redo, drafts/projects, full JSON, legacy recipe import, PNG and captured-image/live A/B.

SceneDocument validates bounded data without executable content or external URLs. SceneComposer reuses game planet/material/moon/object/structure/phenomenon/background/warp/model/engine/FX renderers. ProjectileVisuals and ImpactVisuals are shared with combat. Optional editor overrides preserve normal gameplay defaults.

Preview flight uses ShipController and shared visuals in a separate local context. It excludes network bots, economy, authoritative combat, navigation catalogue and ordinary flight saves. Scenes are not automatically published.

142 tests across 31 files, both type checks and guard/build passed. HIGH/LOW composition checks covered all 17 types, parenting/history, save/export/import/reload, invalid import preservation, flight/missile/camera and repeated field disposal. Catalogue checks exercised 69 FX, four GLBs and four projectile visuals in both qualities; bounded warm-up made slow presets visible, with 700/260-particle budgets.

Mobile editor checks at 390×844 and 844×390 found no horizontal overflow. Real CDP multi-touch verified simultaneous movement/steering/fire and independent release. Twelve main-game weapon cases passed. Early synthetic-pointer/CDP-end mistakes were corrected before acceptance; a Windows EBUSY dev watcher prompted static production-preview testing.

The original local bundles were main-Bim0cUW-.js and environments-Dxj6vSNP.js. Later publication preparation translated the interface to English and repeated editing/project/flight checks. The current user guide is ../../WORKSHOP.md.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
