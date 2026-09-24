import { readFile, writeFile } from 'node:fs/promises';
const root = 'docs/phases_archive/warp-transition-2026-09-24';
const rows = [];
for (const dir of ['before-HIGH', 'final-HIGH', 'accepted-LOW']) {
  const data = JSON.parse(await readFile(`${root}/${dir}/evidence.json`, 'utf8'));
  const trip = data.samples[0].trip.map(x => x.s);
  const states = trip.filter(s => dir.startsWith('before') ? s.world.travel.warping : s.world.flightFX.effects.warp.phase === 'tunnel');
  const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  rows.push({ dir, samples: states.length, medianDrawCalls: median(states.map(s => s.renderer.calls)), maxDrawCalls: Math.max(...states.map(s => s.renderer.calls)),
    medianFrameMs: median(states.map(s => s.frameTimeMs)), medianP95Ms: median(states.map(s => s.p95FrameTimeMs)),
    maxCameraOffset: Math.max(...trip.map(s => Math.hypot(...s.world.ship.cameraOffset))),
    maxFov: Math.max(...trip.map(s => s.world.ship.cameraFov)), scenarios: data.samples.map(s => s.scenario), errors: data.errors });
}
await writeFile(`${root}/render-comparison.json`, JSON.stringify(rows, null, 2)); console.log(JSON.stringify(rows));
