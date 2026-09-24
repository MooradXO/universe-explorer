# Titan & Copper art direction

Implemented September 18: 18 production PNG resources, original project-generated RGBA artwork with live text and gauges. [Implementation report](../../phases_archive/titan-hud-2026-09-18/README.md).

The approved layout uses full-screen flight, small corner marks, a bottom-left radar and adjacent desktop hull/shield/boost indicators. The upper row is SYSTEM / BOUNTIES / WARP / HANGAR / COMMS / MAP, with navigation at upper right. Bounties/Comms open individually on the right; Hangar uses a central panel. Demonstration panel rows, concept/style labels and the persistent weapon-colour legend were removed.

Each full-screen panel state was reviewed separately. Shared panel coordination prevents overlaps and handles close/Escape/input. The later mobile layout is intentionally more compact.

production-prompts.json records original prompts; production-audit.json records hashes, alpha and dimensions; implementation/layout-report.json records layout checks. Design references are not substitutes for working UI.
