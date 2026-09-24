# Local Colyseus migration — September 19, 2026

Implemented the canonical room, shared authoritative flight, combat/bots, compact snapshots, prediction, guest identity/persistence, travel, global chat and proximity signalling. The local phase preserved existing UI/assets and did not add game modes or economy.

Passed 84 unit tests, both TypeScript checks, four network browser scenarios, ten offline scenarios, eight load scenarios and an additional battle with bots. The dependency audit at that time reported no known vulnerabilities.

Local 100-player combat reached approximately 47 Mbit/s; 100 players plus 100 spawned bots measured 50.05 Hz, 37.4% of one CPU core, 281 MiB RSS and 65.46 Mbit/s. Those measurements used the development computer, not the VPS. The later VPS stage selected 50 rather than claiming local capacity applied remotely.

Two synthetic microphones verified the two-client voice path; 100 simultaneous speakers and a long internet soak were not tested. This phase stopped before production access. Deployment was separately authorized and recorded in the adjacent deployment report.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
