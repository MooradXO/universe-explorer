import * as THREE from 'three';
import type { CinematicGeometryPool } from '../visuals/CinematicPlanet';
import type { SystemBody } from '../systems/SystemDescriptor';
import { createSeededRandom } from '../celestial/WorldSeed';
import { MOONS, SURFACES } from './EnvironmentLibrary';
import { surfaceMaterial } from './EnvironmentMaterials';
import { SOLAR_MOONS } from './SolarMoonData';

export function moonDescriptors(body: SystemBody) {
  if(body.id.startsWith('sol/'))return SOLAR_MOONS.filter(m=>m.parent===body.id).map(m=>({...m,origin:'catalogue' as const}));
  const p=body.environment,rng=createSeededRandom(p.seed+119),mode=p.moonOrbit;
  return Array.from({length:p.moonCount},(_,i)=>{
    const radius=body.radius*(.035+rng()*.095),ringOuter=p.ring?.outer??1.8;
    let distance=body.radius*(ringOuter+1.4+i*(mode===7?3.2:1.2));
    let phase=rng()*Math.PI*2,inclination=.15;
    if(mode===1)phase=i*Math.PI+.3;
    if(mode===2)phase=i*.36+.5;
    if(mode===3){phase=i*2.09;distance*=Math.pow(1.3,i);}
    if(mode===4)inclination=.7;
    if(mode===5)inclination=Math.PI/2;
    if(mode===6)distance*=i%2?1.8:1;
    if(mode===8)inclination=2.8;
    if(mode===9){inclination=i*.35;phase=i*.6;}
    if(mode===10)inclination=i%2?.9:-.3;
    if(mode===11){distance=body.radius*(ringOuter+1.1+i*.7);inclination=p.ring?.tilt[0]??.3;}
    return {parent:body.id,id:`${body.id}/moon-${i+1}`,name:`Спутник ${i+1} · игровой`,radius,
      position:[Math.cos(phase)*distance,Math.sin(phase)*Math.sin(inclination)*distance,Math.sin(phase)*Math.cos(inclination)*distance],
      style:(p.moonStyle+i*7)%24,origin:'procedural' as const};
  });
}

export class PlanetMoons {
  readonly group=new THREE.Group();
  private materials:THREE.ShaderMaterial[]=[];
  private maps:string[]=[];
  private descriptors:ReturnType<typeof moonDescriptors>;
  constructor(body:SystemBody,private pool:CinematicGeometryPool,starColor:number){
    this.descriptors=moonDescriptors(body);const direction=new THREE.Vector3(...body.position).negate().normalize();
    for(const moon of this.descriptors){
      const style=MOONS[moon.style],surface=[0,24,27,16,40,8,33,25][style.type]+style.shape;
      const recipe=SURFACES[surface],profile={...body.environment,surface,material:surface*2+style.shape%2,variant:style.shape*3,seed:body.environment.seed+moon.style*17,
        colors:recipe.colors,geography:recipe.geography*(1+style.shape*.4),warp:recipe.warp};
      const acquire=(name:string)=>{this.maps.push(name);return pool.textures.acquire(name);};
      const material=surfaceMaterial(profile,direction,starColor,acquire(recipe.texture),moon.id==='301'?acquire('moon'):null);this.materials.push(material);
      const mesh=new THREE.Mesh(pool.sphere,material);mesh.scale.setScalar(moon.radius);mesh.position.fromArray(moon.position);
      mesh.userData={name:moon.name,isMoon:true,radius:moon.radius,isFixedScale:true};this.group.add(mesh);
    }
  }
  update(elapsed:number){for(const m of this.materials)m.uniforms.time.value=elapsed;}
  snapshot(){return this.descriptors;}
  dispose(){this.materials.forEach(m=>m.dispose());this.maps.forEach(name=>this.pool.textures.release(name));this.group.clear();}
}
