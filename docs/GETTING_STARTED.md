# Getting started

## Install and run

Requirements: Node.js 24.19+ and npm, a current WebGL-capable browser, and a keyboard/mouse or touch device.

```sh
git clone https://github.com/MooradXO/universe-explorer.git
cd universe-explorer
npm ci
npm run dev
```

Open the URL Vite prints. Select ENGAGE for a guest flight. The default unconfigured build runs locally; it does not connect to the public multiplayer server. No login provider or database account is needed for offline flight.

## First flight

Use W/S for thrust, mouse for steering, Shift for boost and V to change camera. Left click fires; 1/2/3 selects the weapon. The Flight Manual contains the in-game controls.

Use the navigation panel to choose a planet and CRUISE to travel. Manual controls or STOP cancel cruise. MAP opens the star catalogue; its full map/search requires the separately prepared dataset. After choosing a known-position star, travel to that system through navigation.

On a phone, rotate to landscape. The left stick combines flight and steering; hold FIRE with the right thumb. Start with LOW if the device struggles. Desktop browser emulation is not a guarantee of physical-phone performance.

## Create a scene

Open /environments.html on the same local server. Choose Open world or Empty scene, add a Planet from the library, and edit Surface, Clouds, Atmosphere and aurora, Rings and Moons. Layers can coexist.

Save project stores locally in this browser. Export JSON creates a portable backup. Fly in scene opens a separate local preview; it does not publish to multiplayer. Follow the [workshop guide](WORKSHOP.md) for parenting, limits and other object types.

## Enable additional services

- [Catalogue pipeline](CATALOG_PIPELINE.md): downloads/prepares the real star-map dataset outside Git.
- [Multiplayer](MULTIPLAYER.md): starts a separate local authoritative backend and client build.
- [.env.example](../.env.example): available configuration variables.
- [Deployment](DEPLOYMENT.md): full production installation and rollback.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| npm is missing | Install Node.js with npm; the original workspace can use scripts/run.ps1 |
| Map/search unavailable | Prepare map-v1 and run the catalogue API or Vite bridge |
| Network flight unavailable | Verify the configured backend URL, allowed origin and service health |
| Old visuals after a deployment | Reload the page; already-open tabs may still run the older bundle |
| Blank/slow graphics | Check WebGL support and try LOW |
| Mobile flight blocked in portrait | Rotate to landscape |
| Voice unavailable | Check browser microphone permission, secure context and network/NAT compatibility |
| Workshop draft missing | Use the same browser/origin, or import an exported JSON project |

Do not send credentials or complete browser-storage dumps in a bug report. Include browser/device, quality level, steps and a screenshot or read-only diagnostic snapshot.
