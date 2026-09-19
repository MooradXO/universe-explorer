// Extract only the three review candidates and their resource dependencies.
// The supplied library is read-only; all generated files stay in this repository.
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Pass the path to your EpicToonFX-ThreeJS library.');
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = resolve(root, 'public/assets/fx-preview');
const runtime = resolve(root, 'src/vendor/epic-fx');
const ids = ['6749a1da7a6538e4bae6c320db525d94', 'd773d301d86b3254180a6887af308eef', 'beb57d582b696b645928b556533430b2'];
const read = async p => JSON.parse(await readFile(resolve(source, 'assets', p), 'utf8'));
const catalog = await read('catalog.json'), resources = await read('resources.json');
const chosen = catalog.effects.filter(e => ids.includes(e.id));
if (chosen.length !== ids.length) throw Error('Missing preview preset');
const subset = { textures: {}, audio: {}, materials: {}, meshes: {} };
const paths = new Set(), provenance = [];
for (const entry of chosen) {
  const def = await read(entry.file);
  paths.add(entry.file);
  // Original definitions stay byte-identical; the adapter always disables audio.
  for (const emitter of def.emitters) {
    for (const id of emitter.renderer.materials) {
      const material = resources.materials[id];
      if (!material) throw Error(`Missing material ${id}`);
      subset.materials[id] = material;
      for (const textureId of [material.map, ...Object.values(material.textureSlots || {}).map(s => s.map)]) {
        if (!textureId) continue;
        const tex = resources.textures[textureId];
        if (!tex) throw Error(`Missing texture ${textureId}`);
        subset.textures[textureId] = tex; paths.add(tex.path);
      }
    }
    const mesh = emitter.renderer.m_Mesh;
    if (emitter.renderer.m_RenderMode === 4 && mesh?.guid && mesh.guid !== '0000000000000000e000000000000000') {
      const key = `${mesh.guid}_${mesh.fileID}`;
      const resource = resources.meshes[key];
      if (!resource) throw Error(`Missing mesh ${key}`);
      subset.meshes[key] = resource; paths.add(resource.path);
    }
  }
}
await mkdir(assets, { recursive: true });
await mkdir(runtime, { recursive: true });
const copy = async (from, to, category) => {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const sourceBytes = await readFile(from);
  if (category === 'runtime' && to.endsWith('epic-fx.js')) {
    // This integration requires an explicit base URL; the library's original
    // relative default points outside the vendored module layout in a Vite build.
    const original = sourceBytes.toString('utf8');
    const signature = "constructor(baseURL=new URL('../assets/',import.meta.url)){";
    if (!original.includes(signature)) throw Error('Upstream constructor changed: review adapter');
    await writeFile(to, original.replace(signature, 'constructor(baseURL){'));
  }
  provenance.push({ file: relative(root, to).split(sep).join('/'), category,
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    bytes: (await stat(to)).size, sha256: createHash('sha256').update(await readFile(to)).digest('hex') });
};
for (const path of paths) {
  const from = resolve(source, 'assets', path), to = resolve(assets, path);
  if (!from.startsWith(resolve(source, 'assets') + sep) || !to.startsWith(assets + sep)) throw Error('Invalid resource path');
  await copy(from, to, 'asset');
}
for (const name of ['epic-fx.js', 'simulation.js', 'render.js', 'curves.js', 'shaders.js']) {
  await copy(resolve(source, 'src', name), resolve(runtime, name), 'runtime');
}
await writeFile(resolve(assets, 'catalog.json'), JSON.stringify({ effects: chosen }));
await writeFile(resolve(assets, 'resources.json'), JSON.stringify(subset));
await writeFile(resolve(runtime, 'provenance.json'), JSON.stringify({
  origin: 'User-supplied EpicToonFX-ThreeJS adaptation; original VFX by Archanor VFX',
  usage: 'Three candidate presets for local visual review. User authorized use of their purchased/adapted library. Not MIT or CC0.',
  presets: chosen.map(({ id, name }) => ({ id, name })), files: provenance,
}, null, 2));
console.log(JSON.stringify({ presets: chosen.map(e => e.name), textures: Object.keys(subset.textures).length,
  bytes: provenance.reduce((n, f) => n + f.bytes, 0), files: provenance.length }));
