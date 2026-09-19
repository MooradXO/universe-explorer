import * as THREE from 'three';
import { SURFACES, MATERIALS, CLOUDS, ATMOSPHERES, AURORAS, RINGS } from './EnvironmentLibrary';
import type { EnvironmentProfile } from './EnvironmentProfile';

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
    const texture = new THREE.TextureLoader().load(`/assets/environments/${this.low ? 'low' : 'high'}/${name}.webp`);
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.low ? 1 : 4;
    this.entries.set(name, { texture, users: 1 }); return texture;
  }
  release(name: string) { const entry = this.entries.get(name); if (entry && --entry.users === 0) { entry.texture.dispose(); this.entries.delete(name); } }
  dispose() { for (const { texture } of this.entries.values()) texture.dispose(); this.entries.clear(); }
}

export function surfaceMaterial(profile: EnvironmentProfile, direction: THREE.Vector3, light: number, detail: THREE.Texture, solar: THREE.Texture | null) {
  const recipe = SURFACES[profile.surface], material = MATERIALS[profile.material];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, precision: 'highp', defines:{SURFACE_GROUP:recipe.group,SURFACE_SHAPE:recipe.shape}, uniforms: {
    colors: { value: profile.colors.slice(0,3).map(c => new THREE.Color(c)) }, group: { value: recipe.group }, shape: { value: recipe.shape },
    geography: { value: profile.geography }, warp: { value: profile.warp }, seed: { value: profile.seed % 997 }, variant: { value: profile.variant },
    grain: { value: material.grain }, coating: { value: material.coverage }, roughness: { value: material.roughness }, relief: { value: material.relief }, oceanLevel: { value: recipe.oceanLevel },
    lightDir: { value: direction }, lightColor: { value: new THREE.Color(light).lerp(new THREE.Color('white'), .8) },
    detailMap: { value: detail }, solarMap: { value: solar ?? detail }, useSolar: { value: solar ? 1 : 0 }, time: { value: 0 },
  }, fragmentShader: /* glsl */`
    ${ENV_NOISE}
    varying vec3 vLocal,vWorld,vNormal;varying vec2 vUv;
    uniform vec3 colors[3],lightDir,lightColor;uniform sampler2D detailMap,solarMap;
    const float group=float(SURFACE_GROUP),shape=float(SURFACE_SHAPE);
    uniform float geography,warp,seed,variant,grain,coating,roughness,relief,oceanLevel,useSolar,time;
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
      vec3 q=p*geography+vec3(seed*.013,seed*.017,seed*.023);q+=warp*vec3(fbm(q*2.),fbm(q*2.+17.),fbm(q*2.+31.));
      float h=morphology(q,p),grainField=fbm(p*grain+seed*.01),land=1.;
      vec3 albedo=mix(colors[0],mix(colors[1],colors[2],smoothstep(.52,.78,h)),smoothstep(.18,.58,h));
      vec3 detail=triplanar(p);float intensity=dot(detail,vec3(.21,.72,.07));
      albedo*=.72+intensity*.8;albedo*=.86+grainField*.28;
      float glow=0.;
      if(group>2.5&&group<3.5){land=smoothstep(oceanLevel-.016,oceanLevel+.016,h);albedo=mix(colors[0]*(.68+grainField*.3),mix(colors[2],colors[1],smoothstep(oceanLevel+.02,oceanLevel+.12,h)),land);albedo=mix(albedo,vec3(.73,.8,.82),smoothstep(.87,.98,abs(p.y)+grainField*.04));}
      if(group>.5&&group<1.5){glow=(1.-smoothstep(.015,.06,abs(h-(.42+variant*.013))))*(.45+grainField*.55);albedo*=.45;}
      if(group>4.5)albedo=mix(colors[0],mix(colors[1],colors[2],smoothstep(.48,.8,h)),smoothstep(.08,.64,h))*(.75+grainField*.2+intensity*.3);
      if(useSolar>.5)albedo=texture2D(solarMap,vUv).rgb;
      // Surface-gradient shading uses the same geography and material as the albedo.
      // Normalized derivatives preserve the look across actual planet radii and floating origins.
      float height=(h*.4+intensity*.18+grainField*.03)*relief*.25;
      vec3 dx=dFdx(vWorld),dy=dFdy(vWorld),tx=cross(dy,n),ty=cross(n,dx);
      float determinant=dot(dx,tx),worldScale=length(dx)/max(length(dFdx(p)),.000001);
      vec3 slope=(tx*dFdx(height)+ty*dFdy(height))*worldScale*sign(determinant)/max(abs(determinant),.00000001);
      slope*=min(1.,.45/max(length(slope),.000001));
      float detailFade=1.-smoothstep(.015,.065,max(length(dFdx(p)),length(dFdy(p))));
      float dry=group>2.5&&group<3.5?land:1.;
      n=normalize(n-slope*dry*detailFade*(1.-useSolar));
      float day=max(dot(n,lightDir),0.),spec=pow(max(dot(reflect(-lightDir,n),v),0.),mix(95.,10.,roughness))*(1.-roughness)*coating;
      if(group>2.5&&group<3.5)spec+=pow(max(dot(reflect(-lightDir,n),v),0.),100.)*(1.-land)*.5;
      vec3 color=albedo*(.075+day*1.6*lightColor)+spec*day*lightColor+glow*vec3(1.4,.19,.025);
      gl_FragColor=vec4(color,1.);${output}
    }` });
}

export function cloudMaterial(profile: EnvironmentProfile, direction: THREE.Vector3, layer: number, texture: THREE.Texture) {
  const recipe = CLOUDS[profile.clouds!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, lightDir: { value: direction }, shape: { value: recipe.shape }, stack: { value: recipe.stack },
      coverage: { value: recipe.coverage }, scale: { value: recipe.scale }, layer: { value: layer }, seed: { value: profile.seed % 997 }, cloudMap: { value: texture } },
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
      vec3 color=vec3(.7,.76,.8)*(.12+max(dot(normalize(vNormal),lightDir),0.)*1.3);
      gl_FragColor=vec4(color,a);${output}}` });
}

export function atmosphereMaterial(profile: EnvironmentProfile, direction: THREE.Vector3) {
  const a = ATMOSPHERES[profile.atmosphere!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(profile.colors[3]) }, lightDir: { value: direction }, type: { value: a.type }, layer: { value: a.layer }, strength: { value: a.density }, falloff: { value: a.falloff } },
    fragmentShader: /* glsl */`${ENV_NOISE} varying vec3 vLocal,vWorld,vNormal;uniform vec3 tint,lightDir;uniform float type,layer,strength,falloff;
    void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);float limb=1.-max(dot(n,v),0.);float ring=pow(limb,falloff),day=smoothstep(-.35,.65,dot(n,lightDir));
    if(type<.5)ring*=.8;else if(type<1.5)ring*=.7+fbm(vLocal*8.)*.5;else if(type<2.5)ring=pow(limb,falloff*.65);else if(type<3.5)ring*=.7+.3*abs(vLocal.y);else if(type<4.5)ring*=smoothstep(.55,.9,limb);else ring*=.7+.3*sin(limb*(30.+layer*12.));
    gl_FragColor=vec4(tint,ring*day*strength*.75);${output}}` });
}

export function auroraMaterial(profile: EnvironmentProfile, direction: THREE.Vector3) {
  const a = AURORAS[profile.aurora!];
  return new THREE.ShaderMaterial({ vertexShader: ENV_VERTEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(profile.backdrop.cool) }, time: { value: 0 }, lightDir: { value: direction }, shape: { value: a.shape }, mode: { value: a.mode } },
    fragmentShader: /* glsl */`${ENV_NOISE} varying vec3 vLocal,vWorld,vNormal;uniform vec3 tint,lightDir;uniform float time,shape,mode;
    void main(){vec3 p=normalize(vLocal);float lon=atan(p.z,p.x),lat=abs(p.y),t=time*.09;float center=.77+.015*sin(lon*5.+t),w=.03;
    if(shape<.5)w=.018;else if(shape<1.5){center+=sin(lon*14.+t)*.026;w=.055;}else if(shape<2.5)center+=sin(lon*29.)*.09;else if(shape<3.5)w*=smoothstep(-.4,.5,sin(lon*5.+t));else if(shape<4.5)center+=.045*sign(sin(lon*3.));else if(shape<5.5)center+=.11*sin(lon*2.+t);else if(shape<6.5)center+=lon*.025;else center+=.05*sin(lon*37.+t);
    float f=exp(-pow((lat-center)/max(.004,w),2.))*(.6+.4*sin(lon*(24.+mode*17.)+t*2.));float edge=pow(1.-max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.),.6);
    gl_FragColor=vec4(mix(tint,vec3(.3,.7,.48),mode*.35),f*edge*(.55-.3*max(dot(normalize(vNormal),lightDir),0.)));${output}}` });
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
      float grain=.6+.4*noise3(vec3(a*240.,u*310.,9.));
      gl_FragColor=vec4(tint*illumination,clamp(f*edge*density*grain*.68,0.,.64));${output}}` });
  material.forceSinglePass = true; return material;
}
