import * as THREE from 'three';
import type { CinematicGeometryPool } from '../visuals/CinematicPlanet';
import type { SystemBody } from '../systems/SystemDescriptor';
import { moonDescriptors } from '../generation/MoonModel';
export { moonDescriptors } from '../generation/MoonModel';
import { MOONS, SURFACES } from './EnvironmentLibrary';
import { surfaceMaterial } from './EnvironmentMaterials';

export class PlanetMoons {
  readonly group=new THREE.Group();
  private materials:THREE.ShaderMaterial[]=[];
  private maps:string[]=[];
  private descriptors:ReturnType<typeof moonDescriptors>;
  constructor(body:SystemBody,private pool:CinematicGeometryPool,starColor:number){
    this.descriptors=moonDescriptors(body);const direction=new THREE.Vector3(...body.position).negate().normalize();
    for(const moon of this.descriptors){
      const style=MOONS[moon.style],surface=moon.origin==='procedural'&&body.model.climate==='frozen'?24+moon.style%8:[0,24,27,16,40,8,33,25][style.type]+style.shape;
      const recipe=SURFACES[surface],profile={...body.environment,surface,material:surface*2+style.shape%2,variant:style.shape*3,seed:body.environment.seed+moon.style*17,
        colors:recipe.colors,geography:recipe.geography*(1+style.shape*.4),warp:recipe.warp,clouds:null,atmosphere:null,ring:null,editor:undefined};
      const acquire=(name:string)=>{this.maps.push(name);return pool.textures.acquire(name);};
      const material=surfaceMaterial(profile,direction,starColor,acquire(recipe.texture),moon.id==='301'?acquire('moon'):null,{low:pool.low,solarName:moon.id==='301'?'moon':''});this.materials.push(material);
      const mesh=new THREE.Mesh(pool.sphere,material);mesh.scale.setScalar(moon.radius);mesh.position.fromArray(moon.position);
      mesh.userData={name:moon.name,isMoon:true,radius:moon.radius,isFixedScale:true};this.group.add(mesh);
    }
  }
  update(elapsed:number){for(const m of this.materials){m.uniforms.time.value=elapsed;m.uniforms.useSolar.value=m.uniforms.solarMap.value?.userData.ready?1:0;}}
  snapshot(){return this.descriptors;}
  dispose(){this.materials.forEach(m=>m.dispose());this.maps.forEach(name=>this.pool.textures.release(name));this.group.clear();}
}
