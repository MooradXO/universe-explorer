# Kenney Nature Kit expanded subset

- Source: https://opengameart.org/content/nature-kit
- Original creator/distributor: Kenney, https://www.kenney.nl
- Pack: Nature Kit (2.1)
- Download date: 2026-05-23
- License: Creative Commons Zero, CC0 1.0
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Credit note from source: crediting Kenney.nl is appreciated but not mandatory.

## Local use

This expanded subset is used for stylized low-poly planet level design. Files were copied from the pack's `Models/GLTF format` directory and kept as GLB runtime assets. No backend data or external service dependency is required at runtime.

## Local folders

- `common/`: shared rocks and stones.
- `forest/`: trees, bushes, grass, mushrooms and stumps.
- `desert/`: cacti, dry plants, tall rocks and cliffs.
- `ice/`: pine and pale stone/rock forms used with runtime tinting.
- `volcanic/`: basalt-like cliffs, tall rocks and obelisk landmark.
- `oceanic/`: lilies, river rocks, waterfalls and shoreline props.
- `rocky/`: stones, tall rocks and ruin-like landmarks.

## Pipeline notes

- Shipping format remains GLB.
- Runtime uses cached GLTF loading and instanced placement where possible.
- Further optimization pass should run glTF Transform prune/dedupe/simplify after the final subset is locked.
