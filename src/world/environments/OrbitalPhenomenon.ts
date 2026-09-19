import * as THREE from 'three';
import { createSeededRandom } from '../celestial/WorldSeed';
import { PHENOMENA } from './EnvironmentLibrary';
import type { OrbitalZone } from '../systems/OrbitalSite';

/** Shape and motion are independent: eight silhouettes, four time behaviours. No world-coordinate particle simulation. */
export class OrbitalPhenomenon {
  readonly group=new THREE.Group();
  private geometry=new THREE.BufferGeometry();
  private material:THREE.ShaderMaterial;
  readonly count:number;
  constructor(readonly zone:OrbitalZone,low:boolean){
    const recipe=PHENOMENA[zone.phenomenon],random=createSeededRandom(zone.profile.seed+zone.index*271);
    this.count=low?120:320;
    const values=Array.from({length:this.count*3},()=>random());this.geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{time:{value:0},fade:{value:1},shape:{value:recipe.shape},behavior:{value:recipe.behavior},period:{value:recipe.period},
        warm:{value:new THREE.Color(zone.profile.backdrop.warm)},cool:{value:new THREE.Color(zone.profile.backdrop.cool)}},
      vertexShader:/* glsl */`
        uniform float time,shape,behavior,period;varying float alpha,mixColor;
        void main(){float t=position.x,a=position.y*6.283185,j=position.z-.5,clock=time/period;vec3 p=vec3(0.);
          if(shape<.5){float r=140.+80.*t;p=vec3(cos(a)*r,sin(a)*r,j*35.);}
          else if(shape<1.5){float r=15.+t*t*90.;p=vec3(cos(a)*r,(t-.5)*620.,sin(a)*r);}
          else if(shape<2.5){float r=30.+t*240.;p=vec3(cos(a+t*12.)*r,j*80.,sin(a+t*12.)*r);}
          else if(shape<3.5){float r=floor(t*4.)*75.+40.;p=vec3(cos(a)*r,sin(a)*r,j*12.);}
          else if(shape<4.5){float s=floor(position.y*5.);p=vec3((s-2.)*65.+sin(t*12.+s)*32.,(t-.5)*500.,cos(t*12.+s)*40.);}
          else if(shape<5.5)p=vec3((t-.5)*620.,sin(t*10.+a)*25.,j*280.);
          else if(shape<6.5){float r=180.+j*15.;p=vec3(cos(a)*r,sin(a)*r,(t-.5)*40.);}
          else{float r=t*180.;p=vec3(cos(a)*r,(t-.5)*520.,sin(a)*r);}
          alpha=.35+.45*position.z;
          if(behavior<.5){p*=.85+.15*sin(clock*6.283);alpha*=.65+.35*sin(clock*6.283+t*3.);}
          else if(behavior<1.5){float c=cos(clock*.5),s=sin(clock*.5);p.xz=mat2(c,-s,s,c)*p.xz;}
          else if(behavior<2.5){p.y+=sin(t*12.-clock*6.283)*35.;alpha*=.55+.45*sin(t*12.-clock*6.283);}
          else{p.x+=sign(j)*85.;p.y+=sin(clock*3.+sign(j)*2.)*35.;}
          mixColor=t;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((18.+position.z*24.)*650./max(1.,-mv.z),1.,45.);
        }`,
      fragmentShader:/* glsl */`uniform vec3 warm,cool;uniform float fade;varying float alpha,mixColor;
        void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float falloff=exp(-r*r*5.)*(1.-smoothstep(.65,1.,r));
        gl_FragColor=vec4(mix(warm,cool,mixColor)*1.5,falloff*alpha*.62*fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const points=new THREE.Points(this.geometry,this.material);points.frustumCulled=false;this.group.add(points);this.group.name=recipe.name;
  }
  update(elapsed:number){this.material.uniforms.time.value=elapsed;}
  setOpacity(value:number){this.material.uniforms.fade.value=value;}
  snapshot(){return {recipe:this.zone.phenomenon,name:PHENOMENA[this.zone.phenomenon].name,particles:this.count};}
  dispose(){this.geometry.dispose();this.material.dispose();this.group.clear();}
}
