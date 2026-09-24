# Compact mobile HUD and two-thumb control

Moved mobile hull/shield/boost into a compact lower status strip, reduced radar size and grouped controls without changing desktop placement.

The left stick now combines thrust with yaw/pitch, and the right FIRE button supports independent holding. Release, cancellation, menu opening, orientation changes and restoration after network STOP Cruise are handled explicitly.

120 unit tests, types/guard/build, eight browser tests and isolated network checks at 240 ms RTT passed. Touch cases covered simultaneous steering/thrust/fire and independent finger release at several viewport sizes. No physical phone was used; browser emulation is not a real-device performance claim.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
