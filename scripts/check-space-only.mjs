import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const violations = [];
const removedRuntime = /AtmosphereMode|AtmosphereChunk|PlanetSurfaceManifest|EnterAtmosphere|ReturnToOrbit|planetSmoke|IllustratedConstellationAtlas|assets\/constellations|\b(landing|racing|terrain|weather)\b/i;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(ts|css|html)$/.test(path) && removedRuntime.test(readFileSync(path, 'utf8'))) violations.push(path);
  }
}
scan('src');
for (const directory of ['src/planet', 'public/assets/planet', 'src/world/constellations', 'public/assets/constellations']) {
  if (existsSync(directory)) violations.push(directory);
}
for (const file of ['.env.example', 'index.html']) {
  if (/somafm|ice1\.somafm/i.test(readFileSync(file, 'utf8'))) violations.push(file);
}
if (violations.length) throw new Error(`Obsolete space-only dependencies: ${violations.join(', ')}`);
console.log('Space-only source and public configuration: PASS');
