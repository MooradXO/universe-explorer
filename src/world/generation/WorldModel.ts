import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import type { EnvironmentProfile } from '../environments/EnvironmentProfile';
import { SURFACES } from '../environments/EnvironmentLibrary';

export interface PlanetModel {
  version: 1; provenance: 'authored-solar' | 'illustrative-game-model';
  flux: number; temperatureK: number; climate: 'frozen'|'cold'|'temperate'|'hot'|'molten';
  composition: 'gas'|'ice'|'ocean'|'rock'|'mineral'|'lava';
  activity: number; moisture: number; polarIce: number; atmosphere: 'none'|'thin'|'dense'|'giant';
  regions: readonly string[];
}
export interface StarModel { provenance:'illustrative-game-model'; energy:number; spectralClass:string; }
export function modelRegions(composition:PlanetModel['composition']){
  return composition==='gas'?['Equatorial jets','Storm bands','Polar vortices']:composition==='ice'?['Fractured ice','Frost plains','Buried ridges']:composition==='ocean'?['Coastal shelves','Continental uplands','Polar caps']:composition==='lava'?['Melt channels','Cooling crust','Volcanic ridges']:composition==='mineral'?['Exposed veins','Layered basins','Crystal ridges']:['Impact basins','Old highlands','Sediment plains'];
}
/** Art/game rules only: these coefficients are not inferred stellar measurements. */
export function starModel(spectrum:string|null):StarModel {
  const spectralClass=/^\s*([OBAFGKM])/i.exec(spectrum??'')?.[1].toUpperCase()??'G';
  return {provenance:'illustrative-game-model',spectralClass,energy:({O:160,B:45,A:12,F:2.5,G:1,K:.3,M:.045} as Record<string,number>)[spectralClass]};
}
export function planetModel(id:string,radius:number,semiMajorAu:number,star:StarModel):PlanetModel {
  const rng=createSeededRandom(hashString(`${id}:climate:v1`));
  const flux=star.energy/Math.max(.01,semiMajorAu*semiMajorAu),activity=.15+rng()*.8,moisture=rng();
  const solar=id.startsWith('sol/');
  const solarTypes:Record<string,PlanetModel['composition']>={mercury:'rock',venus:'rock',earth:'ocean',mars:'rock',jupiter:'gas',saturn:'gas',uranus:'gas',neptune:'gas'};
  const temperatureK=Math.round(Math.min(1800,Math.max(30,278*Math.pow(flux,.25)*(1+(moisture-.5)*.12))));
  const climate=temperatureK<160?'frozen':temperatureK<245?'cold':temperatureK<330?'temperate':temperatureK<650?'hot':'molten';
  const composition=solar?solarTypes[id.slice(4)]??'rock':radius>1800?'gas':climate==='molten'?'lava':climate==='frozen'?'ice':climate==='temperate'&&moisture>.38?'ocean':activity>.7?'mineral':'rock';
  const atmosphere=composition==='gas'?'giant':composition==='ocean'?'dense':composition==='ice'?'thin':radius<430?'none':climate==='hot'?'dense':'thin';
  const regions=modelRegions(composition);
  return {version:1,provenance:solar?'authored-solar':'illustrative-game-model',flux,temperatureK,climate,composition,activity,moisture,
    polarIce:composition==='ice'?1:Math.max(0,Math.min(1,(300-temperatureK)/110)),atmosphere,regions};
}
/** Clone the art portion; environment remains the immutable physical recipe. */
export function coherentAppearance(profile:EnvironmentProfile,model:PlanetModel):EnvironmentProfile {
  if(model.provenance==='authored-solar')return profile;
  const starts={rock:0,lava:16,ice:24,ocean:32,mineral:40,gas:48};
  const surface=starts[model.composition]+profile.seed%(model.composition==='gas'||model.composition==='rock'?16:8),recipe=SURFACES[surface];
  const atmosphere=model.atmosphere==='none'?null:model.atmosphere==='giant'?8+profile.seed%4:model.atmosphere==='dense'?4+profile.seed%4:profile.seed%4;
  return {...profile,surface,material:surface*2+profile.material%2,colors:[...recipe.colors],geography:recipe.geography,warp:recipe.warp,
    clouds:atmosphere===null||model.composition==='gas'?null:model.moisture>.35?profile.seed%32:null,atmosphere,
    aurora:atmosphere!==null&&model.activity>.55?profile.seed%16:null,signature:`${profile.signature}:climate1:${surface}`};
}
