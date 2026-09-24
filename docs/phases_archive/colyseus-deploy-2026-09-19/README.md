# Colyseus VPS deployment — September 19, 2026

Installed release 20260919-colyseus-v3 with one shared universe and a 50-player production limit. The dedicated multiplayer service uses loopback 2567, Linux-installed dependencies and persistent guest state. The catalogue service and unrelated sites were preserved.

| Scenario | Duration | CPU, % of one core | RSS MiB | Tick Hz | Outbound Mbit/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 combatants | 120 s | 40.60 | 204.25 | 50.008 | 12.70 |
| 50 + 100 spawned bots | 60 s | 52.35 | 190.58 | 49.999 | 21.17 |
| 50 across ten systems | 30 s | 32.25 | 171.38 | 50.032 | 2.97 |
| 100 combatants, rejected configuration | 30 s | 98.89 | 235.22 | 49.726 | 46.15 |

At 100, snapshot p99 reached 158 ms and input queues required resync. At 50, simulation-step p99 was 11.49 ms and snapshot interval p99 109.42 ms. The selected cap preserves CPU headroom; it is not a long-duration stability guarantee.

Load ran on isolated loopback 2579 with separate guest state, CPUQuota 200%, MemoryMax 1200M and a time limit. Socket-byte measurements do not include a complete external 50-person internet test. An early 100-client harness batching defect was corrected; its failed run is not acceptance evidence.

84 unit tests, backend/frontend checks and capacity integration passed. Later map-selection/travel fixes brought the suite to 85. Staged HIGH/LOW browser checks passed. An initial public gameplay repeat failed from a map-selection race and interference from a real player; it is explicitly not a pass. Final public checks were limited to menu/health. Synthetic voice clients were closed; subsequent combat/voice testing belongs on isolated backends.

Backup: /var/backups/universe-explorer/colyseus-20260919/. Prior release: /var/www/universe-explorer/releases/20260919-2c33902. Active client was main-Da-fLuKO.js (SHA256 324908d100a45c5af876b9db63b48be24162a0c1c7065b3c469e2ccd4b9615a2). Rollback restores the prior client/proxy and stops only the new multiplayer service for this initial migration.

Traffic for 50 players: distributed 1.34 GB/h, common combat 5.71 GB/h, combat plus bots 9.53 GB/h. At eight hours/day for 30 days: 0.32 / 1.37 / 2.29 TB. At 24 hours/day: 0.96 / 4.11 / 6.86 TB. Downloads, other services and overhead are additional; provider accounting was not verified. Voice was direct WebRTC/STUN, with no relay on this VPS. Two-browser voice is not proof of 50 simultaneous speakers. Historical hit rewind is not implemented.

## Evidence scope

This is a dated implementation report. Compact JSON measurements and selected screenshots in this directory belong to the build tested at that time. Temporary source copies, recordings and machine-specific diagnostics are retained locally rather than published. Current instructions: [documentation index](../../README.md).
