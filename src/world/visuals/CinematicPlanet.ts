import * as THREE from 'three';
import type { SystemBody } from '../systems/SystemDescriptor';
import { SURFACES, ATMOSPHERES, CLOUDS } from '../environments/EnvironmentLibrary';
import { EnvironmentTextures, surfaceMaterial, cloudMaterial, atmosphereMaterial, auroraMaterial, ringMaterial } from '../environments/EnvironmentMaterials';
import { PlanetMoons } from '../environments/PlanetMoons';
import { planetDetail } from '../environments/PlanetDetail';
import { SurfaceJobs } from '../generation/SurfaceJobs';
import { surfaceRecipe } from '../generation/SurfaceRecipe';

export class CinematicGeometryPool {
  readonly sphere: THREE.SphereGeometry;
  readonly textures: EnvironmentTextures;
  readonly surfaces: SurfaceJobs;
  constructor(readonly low: boolean) { this.sphere = new THREE.SphereGeometry(1,low?40:72,low?28:48); this.textures = new EnvironmentTextures(low); this.surfaces=new SurfaceJobs(low); }
  dispose() { this.sphere.dispose(); this.textures.dispose(); this.surfaces.dispose(); }
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
  private surfaceKey:string;private lastElapsed=0;private localDetail=0;private blend=0;
  private worldCenter=new THREE.Vector3();private worldScale=new THREE.Vector3();
  constructor(readonly body: SystemBody, private pool: CinematicGeometryPool, starColor: number, layers?: { geology?: number; circulation?: number }) {
    const profile = body.appearance, recipe = SURFACES[profile.surface];
    this.surfaceKey=pool.surfaces.acquire(surfaceRecipe(body));
    this.group.name = body.id;
    const acquire = (name: string) => { this.textureNames.push(name); return pool.textures.acquire(name); };
    const direction = new THREE.Vector3(...body.position).negate().normalize();
    const solarName = profile.editor?.solarTexture ?? (body.id.startsWith('sol/') ? body.id.slice(4) : '');
    const material = surfaceMaterial(profile,direction,starColor,acquire(recipe.texture),solarName ? acquire(solarName) : null,
      { low: pool.low, solarName, layers, cloudTexture: profile.clouds === null ? undefined : acquire('clouds') });
    this.materials.push(material);
    this.sphere = new THREE.Mesh(pool.sphere,material); this.sphere.scale.setScalar(body.radius);
    this.sphere.userData = { name:body.name,type:body.origin==='procedural'?'Игровой процедурный мир':'Планета Солнечной системы',
      isStar:true,isPlanet:true,isFixedScale:true,planetId:body.id,radius:body.radius };
    this.group.add(this.sphere);
    if(profile.atmosphere!==null){
      const atmosphere=atmosphereMaterial(profile,direction,planetDetail(profile,solarName).atmosphereTint);this.materials.push(atmosphere);
      const shell=new THREE.Mesh(pool.sphere,atmosphere);shell.scale.setScalar(body.radius*(1+(profile.editor?.atmosphereThickness??ATMOSPHERES[profile.atmosphere].thickness)));this.group.add(shell);
    }
    if(profile.clouds!==null){
      const recipe=CLOUDS[profile.clouds],texture=acquire('clouds');
      const layers=pool.low||recipe.stack===0?1:2;
      for(let i=0;i<layers;i++){
        const cloud=cloudMaterial(profile,direction,i,texture);this.materials.push(cloud);
        const shell=new THREE.Mesh(pool.sphere,cloud);shell.scale.setScalar(body.radius*(1+(profile.editor?.cloudAltitude??recipe.altitude)+i*.006));shell.rotation.y=i*1.8;
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
  update(elapsed:number,camera?:THREE.Camera){
    const dt=Math.min(.1,Math.max(0,elapsed-this.lastElapsed));this.lastElapsed=elapsed;
    this.group.getWorldPosition(this.worldCenter);this.group.getWorldScale(this.worldScale);
    const distance=camera?camera.position.distanceTo(this.worldCenter)/(this.body.radius*this.worldScale.x):4;
    const target=1-THREE.MathUtils.smoothstep(distance,2,12);
    this.localDetail+=(target-this.localDetail)*(1-Math.exp(-dt*5));
    const texture=this.pool.surfaces.texture(this.surfaceKey);this.blend+=(Number(!!texture)-this.blend)*(1-Math.exp(-dt*3));
    const surface=this.materials[0];if(texture)surface.uniforms.bakedMap.value=texture;
    surface.uniforms.bakedBlend.value=this.blend;surface.uniforms.detailLod.value=this.localDetail;
    for(const material of this.materials){
      if(material.uniforms.time)material.uniforms.time.value=elapsed;
      if(material.uniforms.useSolar)material.uniforms.useSolar.value=material.uniforms.solarMap.value?.userData.ready?1:0;
    }
    this.sphere.rotation.y=elapsed*(this.body.appearance.editor?.spin??.005);
    this.clouds.forEach((mesh,i)=>{mesh.rotation.y=elapsed*(i?-1:1)*(this.body.appearance.editor?.cloudSpeed??CLOUDS[this.body.appearance.clouds!].speed)+i*1.8;});
    this.moons.update(elapsed);
  }
  snapshot(){const surface=this.materials[0];return {profile:this.body.environment,satellites:this.moons.snapshot(),
    surface:{version:2,texture:surface.uniforms.solarMap.value?surface.uniforms.useSolar.value?'ready':surface.uniforms.solarMap.value.userData.failed?'fallback-error':'fallback-loading':'procedural',
      geology:surface.uniforms.geology.value,circulation:surface.uniforms.circulation.value,storms:surface.defines.STORM_COUNT,
      baked:!!this.pool.surfaces.texture(this.surfaceKey),blend:this.blend,lod:this.localDetail}};}
  dispose(){this.materials.forEach(m=>m.dispose());this.geometries.forEach(g=>g.dispose());this.moons.dispose();
    this.pool.surfaces.release(this.surfaceKey);this.textureNames.forEach(name=>this.pool.textures.release(name));this.group.removeFromParent();this.group.clear();}
}
