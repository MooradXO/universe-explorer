# Game modes and music

This guide describes the current source. See the [September 25 release record](phases_archive/release-2026-09-25/README.md) for publication and deployment status.

Choose **Exploration** or **PvP** on the launch screen, optionally enter a pilot name, and launch. The menu shows the existing carrier and scout in a separate orbital scene. Their departure path stays outside the carrier and planet; reduced-motion preferences shorten the transition without moving the ships.

| | Exploration | PvP |
| --- | --- | --- |
| Other players | Explorers in the same mode | Combat pilots in the same mode |
| Map, cruise, warp, surveys | Available | Available |
| Weapons, combat damage | Disabled, including server enforcement | Enabled |
| Hostile bots | Disabled | Available if enabled by the server |
| Chat and proximity voice | Only within Exploration | Only within PvP |
| Position and survey history | Separate peaceful save | Existing PvP save retained |

Both modes count toward the same configured admission limit. The universe catalogue and procedural generation remain the same. With no multiplayer URL configured, the selected rules apply to solo offline flight; there are no online players. The older opt-in Supabase transport is PvP only and is not an Exploration backend.

Use **SYSTEM → RETURN TO LAUNCH SCREEN** to leave the session and select another mode. Leaving releases the online seat and saves authoritative state; reconnecting after a dropped connection returns to the chosen mode.

Keep one active game tab per guest identity. Another tab using the same browser guest is rejected, including when the tabs select different modes. The current generic "Universe unavailable or full" notice can also mean this duplicate-tab condition. Close the other game tab and allow about 25 seconds for the reconnect reservation to expire and the next automatic retry.

Press **V** to switch between first-person and third-person flight. Both views retain the same hull, shield and boost indicators and aiming reticle; there is no separate 3D cockpit.

**Far Horizons** is an original Web Audio composition: eight slow chords, layered pads, a changing sparse melody, stereo delay and reverb. There are no downloaded recordings or audio services. The first interaction starts the music; browsers require this gesture. The launch-screen controls and **SYSTEM** panel share a persistent on/off switch and volume slider. These controls affect music only, leaving weapons and voice separate. Hidden tabs suspend the audio context. If the device blocks resuming audio, interacting with the page resumes it.

The menu supports portrait and landscape. Mobile flight still requires landscape; Exploration hides fire/weapon controls. Additional ship-model choices are not included in this milestone.
