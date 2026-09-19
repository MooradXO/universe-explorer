import * as THREE from 'three';
import type { SystemBody } from '../systems/SystemDescriptor';
import { SURFACES, ATMOSPHERES, CLOUDS } from '../environments/EnvironmentLibrary';
import { EnvironmentTextures, surfaceMaterial, cloudMaterial, atmosphereMaterial, auroraMaterial, ringMaterial } from '../environments/EnvironmentMaterials';
import { PlanetMoons } from '../environments/PlanetMoons';

export class CinematicGeometryPool {
  readonly sphere: THREE.SphereGeometry;
  readonly textures: EnvironmentTextures;
  constructor(readonly low: boolean) { this.sphere = new THREE.SphereGeometry(1,low?40:72,low?28:48); this.textures = new EnvironmentTextures(low); }
  dispose() { this.sphere.dispose(); this.textures.dispose(); }
}

/** The game and environment review use exactly the same planet renderer. */
export class CinematicPlanet {
  readonly group = new THREE.Group();
  readonly sphere: THREE.Mesh;
  private materials: THREE.ShaderMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private textureNames: string[] = [];
  private clouds: THREE.Mesh[] = [];
  private moons: PlanetMoons;
  constructor(readonly body: SystemBody, private pool: CinematicGeometryPool, starColor: number) {
    const profile = body.environment, recipe = SURFACES[profile.surface];
    this.group.name = body.id;
    const acquire = (name: string) => { this.textureNames.push(name); return pool.textures.acquire(name); };
    const direction = new THREE.Vector3(...body.position).negate().normalize();
    const material = surfaceMaterial(profile,direction,starColor,acquire(recipe.texture),body.id.startsWith('sol/') ? acquire(body.id.slice(4)) : null);
    this.materials.push(material);
    this.sphere = new THREE.Mesh(pool.sphere,material); this.sphere.scale.setScalar(body.radius);
    this.sphere.userData = { name:body.name,type:body.origin==='procedural'?'Игровой процедурный мир':'Планета Солнечной системы',
      isStar:true,isPlanet:true,isFixedScale:true,planetId:body.id,radius:body.radius };
    this.group.add(this.sphere);
    if(profile.atmosphere!==null){
      const atmosphere=atmosphereMaterial(profile,direction);this.materials.push(atmosphere);
      const shell=new THREE.Mesh(pool.sphere,atmosphere);shell.scale.setScalar(body.radius*(1+ATMOSPHERES[profile.atmosphere].thickness));this.group.add(shell);
    }
    if(profile.clouds!==null){
      const recipe=CLOUDS[profile.clouds],texture=acquire('clouds');
      const layers=pool.low||recipe.stack===0?1:2;
      for(let i=0;i<layers;i++){
        const cloud=cloudMaterial(profile,direction,i,texture);this.materials.push(cloud);
        const shell=new THREE.Mesh(pool.sphere,cloud);shell.scale.setScalar(body.radius*(1+recipe.altitude+i*.006));shell.rotation.y=i*1.8;
        this.clouds.push(shell);this.group.add(shell);
      }
    }
    if(profile.aurora!==null){const material=auroraMaterial(profile,direction);this.materials.push(material);
      const shell=new THREE.Mesh(pool.sphere,material);shell.scale.setScalar(body.radius*1.025);this.group.add(shell);}
    if(profile.ring){
      const ring=profile.ring,geometry=new THREE.RingGeometry(ring.inner,ring.outer,pool.low?96:192,4);
      this.geometries.push(geometry);const material=ringMaterial(profile,direction);this.materials.push(material);
      const mesh=new THREE.Mesh(geometry,material);mesh.scale.setScalar(body.radius);mesh.rotation.set(...ring.tilt);this.group.add(mesh);
    }
    this.moons=new PlanetMoons(body,pool,starColor);this.group.add(this.moons.group);
  }
  update(elapsed:number){
    for(const material of this.materials)if(material.uniforms.time)material.uniforms.time.value=elapsed;
    this.sphere.rotation.y=elapsed*.005;
    this.clouds.forEach((mesh,i)=>{mesh.rotation.y=elapsed*(i?-1:1)*(CLOUDS[this.body.environment.clouds!].speed)+i*1.8;});
    this.moons.update(elapsed);
  }
  snapshot(){return {profile:this.body.environment,satellites:this.moons.snapshot()};}
  dispose(){this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());this.moons.dispose();
    this.textureNames.forEach(name=>this.pool.textures.release(name));this.group.removeFromParent();this.group.clear();}
}
