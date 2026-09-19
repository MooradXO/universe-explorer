import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=resolve(process.argv[2]||'');if(!process.argv[2])throw Error('Supply read-only EpicToonFX source');
const root=fileURLToPath(new URL('../',import.meta.url)),assets=resolve(root,'public/assets/fx-environments');
const read=async p=>JSON.parse(await readFile(resolve(source,'assets',p),'utf8'));
const catalog=await read('catalog.json'),resources=await read('resources.json');
const families=[['Plexus','MagicAura','AuraSoft'],['FlamethrowerAdditive','MagicCharge'],['StarVortex','VortexPortal'],['MagicField','WavePortal'],
 ['MagicShield','MagicSphere'],['DustMotes','FogCalm','FogLively'],['SoftPortal','SwirlPortal'],['SmokeWhite','StarFog','CurvySmoke']];
const selected=catalog.effects.filter(e=>e.loop&&families.flat().some(prefix=>e.name.startsWith(prefix))&&!/Trail|Black/.test(e.name));
const subset={textures:{},audio:{},materials:{},meshes:{}},paths=new Set(),provenance=[];
for(const entry of selected){
 const def=await read(entry.file);paths.add(entry.file);
 for(const emitter of def.emitters){
  for(const id of emitter.renderer.materials){if(!id)continue;const material=resources.materials[id];if(!material)throw Error(id);subset.materials[id]=material;
   for(const textureId of [material.map,...Object.values(material.textureSlots||{}).map(s=>s.map)])if(textureId){const t=resources.textures[textureId];subset.textures[textureId]=t;paths.add(t.path);}}
  const mesh=emitter.renderer.m_Mesh;
  if(emitter.renderer.m_RenderMode===4&&mesh?.guid&&mesh.guid!=='0000000000000000e000000000000000'){const key=`${mesh.guid}_${mesh.fileID}`;const m=resources.meshes[key];if(!m)throw Error(key);subset.meshes[key]=m;paths.add(m.path);}
 }
}
for(const path of paths){const from=resolve(source,'assets',path),to=resolve(assets,path);if(!from.startsWith(resolve(source,'assets')+sep)||!to.startsWith(assets+sep))throw Error('Invalid path');
 await mkdir(dirname(to),{recursive:true});await copyFile(from,to);const bytes=await readFile(to);provenance.push({file:path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(resolve(assets,'catalog.json'),JSON.stringify({effects:selected}));await writeFile(resolve(assets,'resources.json'),JSON.stringify(subset));
const recipes=selected.map(e=>({id:e.id,name:e.name,family:families.findIndex(list=>list.some(prefix=>e.name.startsWith(prefix)))}));
await writeFile(resolve(root,'src/world/environments/EnvironmentFXPresets.ts'),'/** User-supplied EpicToonFX subset; color variants are presets, not structural families. */\nexport const ENVIRONMENT_FX_PRESETS = '+JSON.stringify(recipes,null,2)+';\n');
await writeFile(resolve(assets,'provenance.json'),JSON.stringify({origin:'User-supplied EpicToonFX-ThreeJS adaptation; Archanor VFX',usage:'Authorized for this game by the user; not MIT/CC0. Definitions unchanged; sound disabled, finite particle budgets.',presets:recipes,files:provenance},null,2));
console.log(JSON.stringify({presets:recipes.length,textures:Object.keys(subset.textures).length,bytes:provenance.reduce((n,p)=>n+p.bytes,0),byFamily:families.map((_,i)=>recipes.filter(r=>r.family===i).length)}));
