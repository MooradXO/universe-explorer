import * as THREE from 'three';
import { orbitalSite, type OrbitalZone } from '../systems/OrbitalSite';
import type { SystemBody } from '../systems/SystemDescriptor';
import type { FloatingOrigin } from '../space/FloatingOrigin';
import { worldPosition } from '../space/WorldPosition';
import { OBJECTS, STRUCTURES } from '../environments/EnvironmentLibrary';
import { objectGeometry, landmarkGeometry } from '../environments/EnvironmentGeometry';
import { OrbitalPhenomenon } from '../environments/OrbitalPhenomenon';
import { EnvironmentTextures } from '../environments/EnvironmentMaterials';

/** Six batched natural shapes per zone, one construction graph and one bounded phenomenon. */
export class OrbitalDebris {
  readonly group=new THREE.Group();
  private geometries:THREE.BufferGeometry[]=[];
  private materials:THREE.Material[]=[];
  private proxies:THREE.Mesh[]=[];
  private phenomenon:OrbitalPhenomenon|null=null;
  private textures:EnvironmentTextures;
  readonly site:OrbitalZone;
  constructor(body:SystemBody,low:boolean,private targets:THREE.Mesh[],zone=orbitalSite(body),streamed=false){
    this.site=zone;this.group.name='orbital-game-environment';
    this.textures=new EnvironmentTextures(low);
    const recipe=OBJECTS[zone.objects],texture=this.textures.acquire(['regolith','ice','mineral','ice','mineral','regolith','mineral','regolith'][recipe.shape]);
    const material=new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.035,roughness:recipe.roughness,metalness:recipe.metalness,color:recipe.material,flatShading:recipe.shape!==1});
    this.materials.push(material);
    const proxyGeometry=new THREE.SphereGeometry(1,6,4),proxyMaterial=new THREE.MeshBasicMaterial({visible:false});this.geometries.push(proxyGeometry);this.materials.push(proxyMaterial);
    const object=new THREE.Object3D(),color=new THREE.Color();
    for(let variant=0;variant<6;variant++){
      const geometry=objectGeometry(zone.objects,variant,low);this.geometries.push(geometry);
      const rocks=zone.rocks.filter(r=>r.variant===variant);if(!rocks.length)continue;
      const field=new THREE.InstancedMesh(geometry,material,rocks.length);
      rocks.forEach((rock,i)=>{
        object.position.set(...rock.offset);object.rotation.set(...rock.rotation);object.scale.setScalar(rock.radius);object.updateMatrix();field.setMatrixAt(i,object.matrix);
        color.setScalar(.55+rock.shade*.85);field.setColorAt(i,color);
        const proxy=new THREE.Mesh(proxyGeometry,proxyMaterial);proxy.position.copy(object.position);proxy.scale.setScalar(rock.radius);
        proxy.userData={radius:rock.radius,name:`${recipe.name} · игровой`,type:'Орбитальная зона',isAsteroid:true,isFixedScale:true};
        this.group.add(proxy);this.proxies.push(proxy);targets.push(proxy);
      });field.instanceMatrix.needsUpdate=true;this.group.add(field);
    }
    if(zone.structure!==null){
      const parts=landmarkGeometry(zone.structure,zone.profile.variant),metal=new THREE.MeshStandardMaterial({color:'#77818a',roughness:.62,metalness:.6});
      this.materials.push(metal);
      const shapeGeometries={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,low?12:20,low?8:12),ring:new THREE.TorusGeometry(1,.065,5,low?20:40)};
      for(const kind of ['box','sphere','ring'] as const){
        const geometry=shapeGeometries[kind];this.geometries.push(geometry);const list=parts.filter(p=>p.kind===kind);if(!list.length)continue;
        const mesh=new THREE.InstancedMesh(geometry,metal,list.length);
        list.forEach((part,i)=>{object.position.fromArray(part.p);object.scale.fromArray(part.s);object.rotation.set(part.r[0],part.r[1],part.r[2]);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);});this.group.add(mesh);
      }
      const beacon=new THREE.MeshBasicMaterial({color:zone.profile.backdrop.cool});this.materials.push(beacon);
      const lights=new THREE.InstancedMesh(shapeGeometries.box,beacon,6);
      for(let i=0;i<6;i++){object.position.set((i-2.5)*24,35,38);object.rotation.set(0,0,0);object.scale.set(12,3,3);object.updateMatrix();lights.setMatrixAt(i,object.matrix);}this.group.add(lights);
      const proxy=new THREE.Mesh(proxyGeometry,proxyMaterial);proxy.scale.setScalar(420);proxy.userData={radius:420,name:`${STRUCTURES[zone.structure].name} · игровое`,isAsteroid:true,isFixedScale:true};this.group.add(proxy);this.proxies.push(proxy);targets.push(proxy);
    }
    if(zone.showPhenomenon){this.phenomenon=new OrbitalPhenomenon(zone,low);this.phenomenon.group.position.set(...zone.anomaly.map((v,i)=>v-zone.center[i]) as [number,number,number]);this.group.add(this.phenomenon.group);}
    if(streamed)for(const material of this.materials)material.transparent=true;
  }
  update(origin:FloatingOrigin,elapsed=0){this.group.position.set(...origin.toLocal(worldPosition(undefined,this.site.center)));this.phenomenon?.update(elapsed);}
  setOpacity(value:number){for(const material of this.materials){material.opacity=value;material.depthWrite=value>.98;}this.phenomenon?.setOpacity(value);}
  snapshot(){return {body:this.site.id,origin:this.site.origin,instances:this.site.rocks.length,layout:this.site.layout,objects:this.site.objects,structure:this.site.structure,phenomenon:this.phenomenon?.snapshot()??null};}
  dispose(){for(const proxy of this.proxies){const index=this.targets.indexOf(proxy);if(index>=0)this.targets.splice(index,1);}
    this.group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});
    this.phenomenon?.dispose();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.dispose();this.group.removeFromParent();this.group.clear();}
}
