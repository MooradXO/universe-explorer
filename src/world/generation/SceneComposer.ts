import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CinematicGeometryPool,CinematicPlanet } from '../visuals/CinematicPlanet';
import { CinematicBackground } from '../visuals/CinematicBackground';
import { starMaterial,glowTexture } from '../visuals/SpaceMaterials';
import { ringMaterial } from '../environments/EnvironmentMaterials';
import { objectGeometry,landmarkGeometry } from '../environments/EnvironmentGeometry';
import { OrbitalPhenomenon } from '../environments/OrbitalPhenomenon';
import { orbitalZones,layoutPoint } from '../systems/OrbitalSite';
import { createSeededRandom,hashString } from '../celestial/WorldSeed';
import { PLAYER_SHIP_VISUAL,BASE_STATION_VISUAL,BOT_INTERCEPTOR_VISUAL,BOT_BOMBER_VISUAL } from '../ShipVisualConfig';
import { ShipEngineVFX } from '../ShipEngineVFX';
import { BlackHole } from '../BlackHole';
import { ISSSatellite } from '../ISSSatellite';
import { VoyagerProbe } from '../VoyagerProbe';
import { ProjectileVisuals } from '../visuals/ProjectileVisuals';
import { impactMaterial } from '../visuals/ImpactVisuals';
import { WarpTransition } from '../visuals/WarpTransition';
import { EpicEffectSpace } from '../visuals/EpicEffectSpace';
import type { EpicFX,EpicFXLibrary } from '../../vendor/epic-fx/epic-fx';
import { FX_CATALOG,sceneBody,sceneEnvironment,createEntity,type SceneEntity,type SceneDocument } from './SceneDocument';

export const MODEL_CONFIGS=[PLAYER_SHIP_VISUAL,BASE_STATION_VISUAL,BOT_INTERCEPTOR_VISUAL,BOT_BOMBER_VISUAL];
interface Instance {object:T.Group;signature:string;entity:SceneEntity;status:string;alive:boolean;update?:(dt:number,time:number,camera:T.PerspectiveCamera)=>void;dispose:()=>void;planet?:CinematicPlanet;count?:number;}
/** Release unique resources once; model clones are owned by the model cache instead. */
export function disposeTree(root:T.Object3D,disposeTextures=true){
  const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>(),maps=new Set<T.Texture>();
  root.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material]){mats.add(mat);for(const value of Object.values(mat))if(value instanceof T.Texture)maps.add(value);}});
  for(const g of geos)g.dispose();for(const m of mats)m.dispose();if(disposeTextures)for(const t of maps)t.dispose();root.removeFromParent();root.clear();
}
/** Composes saved scenes with the same renderers and recipes as the game. No network or flight-save writes. */
export class SceneComposer {
  readonly scene=new T.Scene();readonly objects=new T.Group();readonly pool:CinematicGeometryPool;
  private instances=new Map<string,Instance>();private background:CinematicBackground;
  private ambient=new T.HemisphereLight('#9eaebb','#161923',.8);private key=new T.DirectionalLight('#fff0d5',2.5);
  private stars?:T.Points;private starSignature='';private settingsSignature='';private disposed=false;
  private models=new Map<number,Promise<T.Group>>();private libraries=new Map<string,Promise<EpicFXLibrary>>();
  private projectiles:ProjectileVisuals;private direction=new T.Vector3();private errors:string[]=[];
  private warp:WarpTransition;private showWarp=false;
  constructor(readonly low:boolean){this.pool=new CinematicGeometryPool(low);this.projectiles=new ProjectileVisuals(low);this.background=new CinematicBackground('workshop',low);this.warp=new WarpTransition(low);this.scene.background=new T.Color('#02050a');this.scene.add(this.objects,this.background.mesh,this.ambient,this.key,this.warp.group);}
  private library(path:string){let promise=this.libraries.get(path);if(!promise){promise=import('../../vendor/epic-fx/epic-fx.js').then(async({EpicFXLibrary})=>{const lib=new EpicFXLibrary(path);try{await lib.ready;}catch(e){lib.dispose();throw e;}if(this.disposed){lib.dispose();throw Error('closed');}return lib;});this.libraries.set(path,promise);}return promise;}
  async model(index:number):Promise<T.Group>{let promise=this.models.get(index);if(!promise){promise=new GLTFLoader().loadAsync(MODEL_CONFIGS[index].modelPath).then(gltf=>{if(this.disposed){disposeTree(gltf.scene);throw Error('closed');}return gltf.scene;});this.models.set(index,promise);}return (await promise).clone(true);}
  sync(document:SceneDocument){
    const s=document.settings,settings=JSON.stringify(s),changed=settings!==this.settingsSignature;this.settingsSignature=settings;
    this.showWarp=!!s.warp;
    this.background.setEnvironment(sceneEnvironment(s));this.ambient.intensity=Number(s.ambient);this.key.intensity=Number(s.light);this.key.color.set(String(s.lightColor));
    this.direction.set(Number(s.lightX),Number(s.lightY),Number(s.lightZ));if(this.direction.lengthSq()<.001)this.direction.set(-1,.5,1);this.direction.normalize();this.key.position.copy(this.direction).multiplyScalar(10000);
    const starSignature=`${s.seed}/${s.stars}`;if(starSignature!==this.starSignature){this.starSignature=starSignature;if(this.stars)disposeTree(this.stars);const random=createSeededRandom(hashString(String(s.seed))),points=[];for(let i=0;i<Number(s.stars);i++){const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);points.push(Math.cos(a)*r*90000,y*90000,Math.sin(a)*r*90000);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));this.stars=new T.Points(g,new T.PointsMaterial({color:'#c4d1e1',size:this.low?110:80,sizeAttenuation:true,depthWrite:false}));this.scene.add(this.stars);}
    // Detach entity roots before replacing a parent so child resources stay owned.
    for(const item of this.instances.values())this.objects.add(item.object);
    const wanted=new Set(document.entities.map(e=>e.id));for(const [id,item] of this.instances)if(!wanted.has(id)){item.dispose();this.instances.delete(id);}
    for(const e of document.entities){const signature=`${e.kind}:${JSON.stringify(e.params)}`;let item=this.instances.get(e.id);
      if(item&&(item.signature!==signature||changed)){item.dispose();this.instances.delete(e.id);item=undefined;}
      if(!item){item=this.make(e,document);this.instances.set(e.id,item);this.objects.add(item.object);}
      item.entity=e;item.object.name=e.id;item.object.userData.editorId=e.id;item.object.visible=e.visible;item.object.position.fromArray(e.position);item.object.rotation.set(...e.rotation.map(x=>x*Math.PI/180) as [number,number,number]);item.object.scale.setScalar(e.scale);
    }
    for(const e of document.entities)if(e.parent)this.instances.get(e.parent)!.object.add(this.instances.get(e.id)!.object);
  }
  private make(e:SceneEntity,document:SceneDocument):Instance {
    const p=e.params,n=(k:string)=>Number(p[k]),str=(k:string)=>String(p[k]),object=new T.Group();let clean=()=>disposeTree(object);
    const item:Instance={object,entity:e,signature:`${e.kind}:${JSON.stringify(p)}`,status:'ready',alive:true,dispose:()=>{item.alive=false;clean();item.object.removeFromParent();}};
    const mat=()=>new T.MeshStandardMaterial({color:str('color'),roughness:n('roughness'),metalness:n('metalness')});
    if(e.kind==='planet'||e.kind==='moon'){
      const body=sceneBody(e,document.settings);const planet=new CinematicPlanet(body,this.pool,new T.Color(String(document.settings.lightColor)).getHex());
      item.object=planet.group;item.planet=planet;clean=()=>planet.dispose();item.update=(_dt,t,c)=>planet.update(t,c);
    } else if(e.kind==='star'){
      const material=starMaterial();material.uniforms.tint.value.set(str('color'));const sphere=new T.Mesh(this.pool.sphere,material);sphere.scale.setScalar(n('radius'));object.add(sphere);
      const texture=glowTexture(),glowMat=new T.SpriteMaterial({map:texture,color:str('color'),opacity:n('glow'),blending:T.AdditiveBlending,depthWrite:false}),sprite=new T.Sprite(glowMat);sprite.scale.setScalar(n('radius')*7);object.add(sprite);item.update=(_dt,t)=>{material.uniforms.time.value=t;};clean=()=>{material.dispose();texture.dispose();glowMat.dispose();object.clear();};
    } else if(e.kind==='ring'){
      const profile=sceneEnvironment(document.settings);profile.ring={recipe:n('ring'),inner:n('inner'),outer:n('outer'),tilt:[0,0,0],density:n('density'),tint:str('color')};
      const ring=new T.Mesh(new T.RingGeometry(n('inner'),n('outer'),this.low?96:192,4),ringMaterial(profile,this.direction));ring.scale.setScalar(n('radius'));object.add(ring);
    } else if(e.kind==='asteroid'||e.kind==='field'){
      const textureName=['regolith','ice','regolith','mineral','mineral','regolith','mineral','regolith'][Math.floor(n('objects')/4)],texture=this.pool.textures.acquire(textureName),material=mat();material.map=texture;material.bumpMap=texture;material.bumpScale=.035;material.flatShading=Math.floor(n('objects')/4)!==1;clean=()=>{disposeTree(object,false);this.pool.textures.release(textureName);};if(e.kind==='asteroid'){const mesh=new T.Mesh(objectGeometry(n('objects'),n('variant'),this.low),material);mesh.scale.setScalar(n('radius'));object.add(mesh);}
      else {const random=createSeededRandom(hashString(str('seed'))),count=n('count');item.count=count;const transform=new T.Object3D();for(let v=0;v<6;v++){const size=Math.floor((count+5-v)/6);if(!size)continue;const mesh=new T.InstancedMesh(objectGeometry(n('objects'),(v+n('variant'))%6,this.low),material,size);for(let i=0;i<size;i++){const index=i*6+v;transform.position.fromArray(layoutPoint(n('layout'),index/count,random)).multiplyScalar(n('spread'));transform.rotation.set(random()*6.28,random()*6.28,random()*6.28);transform.scale.setScalar(n('size')*(1+(random()*2-1)*n('variation')));transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}mesh.instanceMatrix.needsUpdate=true;object.add(mesh);}}
    } else if(e.kind==='structure'){
      const parts=landmarkGeometry(n('recipe'),n('variant')),material=mat(),dummy=new T.Object3D();
      for(const kind of ['box','sphere','ring'] as const){const list=parts.filter(p=>p.kind===kind);if(!list.length)continue;const geometry=kind==='box'?new T.BoxGeometry(1,1,1):kind==='sphere'?new T.SphereGeometry(1,this.low?12:20,this.low?8:12):new T.TorusGeometry(1,.065,5,this.low?20:40),mesh=new T.InstancedMesh(geometry,material,list.length);
        list.forEach((part,i)=>{dummy.position.fromArray(part.p);dummy.scale.fromArray(part.s);dummy.rotation.set(part.r[0],part.r[1],part.r[2]);if(p.wreck){dummy.position.multiplyScalar(1.04);dummy.rotation.z+=(i%3-1)*.16;}dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});object.add(mesh);}
    } else if(e.kind==='phenomenon'){
      const body=sceneBody(createEntity('planet','template'),document.settings);body.environment.seed=hashString(str('seed'));body.environment.backdrop.warm=str('warm');body.environment.backdrop.cool=str('cool');const zone=orbitalZones(body)[0];zone.phenomenon=n('recipe');const phenomenon=new OrbitalPhenomenon(zone,this.low);object.add(phenomenon.group);item.count=phenomenon.count;clean=()=>phenomenon.dispose();item.update=(_dt,t)=>phenomenon.update(t*n('speed'));
    } else if(e.kind==='model'){
      const ownedMaterials:T.Material[]=[];item.status='loading';void this.model(n('model')).then(model=>{if(!item.alive)return;const config=MODEL_CONFIGS[n('model')];model.scale.setScalar(config.scale);model.rotation.set(...config.rotation);model.traverse(child=>{const mesh=child as T.Mesh;if(!mesh.isMesh)return;const clone=(source:T.Material)=>{const material=source.clone();ownedMaterials.push(material);if(material instanceof T.MeshStandardMaterial){material.color.multiply(new T.Color(str('tint')));material.roughness=Math.min(1,material.roughness*n('roughness'));}return material;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);});object.add(model);item.status='ready';}).catch(()=>{if(item.alive){item.status='error';this.errors.push(`Could not load model: ${e.name}`);}});
      let engine:ShipEngineVFX|undefined;if(p.engine){const config=MODEL_CONFIGS[n('model')];if(config.nozzles.length){engine=new ShipEngineVFX(object,config.nozzles,new T.Color(str('engineColor')).getHex(),config.nozzleSizes,this.low);item.update=(dt,t)=>engine!.update(dt,t,n('throttle')*1600,!!p.boost,new T.Color(str('engineColor')).getHex());}}
      clean=()=>{engine?.dispose();for(const m of ownedMaterials)m.dispose();object.clear();};
    } else if(e.kind==='engine'){
      const engine=new ShipEngineVFX(object,[[0,0,0]],new T.Color(str('color')).getHex(),[n('size')],this.low);item.update=(dt,t)=>engine.update(dt,t,n('throttle')*1600,!!p.boost,new T.Color(str('color')).getHex());clean=()=>engine.dispose();
    } else if(e.kind==='blackhole'){
      const hole=new BlackHole({scene:new T.Scene()},createSeededRandom(hashString(str('seed'))));object.add(hole.group);const material=hole.accretionDisk.material as T.MeshStandardMaterial;material.emissive.set(str('color'));material.emissiveIntensity=n('intensity');const localCamera=new T.Vector3();item.update=(dt,t,c)=>{object.updateWorldMatrix(true,false);localCamera.copy(c.position);object.worldToLocal(localCamera);hole.update(t*n('speed'),dt*n('speed'),localCamera);};
    } else if(e.kind==='probe'){
      const probe=n('model')===0?new ISSSatellite(new T.Scene(),0,true):new VoyagerProbe(new T.Scene(),true);probe.mesh.position.set(0,0,0);object.add(probe.mesh);
    } else if(e.kind==='projectile'){
      const count=n('weapon')===1?3:1;for(let i=0;i<count;i++){const shot=n('weapon')<2?this.projectiles.createVolumetricLaser(new T.Color(str('color')).getHex(),n('length')/1.6,true):this.projectiles.createMissileOrTorpedo(n('weapon')===3,new T.Color(str('color')).getHex());this.projectiles.previewTail(shot,n('length'));shot.rotation.x=-Math.PI/2;shot.position.x=(i-(count-1)/2)*40;object.add(shot);}
      item.update=(_dt,t)=>{object.children.forEach(shot=>{shot.position.z=n('speed')?-(t*n('speed')%n('range')):0;});};clean=()=>object.clear();
    } else if(e.kind==='impact'){
      const kind=n('effect')===0?'explosion':n('effect')===1?'shield':'sparks',texture=kind==='sparks'?glowTexture():undefined,material=impactMaterial(kind,new T.Color(str('color')).getHex(),texture);
      if(kind==='sparks'){const random=createSeededRandom(hashString(str('seed'))),count=this.low?15:35,velocities=Array.from({length:count},()=>new T.Vector3(random()-.5,random()-.5,random()-.5).normalize().multiplyScalar(100+random()*250)),positions=new Float32Array(count*3),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));object.add(new T.Points(geometry,material));item.count=count;item.update=(_dt,t)=>{const u=Math.min(1,(t%n('period'))/.45),ease=1-(1-u)**2;velocities.forEach((v,i)=>{positions[i*3]=v.x*ease*n('radius')/100;positions[i*3+1]=v.y*ease*n('radius')/100;positions[i*3+2]=v.z*ease*n('radius')/100;});geometry.attributes.position.needsUpdate=true;material.opacity=1-u**3;};}
      else{const mesh=new T.Mesh(new T.SphereGeometry(1,kind==='shield'?32:16,kind==='shield'?32:16),material);object.add(mesh);item.update=(_dt,t)=>{const u=Math.min(1,(t%n('period'))/(kind==='shield'?.3:.5)),ease=1-(1-u)**3;mesh.scale.setScalar(n('radius')*(1+ease*(kind==='shield'?.2:2)));material.opacity=(kind==='shield'?.7:1)*(1-ease);};}
    } else if(e.kind==='light'){object.add(new T.PointLight(str('color'),n('intensity'),n('distance'),0));
    } else if(e.kind==='fx'){
      const preset=FX_CATALOG[n('preset')],space=new EpicEffectSpace(n('size'));object.add(space.anchor);let effect:EpicFX|undefined,warmRemaining=n('warmup');item.status='loading';
      void this.library(preset.path).then(async lib=>{if(!item.alive)return;const fx=await lib.create(preset.id,{sound:false,groundY:null,prewarm:false,seed:hashString(str('seed')),color:str('color'),size:1,intensity:n('intensity'),density:n('density'),maxParticles:this.low?260:700,maxParticlesPerEmitter:this.low?110:280});if(!item.alive){fx.dispose();return;}effect=fx;space.anchor.add(fx.group);item.status=warmRemaining>0?'warming':'ready';}).catch(()=>{if(item.alive){item.status='error';this.errors.push(`Could not load effect: ${e.name}`);}});
      item.update=(dt,_t,c)=>{if(effect){if(warmRemaining>0){const step=Math.min(.1,warmRemaining);space.update(effect,step,c);warmRemaining=Math.max(0,warmRemaining-step);if(warmRemaining===0)item.status='ready';}if(effect.finished&&p.loop)effect.restart({sound:false});space.update(effect,dt*n('speed'),c);item.count=effect.particleCount;}};clean=()=>{effect?.dispose();object.clear();};
    }
    return item;
  }
  update(dt:number,time:number,camera:T.PerspectiveCamera){this.pool.surfaces.pump();this.background.update(camera.position,time);this.stars?.position.copy(camera.position);for(const item of this.instances.values())if(item.object.visible)item.update?.(dt,time,camera);const transit=this.showWarp&&time%8<5;if(this.showWarp&&!transit&&this.warp.timeline.requested)this.warp.arrive();this.warp.update(dt,camera,camera.position,camera.quaternion,transit);}
  object(id:string){return this.instances.get(id)?.object;}
  bounds(id?:string){this.objects.updateWorldMatrix(true,true);const box=new T.Box3();for(const [key,i] of this.instances){if(!i.object.visible||(id&&key!==id))continue;if(i.entity.kind==='light'||i.entity.kind==='fx'){const p=i.object.position;box.expandByPoint(p.clone().addScalar(-300));box.expandByPoint(p.clone().addScalar(300));}else box.expandByObject(i.object);}if(box.isEmpty())box.setFromCenterAndSize(new T.Vector3(),new T.Vector3(2000,2000,2000));return box;}
  snapshot(){return {entities:[...this.instances].map(([id,i])=>({id,kind:i.entity.kind,status:i.status,visible:i.object.visible,count:i.count,position:i.object.position.toArray(),surface:i.planet?.snapshot().surface,satellites:i.planet?.snapshot().satellites})),generation:this.pool.surfaces.snapshot(),errors:[...this.errors]};}
  dispose(){this.disposed=true;for(const i of this.instances.values())i.object.removeFromParent();for(const i of this.instances.values())i.dispose();this.instances.clear();this.background.dispose();this.warp.dispose();if(this.stars)disposeTree(this.stars);this.pool.dispose();this.projectiles.disposeVisuals();for(const m of this.models.values())void m.then(root=>disposeTree(root)).catch(()=>{});for(const l of this.libraries.values())void l.then(lib=>lib.dispose()).catch(()=>{});this.scene.clear();}
}
