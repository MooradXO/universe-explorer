# Sector streaming and floating origin

Replaced the finite star field with a camera-centred background and deterministic 50,000-unit sectors. World positions combine integer sector and offset in [-25000,25000). At a 10,000-unit local distance, origin shifts move cameras, ships, projectiles, bots, trails, stations and respawn points consistently. Worker/cache bounds and stale-result cancellation control streaming. Eighteen unit tests covered negative boundaries, precision at very large sectors, relative geometry, cache/worker errors, network-coordinate conversion, swept collision and respawn. Build/types/guard and browser regressions passed; a 5% comparative rendering budget passed on the test machine. Network validation at this stage was a transport mock, not live Supabase load.

## Historical scope

This report records the implementation on the date in its directory name. Later stages may supersede its UI, transport or limits. Retained JSON and screenshots provide compact evidence; local recordings and source backups are not release assets. See the [current documentation](../../README.md).
