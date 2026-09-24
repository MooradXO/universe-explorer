import * as THREE from 'three';
import { SURFACES, MATERIALS, CLOUDS, ATMOSPHERES, AURORAS, RINGS } from './EnvironmentLibrary';
import type { EnvironmentProfile } from './EnvironmentProfile';
import { planetDetail, PLANET_DETAIL_GLSL } from './PlanetDetail';

export const ENV_NOISE = /* glsl */`
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
float fbm(vec3 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noise3(p)*a;p=p*2.03+vec3(3.2,5.7,1.4);a*=.5;}return n;}
float ridge(vec3 p){return 1.-abs(fbm(p)*2.-1.);}
float cells(vec3 p){vec3 i=floor(p),f=fract(p);float d=4.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 g=vec3(float(x),float(y),float(z));vec3 q=g+vec3(hash(i+g),hash(i+g+17.),hash(i+g+59.))-f;d=min(d,dot(q,q));}return sqrt(d);}
`;
export const ENV_VERTEX = /* glsl */`
varying vec3 vLocal,vWorld,vNormal;varying vec2 vUv;
void main(){vLocal=position;vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}
`;
const output = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

/** Reference counted, asynchronous textures: leaving a world frees its maps, including pending loads. */
export class EnvironmentTextures {
  private entries = new Map<string, { texture: THREE.Texture; users: number }>();
  constructor(readonly low: boolean) {}
  acquire(name: string) {
    const old = this.entries.get(name); if (old) { old.users++; return old.texture; }
    const texture = new THREE.TextureLoader().load(`/assets/environments/${this.low ? 'low' : 'high'}/${name}.webp`,
      loaded => { loaded.userData.ready = true; }, undefined, () => { texture.userData.failed = true; });
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = ['regolith','ice','mineral','clouds'].includes(name) ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    texture.anisotropy = this.low ? 1 : 4;
    this.entries.set(name, { texture, users: 1 }); return texture;
  }
  release(name: string) { const entry = this.entries.get(name); if (entry && --entry.users === 0) { entry.texture.dispose(); this.entries.delete(name); } }
  dispose() { for (const { texture } of this.entries.values()) texture.dispose(); this.entries.clear(); }
}

export function surfaceMaterial(profile: EnvironmentProfile, direction: THREE.Vector3, light: number, detail: THREE.Texture, solar: THREE.Texture | null,
  options: { low?: boolean; solarName?: string; cloudTexture?: THREE.Texture; layers?: { geology?: number; circulation?: number } } = {}) {
  const recipe = SURFACES[profile.surface], material = MATERIALS[profile.material];
  const art = planetDetail(profile, options.solarName);
  const edit=profile.editor;
  if(edit)Object.assign(art,{geology:edit.geology,circulation:edit.circulation,detail:edit.detail,stormStrength:edit.storms,wind:edit.wind,contrast:edit.contrast,frost:edit.frost,cloudShadow:edit.cloudShadow,palette:[...profile.colors.slice(0,3)]});
  if (options.layers?.geology !== undefined) art.geology = options.layers.geology;
  if (options.layers?.circulation !== undefined) art.circulation = options.layers.circulation;
  const ringPlane = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...(profile.ring?.tilt ?? [0, 0, 0])));
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, precision: 'highp', defines:{SURFACE_GROUP:recipe.group,SURFACE_SHAPE:recipe.shape,STORM_COUNT:options.low?2:3}, uniforms: {
    colors: { value: art.palette.map(c => new THREE.Color(c)) }, group: { value: recipe.group }, shape: { value: recipe.shape },
    storms: { value: art.storms.map(s => new THREE.Vector4(...s)) }, geology: { value: art.geology }, circulation: { value: art.circulation },
    detailStrength: { value: art.detail }, wind: { value: art.wind }, stormStrength: { value: art.stormStrength },
    contrast: { value: art.contrast }, cloudShadow: { value: options.cloudTexture ? art.cloudShadow : 0 }, haze: { value: art.haze }, frost: { value: art.frost },
    ringPlane: { value: ringPlane }, ringRadii: { value: new THREE.Vector2(profile.ring?.inner ?? 0, profile.ring?.outer ?? 0) }, ringDensity: { value: profile.ring?.density ?? 0 },
    geography: { value: profile.geography }, warp: { value: profile.warp }, seed: { value: profile.seed % 997 }, variant: { value: profile.variant },
    grain: { value: material.grain }, coating: { value: material.coverage }, roughness: { value: edit?.roughness??material.roughness }, relief: { value: edit?.relief??material.relief }, oceanLevel: { value: edit?.ocean??recipe.oceanLevel },
    lightDir: { value: direction }, lightColor: { value: new THREE.Color(light).lerp(new THREE.Color('white'), .8) },
    detailMap: { value: detail }, cloudMap: { value: options.cloudTexture ?? detail }, solarMap: { value: solar }, useSolar: { value: solar?.userData.ready ? 1 : 0 }, time: { value: 0 },
    bakedMap: { value: detail }, bakedBlend: { value: 0 }, detailLod: { value: 0 },
  }, fragmentShader: /* glsl */`
    ${ENV_NOISE}
    varying vec3 vLocal,vWorld,vNormal;varying vec2 vUv;
    uniform vec3 colors[3],lightDir,lightColor,ringPlane;uniform vec2 ringRadii;uniform float ringDensity;
    uniform sampler2D detailMap,solarMap,cloudMap;
    uniform sampler2D bakedMap;uniform float bakedBlend,detailLod;
    const float group=float(SURFACE_GROUP),shape=float(SURFACE_SHAPE);
    uniform float geography,warp,seed,variant,grain,coating,roughness,relief,oceanLevel,useSolar,time;
    ${PLANET_DETAIL_GLSL}
    float morphology(vec3 q,vec3 p){
      float n=fbm(q),r=ridge(q*1.7),lat=abs(p.y),s=shape;
      if(group<.5){
        if(s<.5)return mix(n,1.-cells(q*2.1),.65);
        if(s<1.5){float c=cells(q*1.8);return n*.4+exp(-pow((c-.45)*12.,2.))*.5;}
        if(s<2.5)return n*.3+(1.-cells(q*vec3(1,3,1)))*.65;
        if(s<3.5)return n*.6+fbm(q*12.)*.4;
        if(s<4.5)return .3+n*.45-abs(sin(p.y*9.+fbm(q*2.)*4.))*.22;
        if(s<5.5)return floor(n*5.)/5.+fbm(q*8.)*.08;
        if(s<6.5)return .4+.14*sin(q.x*9.+n*12.)+n*.2;
        if(s<7.5)return r*r*.65+n*.2;
        if(s<8.5)return n*.6+smoothstep(.03,.11,abs(fbm(q*3.)-.5))*.28;
        if(s<9.5)return floor(cells(q)*6.)/9.;
        if(s<10.5)return n*.65-.22*exp(-pow((ridge(q*2.)-.7)*30.,2.));
        if(s<11.5)return n*.6+smoothstep(.6,.9,lat)*.36;
        if(s<12.5)return smoothstep(.25,.75,n)*.4+fbm(q*7.)*.17;
        if(s<13.5)return n*.75-.3*exp(-pow((p.x+.15*sin(p.y*7.))*14.,2.));
        if(s<14.5)return n*.7+sin(q.y*14.+n*6.)*.12;
        return smoothstep(.4,.58,n)*.48+cells(q*2.)*.18;
      }
      if(group<1.5){
        if(s<.5)return n;
        if(s<1.5)return cells(q*1.6)*.65+n*.2;
        if(s<2.5)return .5+sin(q.y*3.+n*12.)*.12;
        if(s<3.5)return ridge(q*3.)*.65;
        if(s<4.5)return pow(1.-cells(q),2.)*.7+.23;
        if(s<5.5)return n*.4+ridge(q*7.)*.4;
        if(s<6.5)return p.x*.28+n*.5+.2;
        return fbm(q*2.)*.75+cells(q*.8)*.2;
      }
      if(group<2.5){
        if(s<.5)return smoothstep(.26,.6,cells(q*2.))*.5+n*.25;
        if(s<1.5)return sin(q.y*7.+n*9.)*.19+.5;
        if(s<2.5)return 1.-cells(q)*.7;
        if(s<3.5)return smoothstep(.03,.13,abs(n-.5))*.65;
        if(s<4.5)return lat*.7+n*.3;
        if(s<5.5)return pow(r,3.);
        if(s<6.5)return n*.4+smoothstep(.5,.6,fbm(q*.7))*.3;
        return n*.4+pow(1.-cells(q*1.6),2.)*.5;
      }
      if(group<3.5){
        if(s<.5)return n;
        if(s<1.5)return fbm(q*2.);
        if(s<2.5)return .48-abs(cells(q*1.3)-.48)*.6;
        if(s<3.5)return .48+.14*sin(p.x*8.+n*4.);
        if(s<4.5)return n*.5+lat*.36;
        if(s<5.5)return ridge(q)*.7;
        if(s<6.5)return fbm(q*.48)*.8+.12;
        return .46+.09*sin(q.x*7.+n*8.)+n*.12;
      }
      if(group<4.5){
        if(s<.5)return floor(n*6.)/6.+fbm(q*9.)*.1;
        if(s<1.5)return sin(q.y*6.+n*8.)*.2+.5;
        if(s<2.5)return smoothstep(.3,.7,n)*.6;
        if(s<3.5)return 1.-smoothstep(.02,.1,abs(fbm(q*3.)-.5));
        if(s<4.5)return cells(q*2.);
        if(s<5.5)return pow(r,4.);
        if(s<6.5)return n*.5+fbm(q*4.)*.4;
        return floor((n+p.y*.12)*9.)/9.;
      }
      float bands=sin(p.y*(15.+mod(s,4.)*18.)+n*warp*18.);
      if(s<.5)return .5+bands*.28;
      if(s<1.5)return .5+bands*.24+sin(p.y*140.+n*9.)*.1;
      if(s<2.5){vec2 d=p.xy-vec2(.35,.2);float storm=exp(-dot(d,d)*12.);return .45+bands*.12+storm*(.15+.12*sin(length(d)*50.+atan(d.y,d.x)*2.+n*8.));}
      if(s<3.5)return .5+sin(p.y*40.+sin(p.x*14.+p.z*8.)*3.+n*5.)*.28;
      if(s<4.5)return .45+n*.18+sin(atan(p.z,p.x)*5.+lat*45.+n*5.)*.18*smoothstep(.35,.85,lat);
      if(s<5.5)return .5+sin(p.y*25.+sin(p.x*9.)*2.+n*4.)*.27;
      if(s<6.5){vec2 d=p.xy-vec2(.43,.23),e=p.xy+vec2(.35,.3);float a=exp(-dot(d,d)*13.),b=exp(-dot(e,e)*18.);return .45+bands*.08+a*(.2+.12*sin(length(d)*44.+n*12.))+b*(.1+.13*sin(length(e)*53.+n*14.));}
      if(s<7.5)return n*.7+bands*.12;
      if(s<8.5)return n*.55+.2;
      if(s<9.5)return .5+sin(q.x*6.+ridge(q*2.)*12.)*.18;
      if(s<10.5)return .5+sin(p.y*60.+fbm(q*2.)*14.)*.27;
      if(s<11.5)return .5+bands*.3*exp(-p.y*p.y*2.);
      if(s<12.5)return .5+bands*.28*smoothstep(.28,.6,fbm(q*2.));
      if(s<13.5)return .5+sin(p.y*35.+cells(q*2.)*10.)*.22;
      if(s<14.5)return floor((.5+bands*.3)*7.)/7.;
      return .45+n*.22+sin(atan(p.z,p.x)*2.+p.y*12.+n*11.)*.16;
    }
    vec3 triplanar(vec3 p){vec3 w=pow(abs(p),vec3(5.));w/=w.x+w.y+w.z;vec3 q=p*(2.1+variant*.17);return texture2D(detailMap,q.yz).rgb*w.x+texture2D(detailMap,q.zx).rgb*w.y+texture2D(detailMap,q.xy).rgb*w.z;}
    void main(){
      vec3 p=normalize(vLocal),n=normalize(vNormal),v=normalize(cameraPosition-vWorld);
      float h=.5,grainField=.5,land=1.,intensity=.5,glow=0.,micro=.5,stormMask=0.;
      vec3 albedo=colors[1];
      if(useSolar<.5){
      vec3 original=p;
      if(group>4.5)p=circulationDomain(p,stormMask);
      vec3 q=p*geography+vec3(seed*.013,seed*.017,seed*.023);q+=warp*vec3(fbm(q*2.),fbm(q*2.+17.),fbm(q*2.+31.));
      h=morphology(q,p);grainField=fbm(p*grain+seed*.01);
      albedo=mix(colors[0],mix(colors[1],colors[2],smoothstep(.52,.78,h)),smoothstep(.18,.58,h));
      vec3 detail=triplanar(p);intensity=dot(detail,vec3(.21,.72,.07));
      micro=fineTerrain(p,h);h+=(micro-.5)*detailStrength*.07;
      albedo*=.72+intensity*.8;albedo*=.86+grainField*.28;
      if(group<.5||group>3.5&&group<4.5){albedo*=.82+micro*.36;albedo=mix(albedo,colors[2],pow(max(0.,micro),6.)*.15);}
      if(group>1.5&&group<2.5){float fissure=1.-smoothstep(.025,.09,abs(micro-.45));albedo=mix(albedo,colors[0]*.5,fissure*.55);albedo=mix(albedo,colors[2],smoothstep(.65,.94,abs(p.y)+h*.15)*frost);}
      if(group>2.5&&group<3.5){
        land=smoothstep(oceanLevel-.008,oceanLevel+.008,h);
        float shelf=smoothstep(oceanLevel-.06,oceanLevel,h)*(1.-land);
        albedo=mix(colors[0]*(.6+grainField*.23)+vec3(.025,.13,.12)*shelf,mix(colors[2],colors[1],smoothstep(oceanLevel+.015,oceanLevel+.11,h))*(.77+micro*.4),land);
        float snow=smoothstep(oceanLevel+.2,oceanLevel+.32,h)*land+smoothstep(.84,.97,abs(p.y)+grainField*.07);
        albedo=mix(albedo,vec3(.72,.81,.86),clamp(snow,0.,1.));
      }
      if(group>.5&&group<1.5){glow=(1.-smoothstep(.008,.045,abs(h-(.42+variant*.013))))*(.5+grainField*.5);glow*=.85+.15*sin(time*.4+micro*8.);albedo*=.38;}
      if(group>4.5){
        float filaments=noise3(p*vec3(90.,210.,90.)+q*7.);
        h+=sin(p.y*(110.+circulation*8.)+fbm(q*2.)*7.)*.055;
        albedo=mix(colors[0],mix(colors[1],colors[2],smoothstep(.4,.72,h)),smoothstep(.08,.58,h))*(.84+filaments*.24);
        albedo=mix(albedo,colors[1]*(.7+filaments*.6),stormMask*.28);
      }
      p=original;
      }else{
        vec2 uv=vUv;if(group>4.5)uv.x+=sin(p.y*16.)*sin(time*.012)*.0008;
        albedo=texture2D(solarMap,uv).rgb;
        float luminance=dot(albedo,vec3(.2126,.7152,.0722));
        albedo=max(vec3(0.),mix(vec3(luminance),albedo,contrast)*contrast+(1.-contrast)*.16);
        if(group>4.5){
          // The atlas supplies the familiar belts. Small spherical eddies remain
          // detailed when a giant fills the screen, including on the mobile atlas.
          float turbulence=fbm(p*31.+vec3(seed*.01,time*wind,0.));
          float threads=fbm(p*vec3(75.,180.,75.)+vec3(turbulence*8.,turbulence*2.,time*.003));
          float closeDetail=1.-smoothstep(.008,.025,max(length(dFdx(p)),length(dFdy(p))));
          albedo*=1.+(threads-.45)*.6*stormStrength*closeDetail;
        }
        if(group>2.5&&group<3.5)land=smoothstep(.04,.12,albedo.r+albedo.g-albedo.b*.8);
        intensity=luminance;
      }
      // Surface-gradient shading uses the same geography and material as the albedo.
      // Normalized derivatives preserve the look across actual planet radii and floating origins.
      vec4 packedDetail=texture2D(bakedMap,vUv);
      float localDetail=bakedBlend*detailLod;
      float height=(h*.4+intensity*.18+grainField*.03+micro*.004)*relief*.25*(1.-useSolar);
      height+=((packedDetail.r-.5)*.012+(packedDetail.g-.5)*.002)*localDetail*(group>4.5?.18:1.);
      albedo*=1.+(packedDetail.g-.5)*localDetail*.09;
      vec3 dx=dFdx(vWorld),dy=dFdy(vWorld),tx=cross(dy,n),ty=cross(n,dx);
      float determinant=dot(dx,tx),worldScale=length(dx)/max(length(dFdx(p)),.000001);
      vec3 slope=(tx*dFdx(height)+ty*dFdy(height))*worldScale*sign(determinant)/max(abs(determinant),.00000001);
      slope*=min(1.,.45/max(length(slope),.000001));
      float detailFade=1.-smoothstep(.015,.065,max(length(dFdx(p)),length(dFdy(p))));
      float dry=group>2.5&&group<3.5?land:1.;
      n=normalize(n-slope*dry*detailFade);
      float surfaceRoughness=mix(roughness,packedDetail.b,localDetail*.4*(1.-useSolar));
      float day=max(dot(n,lightDir),0.),spec=pow(max(dot(reflect(-lightDir,n),v),0.),mix(95.,10.,surfaceRoughness))*(1.-surfaceRoughness)*coating;
      spec+=pow(max(dot(reflect(-lightDir,n),v),0.),65.)*packedDetail.a*localDetail*.12*(1.-useSolar);
      if(group>2.5&&group<3.5)spec+=pow(max(dot(reflect(-lightDir,n),v),0.),100.)*(1.-land)*.5;
      float shadow=ringShade(normalize(vNormal),lightDir,ringPlane,ringRadii,ringDensity);
      if(cloudShadow>.001){float cloud=texture2D(cloudMap,vUv+vec2(time*.0001+.006,.004)).r;shadow*=1.-smoothstep(.25,.7,cloud)*cloudShadow;}
      float grazing=pow(1.-max(dot(n,v),0.),3.)*haze;
      float daylight=group>4.5?1.3:1.6;
      vec3 color=albedo*(.075+day*daylight*lightColor*shadow)+spec*day*lightColor*shadow+glow*vec3(1.4,.19,.025);
      color+=mix(vec3(.12,.3,.5),lightColor,.45)*grazing*smoothstep(-.15,.4,dot(n,lightDir));
      gl_FragColor=vec4(color,1.);${output}
    }` });
}

export function cloudMaterial(profile: EnvironmentProfile, direction: THREE.Vector3, layer: number, texture: THREE.Texture) {
  const recipe = CLOUDS[profile.clouds!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, lightDir: { value: direction }, shape: { value: recipe.shape }, stack: { value: recipe.stack },
      coverage: { value: profile.editor?.cloudCoverage??recipe.coverage }, scale: { value: recipe.scale }, layer: { value: layer }, seed: { value: profile.seed % 997 }, cloudMap: { value: texture } },
    fragmentShader: /* glsl */`${ENV_NOISE}
    varying vec3 vLocal,vWorld,vNormal;varying vec2 vUv;uniform vec3 lightDir;uniform float time,shape,stack,coverage,scale,layer,seed;uniform sampler2D cloudMap;
    void main(){vec3 p=normalize(vLocal),q=p*scale+vec3(seed*.01,time*.006*(layer<.5?1.:-1.),layer*7.);float n=fbm(q),f=n;
      if(shape<.5)f=fbm(q+vec3(n*2.,0,0));
      else if(shape<1.5)f=.5+.18*sin(length(p.xy-vec2(.3,-.2))*35.+atan(p.y+.2,p.x-.3)*3.+n*4.);
      else if(shape<2.5)f=.5+.18*sin(q.x*7.+n*9.);
      else if(shape<3.5)f=1.-cells(q*1.3);
      else if(shape<4.5)f=.5+.24*sin(p.y*30.+n*5.);
      else if(shape<5.5)f=n*.5+abs(p.y)*.4;
      else if(shape<6.5)f=n*fbm(q*2.)*1.7;
      else f=.35+n*.5;
      if(stack>1.5&&stack<2.5)f+=sin(p.y*17.+time*.06)*.07;
      if(stack>2.5)f*=.8+.2*sin(q.z*3.+time*.07);
      float photographic=texture2D(cloudMap,vUv+vec2(time*.0001,layer*.1)).r;
      float a=smoothstep(.57-coverage*.24,.72-coverage*.24,f+photographic*.11)*(.65-layer*.18);
      float sun=dot(normalize(vNormal),lightDir),day=max(0.,sun);
      float wisps=noise3(q*12.+n*4.);a*=.78+wisps*.28;
      float depth=.72+smoothstep(.36,.7,f)*.32;
      vec3 warm=mix(vec3(.85,.49,.28),vec3(.93,.96,1.),smoothstep(.02,.25,day));
      vec3 color=vec3(.035,.05,.08)+warm*day*1.35*depth;
      gl_FragColor=vec4(color,a);${output}}` });
}

export function atmosphereMaterial(profile: EnvironmentProfile, direction: THREE.Vector3, tint = profile.colors[3]) {
  const a = ATMOSPHERES[profile.atmosphere!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(profile.editor?profile.colors[3]:tint) }, lightDir: { value: direction }, type: { value: a.type }, layer: { value: a.layer }, strength: { value: profile.editor?.atmosphereDensity??a.density }, falloff: { value: a.falloff } },
    fragmentShader: /* glsl */`${ENV_NOISE} varying vec3 vLocal,vWorld,vNormal;uniform vec3 tint,lightDir;uniform float type,layer,strength,falloff;
    void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);float limb=1.-max(dot(n,v),0.);float ring=pow(limb,falloff),day=smoothstep(-.35,.65,dot(n,lightDir));
    if(type<.5)ring*=.8;else if(type<1.5)ring*=.7+fbm(vLocal*8.)*.5;else if(type<2.5)ring=pow(limb,falloff*.65);else if(type<3.5)ring*=.7+.3*abs(vLocal.y);else if(type<4.5)ring*=smoothstep(.55,.9,limb);else ring*=.7+.3*sin(limb*(30.+layer*12.));
    float sunset=exp(-pow(dot(n,lightDir)*7.,2.));
    vec3 scatter=mix(tint,vec3(.72,.27,.10),sunset*.32);
    gl_FragColor=vec4(scatter,ring*day*strength*.68);${output}}` });
}

export function auroraMaterial(profile: EnvironmentProfile, direction: THREE.Vector3) {
  const a = AURORAS[profile.aurora!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(profile.backdrop.cool) }, time: { value: 0 }, lightDir: { value: direction }, shape: { value: a.shape }, mode: { value: a.mode } },
    fragmentShader: /* glsl */`${ENV_NOISE} varying vec3 vLocal,vWorld,vNormal;uniform vec3 tint,lightDir;uniform float time,shape,mode;
    void main(){vec3 p=normalize(vLocal);float lon=atan(p.z,p.x),lat=abs(p.y),t=time*.09;float center=.77+.015*sin(lon*5.+t),w=.03;
    if(shape<.5)w=.018;else if(shape<1.5){center+=sin(lon*14.+t)*.026;w=.055;}else if(shape<2.5)center+=sin(lon*29.)*.09;else if(shape<3.5)w*=smoothstep(-.4,.5,sin(lon*5.+t));else if(shape<4.5)center+=.045*sign(sin(lon*3.));else if(shape<5.5)center+=.11*sin(lon*2.+t);else if(shape<6.5)center+=lon*.025;else center+=.05*sin(lon*37.+t);
    float f=exp(-pow((lat-center)/max(.004,w),2.))*(.6+.4*sin(lon*(24.+mode*17.)+t*2.));float edge=pow(1.-max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.),.6);
    vec3 curtain=mix(vec3(.12,.72,.4),mix(tint,vec3(.43,.2,.8),.45),smoothstep(center-.025,center+.05,lat));
    gl_FragColor=vec4(curtain,f*edge*(.55-.3*max(dot(normalize(vNormal),lightDir),0.)));${output}}` });
}

export function ringMaterial(profile: EnvironmentProfile, direction: THREE.Vector3) {
  const ring = profile.ring!, recipe = RINGS[ring.recipe];
  const ringLight=direction.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...ring.tilt)).invert());
  const material = new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { tint: { value: new THREE.Color(ring.tint) }, lightDir: { value: direction }, ringLight:{value:ringLight},inner: { value: ring.inner }, outer: { value: ring.outer },
      shape: { value: recipe.shape }, layer: { value: recipe.layer }, density: { value: ring.density } },
    fragmentShader: /* glsl */`${ENV_NOISE} varying vec3 vLocal,vWorld,vNormal;uniform vec3 tint,lightDir,ringLight;uniform float inner,outer,shape,layer,density;
    void main(){float r=length(vLocal.xy),a=atan(vLocal.y,vLocal.x),u=(r-inner)/(outer-inner),f=1.;float frequency=180.+layer*75.;float bands=sin(u*frequency)*(1.-smoothstep(.3,2.,fwidth(u)*frequency));
      if(shape<.5)f=.65+.25*bands;
      else if(shape<1.5)f=pow(.5+.5*bands,8.);
      else if(shape<2.5)f=smoothstep(.25,.4,abs(sin(u*(5.+layer*2.))))*(.7+.2*bands);
      else if(shape<3.5)f=smoothstep(-.15,.4,sin(a*(2.+layer)+u*3.))*(.65+.2*bands);
      else if(shape<4.5)f=exp(-u*2.)*(.4+.4*fbm(vLocal*8.));
      else if(shape<5.5)f=(exp(-pow((u-.2)*14.,2.))+exp(-pow((u-.75)*12.,2.)))*(.7+.2*bands);
      else if(shape<6.5)f=.4+.35*sin(u*(45.+layer*15.)+sin(a*8.)*.8);
      else f=smoothstep(.38,.7,noise3(vec3(a*(70.+layer*23.),u*95.,7.)))*(.35+.3*bands);
      float edge=smoothstep(0.,.04,u)*(1.-smoothstep(.96,1.,u));
      float along=-dot(vLocal,ringLight),separation=length(vLocal+ringLight*max(0.,along));
      float shadow=along>0.?smoothstep(.85,1.03,separation):1.;
      float illumination=(.2+abs(dot(normalize(vNormal),lightDir))*.6)*(.16+.84*shadow);
      float grainFade=1.-smoothstep(.12,.8,max(fwidth(a)*240.,fwidth(u)*310.));
      float grain=.84+(noise3(vec3(a*240.,u*310.,9.))-.5)*.22*grainFade;
      vec3 strata=mix(tint*.64,tint*1.14,.5+.5*sin(u*29.+sin(u*67.)*.5));
      gl_FragColor=vec4(strata*illumination,clamp(f*edge*density*grain*.8,0.,.72));${output}}` });
  material.forceSinglePass = true; return material;
}
