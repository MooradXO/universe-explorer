# Ship and warp orientation

Corrected visual alignment between the ship, camera, engines and travel direction. The player model's forward axis remains -Z and nozzles remain on +Z; fixes use explicit orientation rather than changing the world coordinate convention.

Verified first/third-person views, HIGH/LOW presentation and travel transitions in isolated clients. Follow-up warp-transition work added the complete staged effect while retaining the orientation corrections.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
