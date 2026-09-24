# Environment implementation notes

The active path is SystemDescriptor → EnvironmentProfile → CinematicPlanet / OrbitalDebris / CinematicBackground / ApprovedFlightFX. A stable artistic seed gives each world a reproducible profile independently of physical positions/radii.

Libraries provide 64 surfaces, 128 material treatments, 32 clouds, 24 atmospheres, 16 auroras, 32 rings, 24 moon styles, 12 orbit layouts, 32 natural families, 48 field layouts, 24 structural recipes, 32 phenomena and 66 environment FX. Counts include variants and are not claims of that many independent physical categories.

The September 18 scope explicitly excluded new gameplay. The Earth red/blue glow was retained; other locations vary shape, palette, density, structure and motion. Later survey gameplay on September 24 was separately authorized.

SpaceEnvironment uses fixed 9,000-unit cells, a 125-cell cache, simplified lit instanced silhouettes within 19,000 units and detailed fields within 11,000 units. Detailed budgets are six HIGH/three LOW plus up to two fading fields, created incrementally. Content stays fixed in space and returns consistently. Direct planetary travel corridors and arrival/solid-body exclusions remain clear. Structures occur in roughly 18% and phenomena in 32% of populated cells.

Verification covered 29 Earth–Mars intermediate regions, negative coordinates, alternate construction order, address preservation, actual flight across cells/origin shifts and 32 full review worlds. The earlier recipe viewer was later replaced by the workshop. See the dated environment report and current guides.

[Current catalogue guide](../CATALOG_PIPELINE.md) · [Third-party notices](../../THIRD_PARTY_NOTICES.md)
