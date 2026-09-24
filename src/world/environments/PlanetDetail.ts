import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import { SURFACES } from './EnvironmentLibrary';
import type { EnvironmentProfile } from './EnvironmentProfile';

export const PLANET_DETAIL_VERSION = 2;
export const GEOLOGY_LAYERS = ["Impact ejecta", "Layered erosion", "Dry channels", "Tectonic boundaries",
  "Mineral inclusions", "Dune ripples", "Ice fractures", "High-altitude frost",
  "Coastal shelves", "Mountain cover", "Fresh lava", "Cooling lava"] as const;
export const WEATHER_LAYERS = ["Quiet belts", "Jet streams", "Cyclone chains", "Great anticyclone",
  "Polar vortices", "Cloud filaments", "Counterflows", "Storm front"] as const;

/** An independent art stream: enriching a surface cannot move a planet or a collider. */
export function planetDetail(profile: EnvironmentProfile, solarName = '') {
  const rng = createSeededRandom(hashString(`${profile.seed}:planet-detail:v${PLANET_DETAIL_VERSION}`));
  const recipe = SURFACES[profile.surface];
  const geologyBase = { rock: 0, mineral: 4, ice: 6, ocean: 8, lava: 10, gas: 0 }[recipe.kind];
  const geology = geologyBase + Math.floor(rng() * (recipe.kind === 'rock' ? 4 : 2));
  const circulation = Math.floor(rng() * WEATHER_LAYERS.length);
  const storms = Array.from({ length: 3 }, () => [rng() * Math.PI * 2, (rng() - .5) * 1.6, .12 + rng() * .17, 1.4 + rng() * .7] as [number, number, number, number]);
  if (solarName === 'jupiter') storms[0] = [2.0, -.38, .23, 1.8];
  const gas = recipe.kind === 'gas';
  return { version: PLANET_DETAIL_VERSION, geology, circulation, storms,
    wind: (gas ? .003 : .0008) * (.7 + rng() * .6),
    detail: .18 + rng() * .18, frost: recipe.kind === 'ice' ? .7 : .08 + rng() * .16,
    cloudShadow: profile.clouds === null ? 0 : .2,
    haze: profile.atmosphere === null ? 0 : gas ? .1 : .06,
    contrast: solarName === 'jupiter' ? 1.16 : solarName === 'saturn' ? 1.09 : 1.06,
    atmosphereTint: solarName === 'jupiter' ? '#c7a484' : solarName === 'saturn' ? '#cbbb92'
      : solarName === 'earth' ? '#5e9edf' : solarName === 'mars' ? '#c28a66' : profile.colors[3],
    stormStrength: solarName === 'uranus' ? .12 : solarName === 'saturn' ? .35 : .65 + rng() * .3,
    // Familiar Solar System colours also provide a recognisable load/error fallback.
    palette: solarName === 'jupiter' ? ['#654934', '#bd8861', '#efdfc2']
      : solarName === 'saturn' ? ['#76603f', '#c4aa77', '#eee2bb']
      : solarName === 'uranus' ? ['#3a7385', '#75b8c4', '#b0d9df']
      : solarName === 'neptune' ? ['#122453', '#275ec2', '#81ade1'] : [...profile.colors.slice(0, 3)],
  };
}

/** Spherical/tangent-space domains avoid UV seams and flattened polar storms. */
export const PLANET_DETAIL_GLSL = /* glsl */`
uniform vec4 storms[3];
uniform float detailStrength,geology,circulation,wind,stormStrength,contrast,cloudShadow,haze,frost;
vec3 circulationDomain(vec3 p,out float stormMask){
  float a=time*wind*(.35+sin(p.y*(7.+circulation))*.3),c=cos(a),s=sin(a);
  p.xz=mat2(c,-s,s,c)*p.xz;stormMask=0.;
  for(int i=0;i<STORM_COUNT;i++){
    vec4 storm=storms[i];float lon=storm.x,lat=storm.y;
    vec3 center=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
    vec3 east=vec3(-sin(lon),0.,cos(lon)),north=cross(east,center);
    vec2 d=vec2(dot(p,east),dot(p,north)*storm.w)/storm.z;
    float mask=exp(-dot(d,d)*(circulation<1.5?1.6:1.1))*smoothstep(.6,.95,dot(p,center));
    float angle=mask*(2.7+sin(time*wind*2.+float(i))*.25)*stormStrength;
    vec3 tangent=p-center*dot(p,center);
    p=normalize(center*dot(p,center)+tangent*cos(angle)+cross(center,tangent)*sin(angle));
    stormMask=max(stormMask,mask);
  }
  return p;
}
float fineTerrain(vec3 p,float large){
  vec3 q=p*(32.+mod(seed,13.))+seed*.031;
  float fine=noise3(q),fold=abs(sin(p.y*130.+large*29.+fine*3.));
  if(geology<.5)return fine*.5+pow(1.-abs(fine*2.-1.),5.)*.5;
  if(geology<1.5)return fold*.65+fine*.35;
  if(geology<2.5)return 1.-smoothstep(.04,.14,abs(fine-.48));
  if(geology<3.5)return smoothstep(.1,.45,abs(fine-.5))*1.5;
  if(geology<4.5)return pow(max(0.,fine),3.)*3.;
  if(geology<5.5)return .5+.35*sin(p.y*210.+large*38.+fine*5.);
  if(geology<6.5)return smoothstep(.02,.08,abs(fine-.5));
  if(geology<7.5)return .4+fine*.5+abs(p.y)*.15;
  if(geology<8.5)return fine;
  if(geology<9.5)return pow(1.-abs(fine*2.-1.),2.);
  if(geology<10.5)return 1.-smoothstep(.025,.09,abs(fine-.5));
  return smoothstep(.04,.18,abs(fine-.5));
}
float ringShade(vec3 p,vec3 light,vec3 plane,vec2 radii,float density){
  float facing=dot(plane,light);if(abs(facing)<.02||density<.001)return 1.;
  float t=-dot(p,plane)/facing;if(t<=0.)return 1.;
  float radius=length(p+light*t),edge=.025;
  float shadow=smoothstep(radii.x-edge,radii.x+edge,radius)*(1.-smoothstep(radii.y-edge,radii.y+edge,radius));
  float bands=.65+.35*sin(radius*95.);
  return 1.-shadow*min(.6,density)*(.7+.3*bands);
}
`;
