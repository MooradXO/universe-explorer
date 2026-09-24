import { SURFACES,MATERIALS,CLOUDS,ATMOSPHERES,AURORAS,RINGS,OBJECTS,LAYOUTS,STRUCTURES,PHENOMENA,MOONS,MOON_ORBITS,BACKDROP_SHAPES } from '../environments/EnvironmentLibrary';
import { GEOLOGY_LAYERS,WEATHER_LAYERS } from '../environments/PlanetDetail';
import { ENVIRONMENT_FX_PRESETS } from '../environments/EnvironmentFXPresets';
import { REVIEW_WORLDS } from '../environments/EnvironmentReviewWorlds';
import { SOLAR_MOONS } from '../environments/SolarMoonData';
import type { EnvironmentProfile } from '../environments/EnvironmentProfile';
import type { SystemBody } from '../systems/SystemDescriptor';
import { readGeneratorRecipe,recipeBody } from './GeneratorRecipe';
import { hashString,createSeededRandom } from '../celestial/WorldSeed';

export type Value=string|number|boolean;
export interface Field { key:string;label:string;group:string;type:'number'|'color'|'text'|'select'|'boolean';value:Value;min?:number;max?:number;step?:number;options?:readonly {value:Value;label:string}[]; }
const num=(key:string,label:string,group:string,value:number,min:number,max:number,step=1):Field=>({key,label,group,type:'number',value,min,max,step});
const color=(key:string,label:string,group:string,value:string):Field=>({key,label,group,type:'color',value});
const flag=(key:string,label:string,group:string,value:boolean):Field=>({key,label,group,type:'boolean',value});
const txt=(key:string,label:string,group:string,value:string):Field=>({key,label,group,type:'text',value});
const pick=(key:string,label:string,group:string,value:Value,options:readonly {value:Value;label:string}[]):Field=>({key,label,group,type:'select',value,options});
const list=(items:readonly {name:string}[],none=false)=>[...(none?[{value:-1,label:"Off"}]:[]),...items.map((r,i)=>({value:i,label:r.name}))];
const names=(items:readonly string[])=>items.map((label,value)=>({value,label}));
export const FX_CATALOG=[...ENVIRONMENT_FX_PRESETS.map(p=>({...p,path:'/assets/fx-environments/'})),
  {id:'6749a1da7a6538e4bae6c320db525d94',name:"Warp portal · SpinPortalBlue",path:'/assets/fx-preview/'},
  {id:'d773d301d86b3254180a6887af308eef',name:"Scan burst · ScanExplosion",path:'/assets/fx-preview/'},
  {id:'beb57d582b696b645928b556533430b2',name:"Anomaly · Plexus",path:'/assets/fx-preview/'}];
export const MODEL_NAMES=["Player ship","Base / carrier","Interceptor","Bomber"];
export const TEXTURES=['','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','moon'];
const planetFields:Field[]=[
  txt('seed','Seed',"Surface",'new-world'),pick('surface',"Relief / pattern","Surface",32,list(SURFACES)),
  pick('texture',"Surface map","Surface",'',TEXTURES.map(value=>({value,label:value||"Procedural surface"}))),
  pick('material',"Material treatment","Surface",64,MATERIALS.map((m,i)=>({value:i,label:`${SURFACES[m.surface].name} · ${m.treatment?"coated":"exposed"}`}))),
  num('radius',"Radius","Size and motion",1000,.1,20000,.1),num('spin',"Rotation, rad/s","Size and motion",.005,-.2,.2,.001),
  num('variant',"Variation","Surface",0,0,7),num('geography',"Pattern scale","Surface",4,1,12,.1),num('warp',"Distortion","Surface",.35,0,2,.01),
  color('color0',"Dark regions","Colours",'#0d354e'),color('color1',"Base colour","Colours",'#486954'),color('color2',"Bright regions","Colours",'#bbba83'),color('color3',"Atmosphere colour","Colours",'#83bfe0'),
  pick('geology',"Geology","Details",8,names(GEOLOGY_LAYERS)),pick('circulation',"Gas circulation","Details",2,names(WEATHER_LAYERS)),
  num('relief',"Relief strength","Details",.14,0,.5,.01),num('roughness',"Roughness","Details",.75,0,1,.01),num('ocean',"Ocean level","Details",.49,0,1,.01),
  num('detail',"Fine detail","Details",.3,0,1,.01),num('storms',"Vortex strength","Details",.8,0,2,.05),num('wind',"Flow speed","Details",.003,-.03,.03,.001),num('contrast',"Contrast","Details",1.06,.2,2,.01),num('frost',"Frost","Details",.2,0,1,.05),
  num('activity',"Geological activity","Details",.6,0,1,.05),num('ice',"Polar ice","Details",.2,0,1,.05),
  pick('clouds',"Cloud pattern","Clouds",0,list(CLOUDS,true)),num('cloudCoverage',"Coverage","Clouds",.4,0,1,.01),num('cloudAltitude',"Altitude, radius fraction","Clouds",.012,.002,.15,.001),num('cloudSpeed',"Cloud speed","Clouds",.004,-.04,.04,.001),num('cloudShadow',"Cloud shadow","Clouds",.2,0,.8,.01),
  pick('atmosphere',"Shell type","Atmosphere and aurora",1,list(ATMOSPHERES,true)),num('atmosphereThickness',"Shell thickness","Atmosphere and aurora",.025,.002,.2,.001),num('atmosphereDensity',"Shell density","Atmosphere and aurora",.35,0,1,.01),
  pick('aurora',"Aurora","Atmosphere and aurora",-1,list(AURORAS,true)),color('auroraColor',"Aurora colour","Atmosphere and aurora",'#51baa5'),
  pick('ring',"Ring pattern","Rings",-1,list(RINGS,true)),num('ringInner',"Inner radius, × planet","Rings",1.3,1.01,8,.01),num('ringOuter',"Outer radius, × planet","Rings",2.4,1.02,10,.01),num('ringTilt',"Tilt, degrees","Rings",65,-180,180),num('ringTurn',"Rotation, degrees","Rings",0,-180,180),num('ringDensity',"Ring density","Rings",.7,0,1,.01),color('ringColor',"Ring colour","Rings",'#cbb590'),
  num('moons',"Moon count","Moons",0,0,12),pick('moonStyle',"Moon style","Moons",0,list(MOONS)),pick('moonOrbit',"Orbit pattern","Moons",0,names(MOON_ORBITS)),num('moonSize',"Moon scale","Moons",1,.2,3,.1),num('moonDistance',"Orbit scale","Moons",1,.4,4,.1),
];
const naturalFields:Field[]=[pick('objects',"Object family","Shape",0,list(OBJECTS)),num('variant',"Shape within family","Shape",0,0,5),color('color',"Colour","Material",'#85817b'),num('roughness',"Roughness","Material",.85,0,1,.01),num('metalness',"Metalness","Material",.1,0,1,.01)];
const ringFields:Field[]=[pick('ring',"Pattern","Ring",10,list(RINGS)),num('radius',"Reference radius","Ring",1000,10,20000,10),num('inner',"Inner radius, × reference","Ring",1.3,.1,8,.01),num('outer',"Outer radius, × reference","Ring",2.4,.2,10,.01),num('density',"Density","Ring",.7,0,1,.01),color('color',"Colour","Ring",'#cbb590')];
export const ENTITY_TYPES={
  group:{name:"Object group",fields:[]},
  planet:{name:"Planet",fields:planetFields},moon:{name:"Moon",fields:planetFields},
  star:{name:"Star",fields:[num('radius',"Radius","Star",1200,10,20000,10),color('color',"Colour","Star",'#ffd090'),num('glow',"Glow","Star",.75,0,2,.05)]},
  ring:{name:"Separate ring",fields:ringFields},
  asteroid:{name:"Asteroid / natural object",fields:[...naturalFields,num('radius',"Size","Shape",100,1,2000,1)]},
  field:{name:"Asteroid / debris field",fields:[...naturalFields,txt('seed','Seed',"Distribution",'asteroids'),pick('layout',"Layout","Distribution",0,list(LAYOUTS)),num('count',"Count","Distribution",80,1,600),num('spread',"Area radius","Distribution",1800,100,20000,50),num('size',"Average size","Distribution",60,2,600,2),num('variation',"Size variation","Distribution",.7,0,.95,.05)]},
  structure:{name:"Structure / station / wreck",fields:[pick('recipe',"Structure","Structure",0,list(STRUCTURES)),num('variant',"Structural variant","Structure",0,0,7),color('color',"Colour","Material",'#77818a'),num('roughness',"Roughness","Material",.62,0,1,.01),num('metalness',"Metalness","Material",.6,0,1,.01),flag('wreck',"Damaged structure","Structure",false)]},
  phenomenon:{name:"Space phenomenon",fields:[pick('recipe',"Shape and motion","Phenomenon",0,list(PHENOMENA)),txt('seed','Seed',"Phenomenon",'anomaly'),color('warm',"First colour","Phenomenon",'#bf795b'),color('cool',"Second colour","Phenomenon",'#708bab'),num('speed',"Animation speed","Phenomenon",1,0,4,.1)]},
  model:{name:"Ship / base",fields:[pick('model',"Game model","Model",0,names(MODEL_NAMES)),color('tint',"Hull tint","Model",'#ffffff'),num('roughness',"Roughness × original","Model",1,.1,2,.1),flag('engine',"Engines enabled","Engines",true),color('engineColor',"Exhaust colour","Engines",'#22aaff'),num('throttle',"Thrust","Engines",.6,0,1,.05),flag('boost',"Boost","Engines",false)]},
  fx:{name:"Epic FX effect",fields:[pick('preset',"Effect","Effect",0,list(FX_CATALOG)),txt('seed','Seed',"Effect",'fx-01'),color('color',"Tint","Effect",'#ffffff'),num('intensity',"Intensity","Effect",.4,.05,2,.05),num('density',"Density","Effect",.8,.5,2,.05),num('size',"Size","Effect",100,1,1000,5),num('warmup',"Startup warm-up, s","Effect",.75,0,3,.05),num('speed',"Speed","Effect",1,0,4,.1),flag('loop',"Loop","Effect",true)]},
  blackhole:{name:"Black hole",fields:[txt('seed','Seed',"Black hole",'singularity'),color('color',"Disc colour","Black hole",'#ffaa00'),num('intensity',"Disc glow","Black hole",1.8,0,5,.1),num('speed',"Rotation speed","Black hole",1,0,4,.1)]},
  probe:{name:"ISS / Voyager",fields:[pick('model',"Spacecraft","Spacecraft",0,names(["ISS",'Voyager-1']))]},
  projectile:{name:"Projectile / laser / missile",fields:[pick('weapon',"Weapon type","Weapons",0,names(["Laser","Triple laser","Missile","Torpedo"])),color('color',"Colour","Weapons",'#ff3333'),num('length',"Pulse length","Weapons",640,100,900,10),num('speed',"Preview speed","Weapons",0,0,8000,100),num('range',"Travel distance","Weapons",3000,100,20000,100)]},
  engine:{name:"Engine nozzle",fields:[color('color',"Colour","Engine",'#22aaff'),num('throttle',"Thrust","Engine",.6,0,1,.05),flag('boost',"Boost","Engine",false),num('size',"Nozzle size","Engine",1,.2,8,.1)]},
  light:{name:"Light source",fields:[color('color',"Colour","Light",'#bcdcff'),num('intensity',"Intensity","Light",4,0,30,.1),num('distance',"Range","Light",10000,100,100000,100)]},
  impact:{name:"Explosion / shield / sparks",fields:[pick('effect',"Effect type","Effect",0,names(["Explosion","Shield flash","Sparks"])),color('color',"Colour","Effect",'#ff6600'),num('radius',"Radius","Effect",100,1,1000,1),num('period',"Repeat interval, s","Effect",1.5,.5,10,.1),txt('seed','Seed',"Effect",'impact')]},
} satisfies Record<string,{name:string;fields:Field[]}>;
export type EntityKind=keyof typeof ENTITY_TYPES;
export interface SceneEntity {id:string;name:string;kind:EntityKind;parent:string|null;visible:boolean;position:[number,number,number];rotation:[number,number,number];scale:number;params:Record<string,Value>;}
export const SCENE_FIELDS:Field[]=[flag('warp',"Show warp transition","Camera effects",false),txt('seed',"Background seed","Environment",'universe-workshop'),pick('backdrop',"Nebula shape","Environment",2,names(BACKDROP_SHAPES)),color('warm',"Warm colour","Environment",'#ad6256'),color('cool',"Cool colour","Environment",'#31768c'),num('density',"Nebula density","Environment",.4,0,1,.01),num('patternScale',"Nebula scale","Environment",5,1,12,.1),num('drift',"Nebula drift","Environment",.002,0,.02,.001),num('stars',"Background stars","Environment",1200,0,4000,100),num('ambient',"Fill light","Lighting",.8,0,3,.1),num('light',"Key light","Lighting",2.5,0,6,.1),color('lightColor',"Light colour","Lighting",'#fff0d5'),num('lightX',"Direction X","Lighting",-1,-1,1,.1),num('lightY',"Direction Y","Lighting",.5,-1,1,.1),num('lightZ',"Direction Z","Lighting",1,-1,1,.1),num('exposure',"Exposure","Lighting",1.25,.1,3,.05)];
export interface SceneDocument {format:'universe-scene';version:1;name:string;settings:Record<string,Value>;entities:SceneEntity[];}
export const SCENE_LIMITS={entities:64,planets:6,fx:4,lights:4,bytes:512000};
export const DRAFT_KEY='universe:workshop:draft:v1',PROJECTS_KEY='universe:workshop:projects:v1',PLAY_KEY='universe:workshop:play:v1';
export const defaults=(fields:Field[])=>Object.fromEntries(fields.map(f=>[f.key,f.value]));
export function createEntity(kind:EntityKind,id:string):SceneEntity {
  const e:SceneEntity={id,name:ENTITY_TYPES[kind].name,kind,parent:null,visible:true,position:[0,0,0],rotation:[0,0,0],scale:1,params:defaults(ENTITY_TYPES[kind].fields)};
  if(kind==='moon')Object.assign(e.params,{radius:160,surface:0,material:0,clouds:-1,atmosphere:-1,geology:0,color0:'#333039',color1:'#8e7965',color2:'#c1af91'});
  if(kind==='ring')e.rotation[0]=65;
  return e;
}
export function emptyScene():SceneDocument{return {format:'universe-scene',version:1,name:"New scene",settings:defaults(SCENE_FIELDS),entities:[]};}
export function randomizeEntity(entity:SceneEntity,seed:string){
  const p=entity.params,rng=createSeededRandom(hashString(seed));if('seed' in p)p.seed=seed;
  for(const f of ENTITY_TYPES[entity.kind].fields){if(f.type==='select'&&f.key!=='texture')p[f.key]=f.options![Math.floor(rng()*f.options!.length)].value;}
  if(entity.kind==='planet'||entity.kind==='moon'){const surface=SURFACES[Number(p.surface)],m=MATERIALS[Number(p.surface)*2],ring=RINGS[Math.max(0,Number(p.ring))];Object.assign(p,{texture:'',material:Number(p.surface)*2,color0:surface.colors[0],color1:surface.colors[1],color2:surface.colors[2],color3:surface.colors[3],relief:m.relief,roughness:m.roughness,geography:surface.geography,warp:surface.warp,ocean:surface.oceanLevel,moons:Math.floor(rng()*4),ringInner:ring.inner,ringOuter:ring.outer,geology:Math.floor(rng()*12),circulation:Math.floor(rng()*8)});}
  if(entity.kind==='ring'){const r=RINGS[Number(p.ring)];p.inner=r.inner;p.outer=r.outer;}
}
export function entityFromBody(body:SystemBody,id='planet-1'):SceneEntity {
  const e=createEntity('planet',id),p=body.appearance,s=SURFACES[p.surface],m=MATERIALS[p.material],c=p.clouds===null?null:CLOUDS[p.clouds],a=p.atmosphere===null?null:ATMOSPHERES[p.atmosphere];
  e.name=body.name;Object.assign(e.params,{seed:String(p.seed),radius:body.radius,surface:p.surface,material:p.material,variant:p.variant,texture:body.id.startsWith('sol/')?body.id.slice(4):'',geography:p.geography,warp:p.warp,
    color0:p.colors[0],color1:p.colors[1],color2:p.colors[2],color3:p.colors[3],relief:m.relief,roughness:m.roughness,ocean:s.oceanLevel,clouds:p.clouds??-1,cloudCoverage:c?.coverage??.4,cloudAltitude:c?.altitude??.012,cloudSpeed:c?.speed??.004,atmosphere:p.atmosphere??-1,atmosphereThickness:a?.thickness??.025,atmosphereDensity:a?.density??.35,aurora:p.aurora??-1,auroraColor:p.backdrop.cool,
    ring:p.ring?.recipe??-1,ringInner:p.ring?.inner??1.3,ringOuter:p.ring?.outer??2.4,ringTilt:(p.ring?.tilt[0]??1.1)*180/Math.PI,ringTurn:(p.ring?.tilt[2]??0)*180/Math.PI,ringDensity:p.ring?.density??.7,ringColor:p.ring?.tint??'#cbb590',moons:p.moonCount,moonStyle:p.moonStyle,moonOrbit:p.moonOrbit,activity:body.model.activity,ice:body.model.polarIce});
  return e;
}
export function sceneFromWorld(index:number):SceneDocument {
  const d=emptyScene(),body=REVIEW_WORLDS[index].body;d.name=body.name;d.entities=[entityFromBody(body)];const b=body.appearance.backdrop;Object.assign(d.settings,{backdrop:b.shape,warm:b.warm,cool:b.cool,density:b.density,patternScale:b.scale,drift:b.drift});
  for(const moon of SOLAR_MOONS.filter(m=>m.parent===body.id)){const e=createEntity('moon',`moon-${moon.id}`),style=MOONS[moon.style],surface=[0,24,27,16,40,8,33,25][style.type]+style.shape,s=SURFACES[surface],m=MATERIALS[surface*2];e.parent='planet-1';e.name=moon.name;e.position=[...moon.position] as [number,number,number];Object.assign(e.params,{radius:moon.radius,surface,material:surface*2,texture:moon.id==='301'?'moon':'',color0:s.colors[0],color1:s.colors[1],color2:s.colors[2],color3:s.colors[3],relief:m.relief,roughness:m.roughness,geography:s.geography,warp:s.warp});d.entities.push(e);}
  return d;
}
function values(raw:unknown,fields:Field[]):Record<string,Value> {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error("Missing parameters.");
  const result:Record<string,Value>={};for(const f of fields){const v=(raw as Record<string,unknown>)[f.key];
    if(f.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<f.min!||v>f.max!||(['moons','variant','count','stars'].includes(f.key)&&!Number.isInteger(v))))throw Error(`Invalid value: ${f.label}.`);
    if(f.type==='select'&&!f.options!.some(o=>o.value===v))throw Error(`Unknown option: ${f.label}.`);
    if(f.type==='boolean'&&typeof v!=='boolean')throw Error(`Expected a toggle: ${f.label}.`);
    if((f.type==='text'||f.type==='color')&&(typeof v!=='string'||v.length>96||!v.trim()||(f.type==='color'&&!/^#[0-9a-f]{6}$/i.test(v))))throw Error(`Invalid text: ${f.label}.`);
    result[f.key]=v as Value;
  }return result;
}
export function validateScene(input:unknown):SceneDocument {
  const r=input as SceneDocument;if(!r||r.format!=='universe-scene'||r.version!==1)throw Error("A Universe scene file in version 1 format is required.");
  if(typeof r.name!=='string'||!r.name.trim()||r.name.length>96||!Array.isArray(r.entities)||r.entities.length>SCENE_LIMITS.entities)throw Error("Invalid name or too many objects (maximum 64).");
  const ids=new Set<string>();const entities=r.entities.map(e=>{
    if(!e||!Object.prototype.hasOwnProperty.call(ENTITY_TYPES,e.kind)||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(e.id)||ids.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>96||typeof e.visible!=='boolean')throw Error("Invalid object or duplicate ID.");ids.add(e.id);
    const triple=(a:unknown,limit:number)=>{if(!Array.isArray(a)||a.length!==3||a.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>limit))throw Error("Invalid coordinates.");return [...a] as [number,number,number];};
    if(typeof e.scale!=='number'||!Number.isFinite(e.scale)||e.scale<.01||e.scale>100)throw Error("Scale must be between 0.01 and 100.");
    const p=values(e.params,ENTITY_TYPES[e.kind].fields);
    if((e.kind==='planet'||e.kind==='moon')&&Number(p.ring)>=0&&Number(p.ringInner)>=Number(p.ringOuter))throw Error("The outer ring radius must exceed the inner radius.");
    if(e.kind==='ring'&&Number(p.inner)>=Number(p.outer))throw Error("The outer radius must exceed the inner radius.");
    if(e.parent!==null&&e.parent!==undefined&&typeof e.parent!=='string')throw Error("Invalid object parent.");
    return {id:e.id,name:e.name,kind:e.kind,parent:e.parent??null,visible:e.visible,position:triple(e.position,1000000),rotation:triple(e.rotation,360),scale:e.scale,params:p};
  });
  const byId=new Map(entities.map(e=>[e.id,e]));for(const e of entities){const ancestors=new Set([e.id]);let parent=e.parent;while(parent){if(!byId.has(parent)||ancestors.has(parent))throw Error("The parent references a missing object or creates a cycle.");ancestors.add(parent);parent=byId.get(parent)!.parent;}}
  if(entities.filter(e=>e.kind==='planet'||e.kind==='moon').length>SCENE_LIMITS.planets)throw Error("A scene can contain up to 6 detailed planets / separate moons.");
  if(entities.filter(e=>e.kind==='fx').length>SCENE_LIMITS.fx)throw Error("A scene can contain up to 4 Epic FX effects.");
  if(entities.filter(e=>e.kind==='light').length>SCENE_LIMITS.lights)throw Error("A scene can contain up to 4 additional lights.");
  return {format:r.format,version:1,name:r.name,settings:values(r.settings,SCENE_FIELDS),entities};
}
export function removeSceneEntity(scene:SceneDocument,id:string){const removed=new Set([id]);let size=0;while(size!==removed.size){size=removed.size;for(const e of scene.entities)if(e.parent&&removed.has(e.parent))removed.add(e.id);}scene.entities=scene.entities.filter(e=>!removed.has(e.id));}
export function readScene(raw:string):SceneDocument {
  if(raw.length>SCENE_LIMITS.bytes)throw Error("The file exceeds 512 KB.");
  const legacy=readGeneratorRecipe(raw);if(legacy){const d=emptyScene();d.name=`Seed ${legacy.seed}`;d.entities=[entityFromBody(recipeBody(REVIEW_WORLDS[8].body,REVIEW_WORLDS[8].system.model,legacy))];return d;}
  return validateScene(JSON.parse(raw));
}
export function sceneBody(e:SceneEntity,settings:Record<string,Value>):SystemBody {
  const p=e.params,body=structuredClone(REVIEW_WORLDS[8].body),env=body.environment;
  body.id=`workshop/${e.id}`;body.name=e.name;body.radius=Number(p.radius);body.position=[-Number(settings.lightX)*10000,-Number(settings.lightY)*10000,-Number(settings.lightZ)*10000];
  Object.assign(env,{seed:hashString(String(p.seed)),surface:p.surface,material:p.material,variant:p.variant,geography:p.geography,warp:p.warp,colors:[p.color0,p.color1,p.color2,p.color3],clouds:Number(p.clouds)<0?null:p.clouds,atmosphere:Number(p.atmosphere)<0?null:p.atmosphere,aurora:Number(p.aurora)<0?null:p.aurora,
    moonCount:p.moons,moonStyle:p.moonStyle,moonOrbit:p.moonOrbit,ring:Number(p.ring)<0?null:{recipe:p.ring,inner:p.ringInner,outer:p.ringOuter,tilt:[Number(p.ringTilt)*Math.PI/180,0,Number(p.ringTurn)*Math.PI/180],density:p.ringDensity,tint:p.ringColor}});
  env.backdrop.cool=String(p.auroraColor);
  env.editor={solarTexture:String(p.texture),geology:Number(p.geology),circulation:Number(p.circulation),relief:Number(p.relief),roughness:Number(p.roughness),ocean:Number(p.ocean),detail:Number(p.detail),storms:Number(p.storms),wind:Number(p.wind),contrast:Number(p.contrast),frost:Number(p.frost),cloudCoverage:Number(p.cloudCoverage),cloudAltitude:Number(p.cloudAltitude),cloudSpeed:Number(p.cloudSpeed),cloudShadow:Number(p.cloudShadow),atmosphereThickness:Number(p.atmosphereThickness),atmosphereDensity:Number(p.atmosphereDensity),spin:Number(p.spin),moonSize:Number(p.moonSize),moonDistance:Number(p.moonDistance)};
  body.model.composition=SURFACES[env.surface].kind;body.model.climate=body.model.composition==='ice'?'frozen':'temperate';body.appearance=env;body.model.activity=Number(p.activity);body.model.polarIce=Number(p.ice);env.signature=`workshop:${hashString(JSON.stringify(p))}`;return body;
}
export function sceneEnvironment(settings:Record<string,Value>):EnvironmentProfile {
  const p=structuredClone(REVIEW_WORLDS[8].body.appearance);p.backdrop={shape:Number(settings.backdrop),warm:String(settings.warm),cool:String(settings.cool),density:Number(settings.density),scale:Number(settings.patternScale),drift:Number(settings.drift)};return p;
}
