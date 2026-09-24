# Environment-generator capability audit

The active stellar-flight path uses SystemScene, CinematicPlanet, EnvironmentProfile and EnvironmentMaterials. Editing only the legacy canvas PlanetTextures path would not improve current Jupiter rendering.

| Library | Authored recipes |
| --- | --- |
| Surfaces | 64: 16 rock, 8 lava, 8 ice, 8 ocean, 8 mineral, 16 gas |
| Material treatments | 128, two treatments per surface; not 128 independent geological families |
| Clouds | 32: eight shapes and four layer patterns |
| Atmospheres | 24: six types and four layers |
| Auroras | 16: eight shapes and two modes |
| Rings | 32: eight shapes and four variants, with planet shadow |
| Moons | 24 styles, 12 orbit patterns; separate known Solar System data |
| Natural objects | 32 families × six shapes = 192 variations |
| Field layouts | 48: twelve compositions and four patterns |
| Structures | 24 constructions × eight topology variants |
| Phenomena | 32: eight silhouettes and four motions |
| Environment FX | 66 presets including colour variants |
| Background | 12 artistic structures, separate from real catalogue stars |

Flight/weapon/engine/warp effects are separate components. Streaming bounds active fields and cache; disposal releases resources during travel.

Jupiter's existing HIGH/LOW maps loaded correctly, but baked colours replaced procedural colour detail and appeared soft close up. The expansion introduced 12 geological treatments and eight gas circulation modes, plus detail/weather/layer controls. It also removed accidental flight-scene information popups. See the stage report and the later full [workshop](../../WORKSHOP.md).
