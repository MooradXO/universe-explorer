# Cruise safety-margin escape and first-person missiles

Reproduced immediate BLOCKED behaviour from an Earth save at radius + 1800, inside the 3000-unit cruise safety margin but outside the solid planet. Fresh-base testing had not covered that position.

CruiseNavigator now exits the safety margin radially, still rejecting solid-body starts and checking other obstacles. Waypoints advance only after arrival; turns are limited to 1.2 rad/s and alignment holds position instead of skipping route segments.

Missile cylinders now have both end caps. First-person flight no longer adds a separate 650-unit launch offset, and the extra 90-degree homing rotation was removed. Speed, damage and lifetime remain unchanged.

118 unit tests, types/guard/build and browser checks passed: Mercury HIGH, Uranus LOW, generated Worlds 1–4, STOP/restart, weapons in both cameras/qualities and two network regressions at 240 ms RTT. Public services, user saves and the main build/portable archive were preserved.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
