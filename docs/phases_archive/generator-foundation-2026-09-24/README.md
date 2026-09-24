# Versioned generator foundation

Completed seven stages: contracts/compatibility, coherent artistic world models, spherical detail maps, background jobs and budgets, survey sites/journal, recipe editing and regression verification.

GeneratorContract separates physics=1, appearance=3 and survey=1. Legacy saves without metadata remain readable; unsupported physics is rejected without overwriting offline saves. Game/server/map share SystemPhysics and MoonModel. Original positions, radii, profiles, zones and field samples for seven systems/32 planets were verified against SHA256 baselines.

WorldModel links fictional composition/climate to stellar type and orbit. Solar System physical values and maps remain intact. SurfaceBake packs coarse/fine height, roughness and reflection into four linear channels, using 3D noise to close seams and stabilize poles. HIGH is 512×256, LOW 256×128. It adds material detail without geometric displacement/collider changes or extra planet draw calls.

SurfaceJobs uses one worker, priorities, cancellation, stale-result rejection and at most one map installation per pump. A time-sliced fallback yields the same bytes. Detail cache budgets are 8 MiB/10 maps HIGH and 2 MiB/6 maps LOW, including mip estimates; these are not total GPU-memory figures. Field construction yields after approximately 3 ms, although one operation may exceed that threshold.

Four survey purposes reuse existing zones: instrument station, wreck, exposed deposits and anomaly. Safe observation points and a bounded device-local journal do not add mining/rewards/economy. The initial seed/preset editor was later superseded by the composite workshop.

134 unit tests passed, with types/guard/build, HIGH/LOW scene/editor/flight checks, repeated travel/resource checks, 12 weapon scenarios, compatibility rejection and network/touch checks at 240 ms RTT. Local worker timings were about 154 ms HIGH and 57 ms LOW; headless frame results are not device guarantees. Main dist, portable archive, user tabs and saves were preserved; this was a local stage.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
