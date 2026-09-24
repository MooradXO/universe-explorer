import type { SystemBody } from '../systems/SystemDescriptor';
import { coherentAppearance, planetModel, modelRegions, type StarModel } from './WorldModel';
import { systemEnvironmentProfiles } from '../environments/EnvironmentProfile';
import { hashString } from '../celestial/WorldSeed';
export const GENERATOR_PRESETS=['automatic','rock','ice','ocean','mineral','lava','gas'] as const;
export interface GeneratorRecipe { version:1;seed:string;preset:typeof GENERATOR_PRESETS[number];geography:number;activity:number; }
export function readGeneratorRecipe(raw:string):GeneratorRecipe|null {
  if(raw.length>4096)return null;
  try{const r=JSON.parse(raw);if(r.version!==1||typeof r.seed!=='string'||!r.seed.trim()||r.seed.length>96||!GENERATOR_PRESETS.includes(r.preset)||!Number.isFinite(r.geography)||r.geography<1||r.geography>12||!Number.isFinite(r.activity)||r.activity<0||r.activity>1)return null;
    return {version:1,seed:r.seed,preset:r.preset,geography:r.geography,activity:r.activity};
  }catch{return null;}
}
/** Preview-only recipe: clones its base and cannot rewrite a catalogue or a save. */
export function recipeBody(base:SystemBody,star:StarModel,recipe:GeneratorRecipe):SystemBody {
  const body=structuredClone(base);body.id=`preview/${hashString(recipe.seed)}`;body.name=`Seed ${recipe.seed}`;body.origin='procedural';body.source=null;
  body.model=planetModel(body.id,body.radius,body.orbit.semiMajorAu,star);body.model.activity=recipe.activity;
  if(recipe.preset!=='automatic'){
    body.model.composition=recipe.preset;body.model.provenance='illustrative-game-model';
    body.model.atmosphere=recipe.preset==='gas'?'giant':recipe.preset==='ocean'?'dense':recipe.preset==='ice'?'thin':'none';
    body.model.polarIce=recipe.preset==='ice'?1:0;
    body.model.regions=modelRegions(recipe.preset);
    if(recipe.preset==='ice'){body.model.climate='frozen';body.model.temperatureK=110;}
    if(recipe.preset==='ocean'){body.model.climate='temperate';body.model.temperatureK=285;body.model.moisture=.8;}
    if(recipe.preset==='lava'){body.model.climate='molten';body.model.temperatureK=1100;}
  }
  body.environment=systemEnvironmentProfiles(`preview:${recipe.seed}`,[body])[0];
  body.appearance=coherentAppearance(body.environment,body.model);body.appearance={...body.appearance,geography:recipe.geography};
  // Radius/orbit in the preview are inherited for a comparable camera; no physics is exported.
  return body;
}
