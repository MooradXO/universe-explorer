import * as THREE from 'three';
export interface SpacePalette {
  ocean:string; land:string; coast:string; rim:string; dust:string; gas:string;
  fill:number; glow:number; nebula:number;
}

const noise = /* glsl */`
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float v=0.0, a=.5;
  for(int i=0;i<5;i++){ v+=a*noise3(p); p=p*2.03+vec3(3.2,5.7,1.4); a*=.5; }
  return v;
}`;
const vertex = /* glsl */`
varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
void main(){ vLocal=position; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }
`;
export const SUN_DIRECTION = new THREE.Vector3(-.65, .48, .5).normalize();
export function planetMaterial(direction: SpacePalette) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex, precision:'highp', uniforms: {
      ocean:{value:new THREE.Color(direction.ocean)}, land:{value:new THREE.Color(direction.land)},
      coast:{value:new THREE.Color(direction.coast)}, lightDir:{value:SUN_DIRECTION},
      fill:{value:direction.fill}, time:{value:0}, mode:{value:0}, seed:{value:0}, cloudAmount:{value:1},
      lightColor:{value:new THREE.Color('#ffffff')},
    }, fragmentShader: /* glsl */`
    ${noise}
    varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
    uniform vec3 ocean,land,coast,lightDir,lightColor; uniform float fill,time,mode,seed,cloudAmount;
    void main(){
      vec3 p=normalize(vLocal), n=normalize(vNormal), viewDir=normalize(cameraPosition-vWorld);
      vec3 seedOffset=vec3(seed*.013,seed*.019,seed*.007);
      float h=fbm(p*3.8+vec3(2.0,7.3,1.0)+seedOffset+.32*vec3(fbm(p*7.0)));
      float footprint=length(fwidth(p));
      float solid=smoothstep(.47,.51,h), detail=mix(.5,fbm(p*90.0),1.0-smoothstep(.007,.025,footprint));
      vec3 albedo=mix(ocean*(.65+detail*.4),mix(coast,land,smoothstep(.50,.61,h))*(.68+.6*detail),solid);
      float polar=smoothstep(.86,.95,abs(p.y)+.09*fbm(p*19.0));
      albedo=mix(albedo,vec3(.72,.79,.8),polar);
      float lava=0.0;
      if(mode>.5 && mode<1.5){
        solid=1.0; albedo=mix(land*.58,coast,smoothstep(.22,.8,h))*(.6+detail*.65);
        float seams=abs(fbm(p*38.0+seedOffset)-.5);albedo*=.8+.2*smoothstep(.01,.055,seams);
      }else if(mode>1.5 && mode<2.5){
        solid=1.0;
        float twist=fbm(p*9.0+seedOffset)*2.0;
        float bands=sin(p.y*53.0+twist*3.0+sin(p.x*13.0+p.z*7.0));
        albedo=mix(land*.65,coast,smoothstep(-.8,.8,bands))*(.8+.3*detail);
      }else if(mode>2.5 && mode<3.5){
        solid=1.0;lava=1.0-smoothstep(.004,.025,abs(fbm(p*15.0+seedOffset)-.5));
        albedo=land*(.35+detail*.6);
      }else if(mode>3.5){
        solid=1.0;albedo=mix(ocean,coast,smoothstep(.25,.7,h))*(.72+detail*.38);
      }
      // Surface color carries fine detail; stable geometric normals prevent
      // derivative relief from growing with astronomical model scale.
      float day=max(dot(n,lightDir),0.0);
      float spec=pow(max(dot(reflect(-lightDir,n),viewDir),0.0),90.0)*(1.0-solid)*.5;
      float cloudField=fbm(p*8.2+vec3(time*.009,3.2,1.3)+vec3(0.0,fbm(p*12.0)*1.8,0.0));
      float clouds=smoothstep(.50,.65,cloudField)*.86*cloudAmount;
      vec3 color=mix(albedo,vec3(.79,.84,.87),clouds);
      color=color*(vec3(fill)+day*1.6*lightColor)+spec*vec3(1.0,.8,.6)*day;
      color+=lava*vec3(1.5,.21,.025);
      gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
}
export function rimMaterial(direction: SpacePalette) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex, precision:'highp', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ tint:{value:new THREE.Color(direction.rim)}, strength:{value:direction.glow}, lightDir:{value:SUN_DIRECTION} },
    fragmentShader: /* glsl */`
      varying vec3 vLocal,vWorld,vNormal; uniform vec3 tint,lightDir; uniform float strength;
      void main(){ vec3 n=normalize(vNormal), v=normalize(cameraPosition-vWorld);
        float rim=pow(1.0-max(dot(n,v),0.0),4.5);
        float day=smoothstep(-.3,.5,dot(n,lightDir));
        gl_FragColor=vec4(tint,rim*day*strength*.65);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
export function nebulaMaterial(direction: SpacePalette) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex, precision:'highp', side:THREE.BackSide, depthWrite:false,
    uniforms:{warm:{value:new THREE.Color(direction.dust)}, cool:{value:new THREE.Color(direction.gas)}, strength:{value:direction.nebula}},
    fragmentShader: /* glsl */`
      ${noise}
      varying vec3 vLocal,vWorld,vNormal; uniform vec3 warm,cool; uniform float strength;
      void main(){
        vec3 p=normalize(vLocal);
        float band=exp(-pow((p.y-p.x*.42+.08)*5.0,2.0));
        float field=fbm(p*5.0+vec3(3.2,1.0,7.0));
        float folds=fbm(p*22.0+vec3(field*3.0));
        float filaments=smoothstep(.32,.7,folds)*pow(field,1.7)*band;
        float dust=smoothstep(.48,.63,fbm(p*16.0+2.0));
        vec3 color=mix(warm,cool,smoothstep(-.4,.6,p.x))*(filaments*2.0)*(1.0-dust*.8)*strength;
        gl_FragColor=vec4(vec3(.002,.003,.006)+color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
export function starMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader:vertex, precision:'highp', uniforms:{time:{value:0},tint:{value:new THREE.Color('#ffd090')}}, fragmentShader: /* glsl */`
      ${noise}
      varying vec3 vLocal,vWorld,vNormal; uniform float time; uniform vec3 tint;
      void main(){ float grain=fbm(normalize(vLocal)*24.0+vec3(time*.045));
        float limb=pow(max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.0),.35);
        gl_FragColor=vec4(tint*mix(1.1,3.8,grain)*(.6+.4*limb),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
export function glowTexture() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,242,215,.9)'); gradient.addColorStop(.09,'rgba(255,211,148,.65)');
  gradient.addColorStop(.3,'rgba(240,148,67,.13)'); gradient.addColorStop(1,'rgba(225,118,42,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;
}
