# EpicToonFX integration

The owner supplied a purchased Three.js adaptation of EpicToonFX and authorized suitable effects in this game. Original VFX: Archanor VFX. These materials are not MIT/CC0; the code license does not override their rights.

The initial preview uses ScanExplosion, SpinPortalBlue and Plexus with seven textures under public/assets/fx-preview/. The environment subset adds 66 presets and 19 shared textures under public/assets/fx-environments/. Totals include colour variants.

Definitions are preserved. Audio is disabled, groundY is null, loading is lazy and the adapter enforces HIGH/LOW particle and simulation-scale budgets. The game and workshop share that adapter.

The integration changes epic-fx.js to require an explicit asset URL. Local declarations are in epic-fx.d.ts; provenance.json records original/local SHA256 values. Preparation: node scripts/prepare-fx-preview.mjs <library-path>.

The supplied source library remains untouched. Inclusion does not grant an independent redistribution/reuse license for the original library. See THIRD_PARTY_NOTICES.md.
