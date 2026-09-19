import * as THREE from 'three';
import {Emitter} from './simulation.js';

/** Native Three.js runtime for the user's converted Epic Toon FX collection. */
export class EpicFXLibrary {
  constructor(baseURL){
    this.baseURL=new URL(baseURL,globalThis.location?.href||import.meta.url);if(!this.baseURL.href.endsWith('/'))this.baseURL=new URL(this.baseURL.href+'/');
    this.textures=new Map();this.geometries=new Map();this.definitionCache=new Map();this.textureLoads=new Map();this.textureReferences=new Map();this.effects=new Set();this.audioContext=null;this.audioBuffers=new Map();
    this.white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);this.white.needsUpdate=true;
    this.plane=new THREE.PlaneGeometry(1,1);
    this.ready=Promise.all([this.json('resources.json'),this.json('catalog.json')]).then(([resources,catalog])=>{this.resources=resources;this.catalog=catalog;return this;});
  }
  async json(path){const r=await fetch(new URL(path,this.baseURL));if(!r.ok)throw Error(`${r.status}: ${path}`);return r.json();}
  async loadTexture(id){
    if(!id||!this.resources.textures[id])return this.white;
    if(!this.textureLoads.has(id))this.textureLoads.set(id,new THREE.TextureLoader().loadAsync(new URL(this.resources.textures[id].path,this.baseURL).href).then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=this.resources.textures[id].repeat?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.anisotropy=4;this.textures.set(id,t);return t;}));
    return this.textureLoads.get(id);
  }
  async loadGeometry(ref){
    if(!ref?.guid)return this.plane;
    const key=ref.guid+'_'+ref.fileID;if(this.geometries.has(key))return this.geometries.get(key);
    let g;
    if(ref.guid==='0000000000000000e000000000000000'){
      g=ref.fileID==='10207'?new THREE.SphereGeometry(.5,24,16):new THREE.PlaneGeometry(1,1);
    }else{
      const resource=this.resources.meshes[key];if(!resource)throw Error(`Missing mesh ${key}`);
      const d=await this.json(resource.path);g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(d.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(d.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(d.uv.length?d.uv:new Array(d.position.length/3*2).fill(0),2));g.setIndex(d.index);if(!d.normal.length)g.computeVertexNormals();g.computeBoundingSphere();g.name=d.name;
    }
    this.geometries.set(key,g);return g;
  }
  geometry(ref){return ref?.guid?this.geometries.get(ref.guid+'_'+ref.fileID)||this.plane:this.plane;}
  async definition(id){await this.ready;const entry=this.catalog.effects.find(e=>e.id===id||e.name===id);if(!entry)throw Error(`Unknown effect: ${id}`);if(!this.definitionCache.has(entry.id))this.definitionCache.set(entry.id,this.json(entry.file));return this.definitionCache.get(entry.id);}
  async create(id,options={}){
    const definition=await this.definition(id),textureIds=new Set(),meshRefs=new Map();
    for(const e of definition.emitters){for(const matId of e.renderer.materials){const material=this.resources.materials[matId],tex=material?.map;if(tex&&this.resources.textures[tex])textureIds.add(tex);for(const slot of Object.values(material?.textureSlots||{}))if(slot.map&&this.resources.textures[slot.map])textureIds.add(slot.map);}const ref=e.renderer.m_Mesh;if(e.renderer.m_RenderMode===4&&ref?.guid)meshRefs.set(ref.guid+'_'+ref.fileID,ref);}
    for(const key of textureIds)this.textureReferences.set(key,(this.textureReferences.get(key)||0)+1);
    try{await Promise.all([...textureIds].map(id=>this.loadTexture(id)).concat([...meshRefs.values()].map(ref=>this.loadGeometry(ref))));}
    catch(error){this.releaseTextures(textureIds);throw error;}
    const effect=new EpicFX(this,definition,options);effect.textureIds=textureIds;this.effects.add(effect);return effect;
  }
  releaseTextures(ids){for(const id of ids){const refs=(this.textureReferences.get(id)||1)-1;if(refs<=0){this.textures.get(id)?.dispose();this.textures.delete(id);this.textureLoads.delete(id);this.textureReferences.delete(id);}else this.textureReferences.set(id,refs);}}
  async enableAudio(){this.audioContext??=new AudioContext();await this.audioContext.resume();}
  async sound(id){if(!id||!this.resources.audio[id]||!this.audioContext)return null;if(!this.audioBuffers.has(id))this.audioBuffers.set(id,fetch(new URL(this.resources.audio[id].path,this.baseURL)).then(r=>{if(!r.ok)throw Error(`Audio ${r.status}`);return r.arrayBuffer();}).then(b=>this.audioContext.decodeAudioData(b)));return this.audioBuffers.get(id);}
  dispose(){for(const e of [...this.effects])e.dispose();for(const g of this.geometries.values())g.dispose();this.geometries.clear();this.plane.dispose();this.white.dispose();this.audioContext?.close();}
}

export class EpicFX {
  constructor(library,definition,options){
    this.library=library;this.definition=definition;this.options={size:1,speed:1,color:'#ffffff',intensity:1,density:1,seed:1337,sound:false,gain:.5,groundY:0,maxParticles:12000,maxParticlesPerEmitter:1200,prewarm:true,...options};
    this.group=new THREE.Group();this.group.name=definition.name;if(options.position)this.group.position.fromArray(options.position);this.group.scale.setScalar(this.options.size);
    this.nodes=definition.nodes.map(n=>{const o=new THREE.Object3D();o.name=n.name;o.position.set(n.p[0],n.p[1],-n.p[2]);o.quaternion.set(-n.q[0],-n.q[1],n.q[2],n.q[3]);o.scale.fromArray(n.s);o.visible=n.active;return o;});
    definition.nodes.forEach((n,i)=>(n.parent>=0?this.nodes[n.parent]:this.group).add(this.nodes[i]));this.group.updateMatrixWorld(true);
    this.inverseWorld=new THREE.Matrix4();this.worldScale=new THREE.Vector3();this.inverseQuaternion=new THREE.Quaternion();this.elapsed=0;this.accumulator=0;this.events=[];this.disposed=false;this.playing=true;this.paused=false;this.audioSources=[];this.playToken=0;
    this.emitters=definition.emitters.map((d,i)=>new Emitter(this,d,i));this.byId=new Map(this.emitters.map(e=>[e.definition.id,e]));
    for(const e of this.emitters)for(const s of e.modules.SubModule?.subEmitters||[]){const child=this.byId.get(s.emitter.fileID);if(child)child.isSub=true;}
    this.lights=definition.lights.map(d=>{const li=new THREE.PointLight(new THREE.Color(...d.color.slice(0,3)),d.intensity,d.range,2);this.nodes[d.node].add(li);return {light:li,data:d,fade:definition.scripts.find(s=>s.node===d.node&&s.type==='ETFXLightFade')?.data.life};});
    this.rotations=definition.scripts.filter(s=>s.type==='ETFXRotation').map(s=>({node:this.nodes[s.node],base:this.nodes[s.node].quaternion.clone(),data:s.data}));
    this.setOptions(this.options);
    if(this.options.prewarm&&this.emitters.some(e=>e.definition.main.prewarm&&e.loop)){
      for(let i=0;i<180;i++)this.step(1/60,true);this.elapsed=0;
      for(const e of this.emitters)if(!e.definition.main.prewarm)e.clear();
    }
    this.playSounds();
  }
  remainingBudget(){return Math.max(0,this.options.maxParticles-this.emitters.reduce((n,e)=>n+e.particles.length,0));}
  get particleCount(){return this.emitters.reduce((n,e)=>n+e.particles.length,0);}
  get finished(){return !this.emitters.some(e=>!e.isSub&&(e.loop&&this.playing||e.time<e.duration)&&this.playing)&&!this.particleCount&&!this.emitters.some(e=>e.triggered.length||e.ghosts.length);}
  setOptions(options){
    Object.assign(this.options,options);this.options.size=Math.max(.01,this.options.size);this.options.density=Math.max(.02,Math.min(3,this.options.density));this.group.scale.setScalar(this.options.size);
    const tint=new THREE.Color(this.options.color);
    for(const e of this.emitters)for(const batch of [e.batch,e.trailBatch])if(batch){const base=batch.material.userData.baseTint;batch.material.uniforms.tint.value.copy(base);batch.material.uniforms.recolor.value.copy(tint);batch.material.uniforms.colorize.value=tint.r>.999&&tint.g>.999&&tint.b>.999?0:1;batch.material.uniforms.intensity.value=this.options.intensity;}
    for(const a of this.audioSources)if(a.gain)a.gain.gain.value=a.volume*this.options.gain;
    return this;
  }
  async playSounds(){
    if(!this.options.sound||!this.library.audioContext)return;const token=++this.playToken;
    for(const item of this.definition.audio){
      if(!item.clip)continue;
      try{const buffer=await this.library.sound(item.clip);if(!buffer||this.disposed||token!==this.playToken)return;
        const context=this.library.audioContext,source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=item.loop;source.playbackRate.value=item.pitch||1;
        const randomizer=this.definition.scripts.find(s=>s.node===item.node&&s.type==='ETFXPitchRandomizer');if(randomizer)source.playbackRate.value*=1+(Math.random()-.5)*2*(randomizer.data.randomPercent||0)/100;
        gain.gain.value=item.volume*this.options.gain;source.connect(gain).connect(context.destination);source.start();this.audioSources.push({source,gain,volume:item.volume});
      }catch(error){this.lastAudioError=error.message;}
    }
  }
  stopSounds(){this.playToken++;for(const a of this.audioSources){try{a.source.stop();}catch{}a.source.disconnect();a.gain.disconnect();}this.audioSources.length=0;}
  step(dt,prewarm=false){
    this.elapsed+=dt;
    for(const r of this.rotations){const v=r.data.rotateVector||{},q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-(v.x||0)*dt*Math.PI/180,-(v.y||0)*dt*Math.PI/180,(v.z||0)*dt*Math.PI/180,'ZXY'));if(r.data.rotateSpace===1)r.node.quaternion.premultiply(q);else r.node.quaternion.multiply(q);}
    this.group.updateMatrixWorld(true);
    for(const e of this.emitters)e.update(dt,this.playing&&(!prewarm||e.definition.main.prewarm));
    const events=this.events.splice(0,256);this.events.length=0;for(const event of events)event.target.trigger(event.origin,event.inherit);
    for(const entry of this.lights){entry.light.intensity=entry.data.intensity*this.options.intensity*(entry.fade?Math.max(0,1-this.elapsed/entry.fade):1);}
  }
  render(camera){
    this.group.updateMatrixWorld(true);this.inverseWorld.copy(this.group.matrixWorld).invert();const pos=new THREE.Vector3(),q=new THREE.Quaternion();this.group.matrixWorld.decompose(pos,q,this.worldScale);this.inverseQuaternion.copy(q).invert();
    for(const e of this.emitters)e.render(camera);
  }
  setDepthTexture(texture,{camera,width,height}){for(const e of this.emitters){const mat=e.batch?.material;if(!mat)continue;mat.uniforms.sceneDepth.value=texture||this.library.white;mat.uniforms.viewport.value.set(width,height);mat.uniforms.cameraRange.value.set(camera.near,camera.far);mat.uniforms.useSoftDepth.value=texture&&mat.userData.soft?1:0;}return this;}
  update(dt,camera){if(this.disposed)return;if(!this.paused){this.accumulator+=Math.min(.1,Math.max(0,dt))*Math.max(0,this.options.speed);let steps=0;while(this.accumulator>=1/60&&steps++<24){this.step(1/60);this.accumulator-=1/60;}}if(camera)this.render(camera);}
  stop({clear=false}={}){this.playing=false;this.stopSounds();if(clear)for(const e of this.emitters)e.clear();return this;}
  restart({sound=this.options.sound}={}){this.stopSounds();this.elapsed=0;this.accumulator=0;this.events.length=0;this.playing=true;this.paused=false;for(const r of this.rotations)r.node.quaternion.copy(r.base);for(const e of this.emitters)e.clear();if(sound)this.playSounds();return this;}
  seek(seconds,camera){this.restart({sound:false});for(let t=0;t<Math.min(30,Math.max(0,seconds));t+=1/60)this.step(1/60);if(camera)this.render(camera);return this;}
  bounds(){const b=new THREE.Box3();for(const e of this.emitters)for(const p of e.particles){const v=e.worldPositionOf(p);b.expandByPoint(v);const radius=Math.max(...e.particleAppearance(p).size)*this.options.size*.5;b.expandByPoint(v.clone().addScalar(radius));b.expandByPoint(v.clone().addScalar(-radius));}if(b.isEmpty())b.setFromCenterAndSize(this.group.position,new THREE.Vector3(4,4,4));return b;}
  dispose(){if(this.disposed)return;this.disposed=true;this.stopSounds();for(const e of this.emitters)e.dispose();this.group.removeFromParent();this.library.effects.delete(this);if(this.textureIds)this.library.releaseTextures(this.textureIds);}
}
