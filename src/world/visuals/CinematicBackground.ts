import * as THREE from 'three';
import { nebulaMaterial } from './SpaceMaterials';
import { CINEMATIC_STYLE } from './CinematicStyle';
import { hashString } from '../celestial/WorldSeed';
import type { EnvironmentProfile } from '../environments/EnvironmentProfile';

/** Decorative gas backdrop. It never replaces or moves catalogue stars. */
export class CinematicBackground {
  readonly mesh:THREE.Mesh;
  private material=nebulaMaterial(CINEMATIC_STYLE);
  private geometry=new THREE.SphereGeometry(1,24,16);
  private active:EnvironmentProfile|null=null;
  constructor(id:string,private low:boolean){
    const seed=hashString(`${id}:cinematic-background:v1`);
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.scale.setScalar(110000);
    this.mesh.name='cinematic-art-backdrop';this.mesh.renderOrder=-100;this.mesh.frustumCulled=false;
    this.mesh.rotation.set((seed%31)/31*.5,(seed%127)/127*Math.PI*2,((seed%17)/17-.5)*.8);
    this.material.uniforms.strength.value=low?.35:.48;
    Object.assign(this.material.uniforms,{shape:{value:1},scale:{value:5},time:{value:0},drift:{value:0}});
    this.material.fragmentShader=this.material.fragmentShader
      .replace('uniform float strength;', 'uniform float strength,shape,scale,time,drift;')
      .replace('vec3 p=normalize(vLocal);', 'vec3 p=normalize(vLocal); if(shape>1.5) p+=vec3(sin(time*drift)*.07,0.,cos(time*drift)*.04);')
      .replace('float field=fbm(p*5.0+vec3(3.2,1.0,7.0));', `
        if(shape>1.5&&shape<2.5)band=exp(-length(p.xy-vec2(.35,.2))*5.)+exp(-length(p.xy+vec2(.42,.22))*6.);
        else if(shape<3.5&&shape>2.5)band=pow(.5+.5*sin(p.y*18.+fbm(p*4.)*8.),10.);
        else if(shape<4.5&&shape>3.5)band=exp(-pow((p.y+p.x*.25)*2.5,2.));
        else if(shape<5.5&&shape>4.5)band=exp(-pow((length(p.xy)-.65)*10.,2.))*smoothstep(-.2,.6,p.y);
        else if(shape<6.5&&shape>5.5)band=exp(-pow((p.x+.14*sin(p.y*7.))*8.,2.));
        else if(shape<7.5&&shape>6.5)band=pow(.5+.5*sin(p.x*24.+p.y*7.+fbm(p*5.)*5.),6.);
        else if(shape<8.5&&shape>7.5)band=exp(-pow((length(p.xy)-.57)*8.,2.));
        else if(shape<9.5&&shape>8.5)band=smoothstep(.47,.72,fbm(p*6.))*1.8;
        else if(shape<10.5&&shape>9.5)band=pow(.5+.5*sin(atan(p.y,p.x)*2.+length(p.xy)*12.),5.);
        else if(shape>10.5)band=exp(-pow((p.y-.13*sin(p.x*7.))*7.,2.));
        float field=fbm(p*scale+vec3(3.2,1.0,7.0));`);
  }
  setEnvironment(profile:EnvironmentProfile){
    if(this.active===profile)return;this.active=profile;
    const b=profile.backdrop,u=this.material.uniforms;
    u.shape.value=b.shape;u.scale.value=b.scale;u.drift.value=b.drift;
    u.warm.value.set(b.warm);u.cool.value.set(b.cool);u.strength.value=b.shape===0?0:b.shape===1&&this.low?.35:b.density*(this.low?.75:1);
  }
  update(camera:THREE.Vector3,elapsed=0){this.mesh.position.copy(camera);this.material.uniforms.time.value=elapsed;}
  snapshot(){return this.active?.backdrop??null;}
  dispose(){this.geometry.dispose();this.material.dispose();this.mesh.removeFromParent();}
}
