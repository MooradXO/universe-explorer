# Flight, map and effects — completed ten-stage plan

- [x] Fix Earth-to-Mars cruise, arrival, STOP and destination changes with swept obstacle checks.
- [x] Improve cruise motion/camera feel while keeping it tied to actual travel.
- [x] Correct ship orientation and preserve the -Z forward / +Z engine convention.
- [x] Preserve map continuity and selected stars across delayed loading.
- [x] Improve map layout, markers and system/planet selection on desktop and small screens.
- [x] Improve planet/space composition, depth and large recognizable forms without changing scientific coordinates.
- [x] Remove stationary red-line/flash artifacts while preserving intended projectiles and engine/warp glow.
- [x] Create readable moving laser pulses in both views and across distances.
- [x] Create original spatial laser/missile audio with provenance and bounded playback.
- [x] Coordinate charge, entry, tunnel and exit with confirmed server travel, including failure/cancel.
- [x] Address follow-up safety-margin cruise starts, generated Worlds 1–4 and first-person missiles.
- [x] Compact the mobile HUD and combine flight/steering on the left stick with independent right-thumb FIRE.

Each stage used reproduction, a focused change and appropriate local verification. The completed ten-stage suite reached 113 unit tests; later feedback fixes reached 118 and mobile work 120. HIGH/LOW, RTT 240/1200, travel refusal/cancel, offline transitions and disconnect cases are covered in the dated reports. Reference games informed direction; their assets/audio were not copied. User tabs/saves, main dist and portable archive were preserved. Current work is tracked in [ROADMAP.md](../ROADMAP.md).
