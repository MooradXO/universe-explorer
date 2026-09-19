import * as THREE from 'three';
import {curve,color,clamp,mix,random} from './curves.js';
import {ParticleBatch,TrailBatch} from './render.js';
const TAU=Math.PI*2,UP=new THREE.Vector3(0,1,0);
const v3=(o={})=>new THREE.Vector3(o.x||0,o.y||0,-(o.z||0));
const eulerQ=(x,y,z)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(-x,-y,z,'ZXY'));
const mulColor=(a,b)=>a.map((v,i)=>v*b[i]);

export class Emitter {
  constructor(fx,definition,index){
    this.fx=fx;this.definition=definition;this.modules=definition.modules;this.initial=this.modules.InitialModule;this.node=fx.nodes[definition.node];
    this.capacity=Math.max(1,Math.min(this.initial.maxNumParticles||1000,fx.options.maxParticlesPerEmitter||1200));
    this.rand=random((fx.options.seed||1337)+index*7349);this.particles=[];this.ghosts=[];this.triggered=[];this.time=-curve(definition.main.startDelay,0,this.rand())-1e-6;this.previousTime=this.time;this.remainder=0;
    this.local=definition.main.moveWithTransform===0;this.duration=Math.max(.01,definition.main.lengthInSec||5);this.loop=!!definition.main.looping;this.isSub=false;
    this.worldQuaternion=new THREE.Quaternion();this.worldScale=new THREE.Vector3();this.worldPosition=new THREE.Vector3();this.inverse=new THREE.Matrix4();
    this.lastPosition=new THREE.Vector3();this.emitterVelocity=new THREE.Vector3();this.refreshTransform();this.lastPosition.copy(this.worldPosition);
    const rd=definition.renderer;
    if(rd.m_RenderMode!==5){this.batch=new ParticleBatch(this,fx.library,fx.library.geometry(rd.m_RenderMode===4?rd.m_Mesh:null));}
    if(this.modules.TrailModule)this.trailBatch=new TrailBatch(this,fx.library);
  }
  refreshTransform(){this.node.updateWorldMatrix(true,false);this.node.matrixWorld.decompose(this.worldPosition,this.worldQuaternion,this.worldScale);this.inverse.copy(this.node.matrixWorld).invert();}
  active(){let n=this.node;while(n&&n!==this.fx.group){if(!n.visible)return false;n=n.parent;}return true;}
  worldPositionOf(p){return this.local?p.position.clone().applyMatrix4(this.node.matrixWorld):p.position.clone();}
  worldVelocityOf(p){return this.local?p.velocity.clone().applyQuaternion(this.worldQuaternion):p.velocity.clone();}
  toSimulationVector(v,isWorld=false){if(this.local&&isWorld)return v.applyQuaternion(this.worldQuaternion.clone().invert());if(!this.local&&!isWorld)return v.applyQuaternion(this.worldQuaternion);return v;}
  shape(){
    const s=this.modules.ShapeModule;let position=new THREE.Vector3(),direction=new THREE.Vector3(0,0,-1);
    if(!s)return {position,direction};
    const r=this.rand,rad=(typeof s.radius==='number'?s.radius:s.radius?.value)??1,arc=(s.arc?.value??360)*Math.PI/180;
    const angle=r()*arc,thick=s.radiusThickness??1,rr=rad*Math.sqrt(mix((1-thick)**2,1,r()));
    switch(s.type){
      case 0:case 1:case 2:case 3:{
        const z=(s.type===2||s.type===3)?r():r()*2-1,a=r()*TAU,w=Math.sqrt(1-z*z);
        direction.set(Math.cos(a)*w,Math.sin(a)*w,-z);position.copy(direction).multiplyScalar(rad*(s.type===1||s.type===3?1:Math.cbrt(mix((1-thick)**3,1,r()))));break;
      }
      case 4:case 7:case 8:case 9:{
        position.set(Math.cos(angle)*rr,Math.sin(angle)*rr,0);
        const opening=(s.angle||0)*Math.PI/180,sa=Math.sin(opening)*(rad>0?rr/rad:1);
        direction.set(Math.cos(angle)*sa,Math.sin(angle)*sa,-Math.cos(opening)).normalize();
        if(s.type===8||s.type===9)position.addScaledVector(direction,(s.length||0)*r());break;
      }
      case 5:case 15:case 16:{
        position.set(r()-.5,r()-.5,r()-.5);
        if(s.type===15||s.type===16){const ax=Math.floor(r()*3);position.setComponent(ax,r()<.5?-.5:.5);if(s.type===16)position.setComponent((ax+1)%3,r()<.5?-.5:.5);}break;
      }
      case 10:case 11:position.set(Math.cos(angle)*rr,Math.sin(angle)*rr,0);direction.copy(position).normalize();if(!direction.lengthSq())direction.set(0,0,-1);break;
      case 12:position.set((r()-.5)*rad*2,0,0);break;
      case 18:position.set(r()-.5,r()-.5,0);break;
      default:position.set((r()-.5)*rad,(r()-.5)*rad,(r()-.5)*rad);break;
    }
    if(s.randomPositionAmount)position.add(new THREE.Vector3(r()-.5,r()-.5,r()-.5).multiplyScalar(s.randomPositionAmount));
    if(s.randomDirectionAmount){const rnd=new THREE.Vector3(r()-.5,r()-.5,r()-.5).normalize();direction.lerp(rnd,s.randomDirectionAmount).normalize();}
    if(s.sphericalDirectionAmount)direction.lerp(position.clone().normalize(),s.sphericalDirectionAmount).normalize();
    const rotation=s.m_Rotation||{},q=eulerQ((rotation.x||0)*Math.PI/180,(rotation.y||0)*Math.PI/180,(rotation.z||0)*Math.PI/180);
    position.multiply(new THREE.Vector3(s.m_Scale?.x??1,s.m_Scale?.y??1,s.m_Scale?.z??1)).applyQuaternion(q).add(v3(s.m_Position));direction.applyQuaternion(q);
    return {position,direction};
  }
  spawn(count,origin=null,inherit=null){
    if(!this.active())return;
    count=Math.min(Math.round(count*this.fx.options.density),this.capacity-this.particles.length,this.fx.remainingBudget());
    for(let i=0;i<count;i++){
      const r=this.rand,seed=r(),seed2=r(),norm=clamp(Math.max(0,this.time%this.duration)/this.duration),init=this.initial,sh=this.shape();
      const life=Math.max(.016,Math.min(120,curve(init.startLifetime,norm,seed,1))),speed=curve(init.startSpeed,norm,r(),0),size=curve(init.startSize,norm,r(),1);
      let position=sh.position,velocity=sh.direction.clone().multiplyScalar(speed);
      if(origin){position=this.local?origin.clone().applyMatrix4(this.inverse):origin.clone();}
      else if(!this.local)position.applyMatrix4(this.node.matrixWorld);
      if(!this.local)velocity.applyQuaternion(this.worldQuaternion);
      const inh=this.modules.InheritVelocityModule;
      if(inh){let iv=inherit?.velocity?.clone()||this.emitterVelocity.clone();if(this.local)iv.applyQuaternion(this.worldQuaternion.clone().invert());velocity.addScaledVector(iv,curve(inh.m_Curve,norm,seed));}
      const p={position,velocity,age:0,life,seed,seed2,size:[size,init.size3D?curve(init.startSizeY,norm,r(),size):size,init.size3D?curve(init.startSizeZ,norm,r(),size):size],
        rotation:new THREE.Vector3(init.rotation3D?curve(init.startRotationX,norm,r()):0,init.rotation3D?curve(init.startRotationY,norm,r()):0,curve(init.startRotation,norm,r())),
        color:color(init.startColor,norm,r()),gravity:curve(init.gravityModifier,norm,seed),history:[],trail:!!this.modules.TrailModule&&r()<(this.modules.TrailModule.ratio??1),frameSeed:r(),shapeDirection:sh.direction.clone(),spawnQuaternion:this.worldQuaternion.clone(),spawnScale:this.worldScale.clone()};
      if(init.randomizeRotationDirection&&r()<init.randomizeRotationDirection)p.rotation.z*=-1;
      if(inherit?.color)p.color=mulColor(p.color,inherit.color);
      this.particles.push(p);this.subEvent(0,p);
    }
  }
  subEvent(type,p){
    for(const sub of this.modules.SubModule?.subEmitters||[]){
      if(sub.type!==type||this.rand()>(sub.emitProbability??1))continue;
      const target=this.fx.byId.get(sub.emitter.fileID);if(!target||target===this)continue;
      this.fx.events.push({target,origin:this.worldPositionOf(p),inherit:{velocity:this.worldVelocityOf(p),color:(sub.properties&1)?p.color:null}});
    }
  }
  trigger(origin,inherit){
    this.triggered.push({age:-curve(this.definition.main.startDelay,0,this.rand()),old:-curve(this.definition.main.startDelay,0,.5)-1e-6,remainder:0,origin:origin.clone(),inherit});
  }
  emitBetween(old,now,session=null){
    const m=this.modules.EmissionModule;if(!m||now<0)return;
    const looping=this.loop&&!session;
    if(!looping&&old>this.duration)return;
    const duration=this.duration,startCycle=Math.max(0,Math.floor(Math.max(0,old)/duration)),lastCycle=Math.max(0,Math.floor(now/duration));
    const span=Math.max(0,Math.min(now,looping?now:duration)-Math.max(old,0)),phase=(now%duration)/duration;
    let amount=curve(m.rateOverTime,phase,this.rand())*span;
    if(!session)amount+=curve(m.rateOverDistance,phase,this.rand())*this.emitterVelocity.length()*span;
    const field=session||this;field.remainder+=amount;
    const n=Math.floor(field.remainder);field.remainder-=n;if(n>0)this.spawn(n,session?.origin,session?.inherit);
    for(let cycle=startCycle;cycle<=lastCycle&&cycle<=startCycle+2;cycle++){
      if(!looping&&cycle>0)break;
      for(const b of m.m_Bursts||[]){
        const repeats=b.cycleCount||1;
        for(let j=0;j<Math.min(repeats,512);j++){
          const t=cycle*duration+(b.time||0)+j*(b.repeatInterval||.01);
          if(t>old&&t<=now&&this.rand()<=(b.probability??1))this.spawn(curve(b.countCurve,phase,this.rand(),b.cnt0||1),session?.origin,session?.inherit);
        }
      }
    }
  }
  update(dt,emit=true){
    this.refreshTransform();this.emitterVelocity.copy(this.worldPosition).sub(this.lastPosition).divideScalar(Math.max(dt,1e-6));this.lastPosition.copy(this.worldPosition);
    const step=dt*(this.definition.main.simulationSpeed||1);this.previousTime=this.time;this.time+=step;
    if(emit&&!this.isSub)this.emitBetween(this.previousTime,this.time);
    for(const s of this.triggered){const old=s.age;s.age+=step;this.emitBetween(old-1e-7,s.age,s);}
    this.triggered=this.triggered.filter(s=>s.age<=this.duration);
    const m=this.modules;
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];p.age+=step;const t=clamp(p.age/p.life);
      if(p.age>=p.life){this.subEvent(2,p);if(p.trail&&!m.TrailModule.dieWithParticles)this.ghosts.push({history:p.history,color:p.color,size:p.size[0],seed:p.seed});this.particles.splice(i,1);continue;}
      const gravity=this.toSimulationVector(new THREE.Vector3(0,-9.81*p.gravity,0),true);p.velocity.addScaledVector(gravity,step);
      if(m.ForceModule){const f=m.ForceModule;p.velocity.addScaledVector(this.toSimulationVector(new THREE.Vector3(curve(f.x,t,p.seed),curve(f.y,t,p.seed2),-curve(f.z,t,1-p.seed)),!!f.inWorldSpace),step);}
      if(m.ClampVelocityModule){
        const l=m.ClampVelocityModule,speed=p.velocity.length(),limit=Math.max(0,curve(l.magnitude,t,p.seed,1));
        if(speed>limit){const k=1-Math.pow(1-clamp(l.dampen||0),step*60);p.velocity.multiplyScalar(mix(speed,limit,k)/speed);}
        const drag=Math.max(0,curve(l.drag,t,p.seed));if(drag)p.velocity.multiplyScalar(Math.exp(-drag*step*(l.multiplyDragByParticleSize?p.size[0]:1)*(l.multiplyDragByParticleVelocity?speed:1)));
      }
      let velocity=p.velocity.clone();
      if(m.VelocityModule){const v=m.VelocityModule;velocity.add(this.toSimulationVector(new THREE.Vector3(curve(v.x,t,p.seed),curve(v.y,t,p.seed2),-curve(v.z,t,1-p.seed)),!!v.inWorldSpace));velocity.multiplyScalar(curve(v.speedModifier,t,p.seed,1));
        const radial=curve(v.radial,t,p.seed);if(radial){const center=this.local?new THREE.Vector3():this.worldPosition;velocity.add(p.position.clone().sub(center).normalize().multiplyScalar(radial));}
        const ox=curve(v.orbitalX,t,p.seed),oy=curve(v.orbitalY,t,p.seed),oz=curve(v.orbitalZ,t,p.seed);if(ox||oy||oz){const center=this.local?new THREE.Vector3():this.worldPosition;p.position.sub(center).applyQuaternion(eulerQ(ox*step,oy*step,oz*step)).add(center);}
      }
      if(m.InheritVelocityModule?.m_Mode===1){const iv=this.toSimulationVector(this.emitterVelocity.clone(),true);velocity.addScaledVector(iv,curve(m.InheritVelocityModule.m_Curve,t,p.seed));}
      p.position.addScaledVector(velocity,step);
      if(m.NoiseModule){const n=m.NoiseModule,f=n.frequency||1,amp=curve(n.strength,t,p.seed)*.45,scroll=curve(n.scrollSpeed,t,p.seed),phase=this.fx.elapsed*(1+scroll)+p.seed*TAU*13;
        const noise=new THREE.Vector3(Math.sin(p.position.y*f+phase)*Math.cos(phase*.73),Math.sin(p.position.z*f+phase*1.13),Math.cos(p.position.x*f+phase*.91));p.position.addScaledVector(noise,amp*step);
      }
      if(m.RotationModule){const rot=m.RotationModule;p.rotation.z+=curve(rot.curve,t,p.seed)*step;if(rot.separateAxes){p.rotation.x+=curve(rot.x,t,p.seed2)*step;p.rotation.y+=curve(rot.y,t,1-p.seed)*step;}}
      if(m.RotationBySpeedModule){const rot=m.RotationBySpeedModule,st=clamp((velocity.length()-(rot.range?.x||0))/Math.max(.001,(rot.range?.y||1)-(rot.range?.x||0)));p.rotation.z+=curve(rot.curve,st,p.seed)*step;if(rot.separateAxes){p.rotation.x+=curve(rot.x,st,p.seed2)*step;p.rotation.y+=curve(rot.y,st,1-p.seed)*step;}}
      if(m.CollisionModule){
        const world=this.worldPositionOf(p),wv=this.worldVelocityOf(p),collision=m.CollisionModule,radius=Math.max(.001,p.size[0]*(collision.radiusScale||.01)*.5);
        let hit=false;
        if(this.fx.options.collider)hit=!!this.fx.options.collider({position:world,velocity:wv,radius,dt:step});
        else if(this.fx.options.groundY!==null&&world.y-radius<this.fx.options.groundY&&wv.y<0){world.y=this.fx.options.groundY+radius;wv.y=-wv.y*curve(collision.m_Bounce,t,p.seed,.2);const damp=1-clamp(curve(collision.m_Dampen,t,p.seed));wv.x*=damp;wv.z*=damp;hit=true;}
        if(hit){p.position.copy(this.local?world.applyMatrix4(this.inverse):world);p.velocity.copy(this.local?wv.applyQuaternion(this.worldQuaternion.clone().invert()):wv);this.subEvent(1,p);p.age+=p.life*clamp(curve(collision.m_EnergyLossOnCollision,t,p.seed));if(wv.length()<(collision.minKillSpeed||0))p.age=p.life;}
      }
      p.lastVelocity=velocity;
      if(p.trail){const world=this.worldPositionOf(p),last=p.history.at(-1),min=m.TrailModule.minVertexDistance||.05;if(!last||last.p.distanceTo(world)>=min||this.fx.elapsed-last.t>.05)p.history.push({p:world,t:this.fx.elapsed});const life=this.trailLife(p);while(p.history.length&&this.fx.elapsed-p.history[0].t>life)p.history.shift();if(p.history.length>100)p.history.shift();}
    }
    this.ghosts=this.ghosts.filter(g=>{const life=curve(m.TrailModule?.lifetime,0,g.seed,.3);g.history=g.history.filter(h=>this.fx.elapsed-h.t<life);return g.history.length>1;});
  }
  trailLife(p){const m=this.modules.TrailModule;return Math.max(.02,curve(m.lifetime,p.age/p.life,p.seed,.3)*(m.sizeAffectsLifetime?p.size[0]:1));}
  particleAppearance(p){
    const t=clamp(p.age/p.life),m=this.modules;let size=p.size.slice(),col=p.color.slice();
    if(m.SizeModule){const s=m.SizeModule;size[0]*=curve(s.curve,t,p.seed,1);size[1]*=curve(s.separateAxes?s.y:s.curve,t,p.seed,1);size[2]*=curve(s.separateAxes?s.z:s.curve,t,p.seed,1);}
    if(m.ColorModule)col=mulColor(col,color(m.ColorModule.gradient,t,p.seed));
    return {size,col};
  }
  render(camera){
    const m=this.modules,uv=m.UVModule,rd=this.definition.renderer,fx=this.fx;
    let list=this.particles;
    if(rd.m_SortMode===1){const eye=camera.getWorldPosition(new THREE.Vector3());list=[...list].sort((a,b)=>this.worldPositionOf(b).distanceToSquared(eye)-this.worldPositionOf(a).distanceToSquared(eye));}
    let i=0;
    for(const p of list){
      const t=clamp(p.age/p.life),a=this.particleAppearance(p);let {size,col}=a;
      const world=this.worldPositionOf(p),position=world.clone().applyMatrix4(fx.inverseWorld),nodeScale=this.local?this.worldScale:p.spawnScale,groupScale=fx.worldScale;
      size=size.map((v,k)=>Math.max(0,v)*Math.abs(nodeScale.getComponent(k))/Math.max(.001,Math.abs(groupScale.getComponent(k))));
      let q=eulerQ(p.rotation.x,p.rotation.y,p.rotation.z);
      if(m.ShapeModule?.alignToDirection)q.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),p.shapeDirection));
      q.premultiply(this.local?this.worldQuaternion:p.spawnQuaternion).premultiply(fx.inverseQuaternion);
      const velocity=this.worldVelocityOf({...p,velocity:p.lastVelocity||p.velocity}).applyQuaternion(fx.inverseQuaternion);
      let frame=0;
      if(uv){const frames=(uv.tilesX||1)*(uv.tilesY||1),animTime=uv.timeMode===1?p.age*(uv.fps||30)/frames:uv.timeMode===2?clamp((velocity.length()-(uv.speedRange?.x||0))/Math.max(.001,(uv.speedRange?.y||1)-(uv.speedRange?.x||0))):t;
        let f=curve(uv.frameOverTime,animTime,p.frameSeed,animTime)*(uv.cycles||1)+curve(uv.startFrame,0,p.frameSeed);
        if(uv.timeMode===1)f=animTime+curve(uv.startFrame,0,p.frameSeed);
        f=((f%1)+1)%1;
        if(uv.animationType===1){const row=uv.rowMode===1?Math.floor(p.frameSeed*(uv.tilesY||1)):uv.rowIndex||0;frame=row*(uv.tilesX||1)+Math.floor(f*(uv.tilesX||1));}else frame=Math.floor(f*frames);
      }
      if(this.batch)this.batch.write(i++,position,size,q,col,velocity,p.rotation.z,frame);
    }
    this.batch?.finish(i);
    if(this.trailBatch){
      const batch=this.trailBatch,tr=m.TrailModule,eye=camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(fx.inverseWorld);batch.reset();
      const records=tr.mode===1?[{history:this.particles.map(p=>({p:this.worldPositionOf(p),t:fx.elapsed-p.age})),color:[1,1,1,1],size:1,seed:.5}]:[...this.particles.filter(p=>p.trail).map(p=>({history:p.history,color:this.particleAppearance(p).col,size:p.size[0],seed:p.seed})),...this.ghosts];
      for(const rec of records){const h=rec.history,life=Math.max(.02,curve(tr.lifetime,0,rec.seed,.3)),baseWidth=tr.sizeAffectsWidth?rec.size:1;
        for(let j=1;j<h.length;j++){
          const u0=(j-1)/Math.max(1,h.length-1),u1=j/Math.max(1,h.length-1),age0=clamp((fx.elapsed-h[j-1].t)/life),age1=clamp((fx.elapsed-h[j].t)/life);
          const c0=mulColor(color(tr.colorOverTrail,u0,rec.seed),color(tr.colorOverLifetime,age0,rec.seed)),c1=mulColor(color(tr.colorOverTrail,u1,rec.seed),color(tr.colorOverLifetime,age1,rec.seed));
          if(tr.inheritParticleColor){for(let k=0;k<4;k++){c0[k]*=rec.color[k];c1[k]*=rec.color[k];}}
          batch.segment(h[j-1].p.clone().applyMatrix4(fx.inverseWorld),h[j].p.clone().applyMatrix4(fx.inverseWorld),baseWidth*curve(tr.widthOverTrail,u0,rec.seed,1),baseWidth*curve(tr.widthOverTrail,u1,rec.seed,1),c0,c1,eye,u0,u1);
        }
      }
      batch.finish();
    }
  }
  clear(){this.particles.length=0;this.ghosts.length=0;this.triggered.length=0;this.remainder=0;this.time=-curve(this.definition.main.startDelay,0,.5)-1e-6;this.previousTime=this.time;this.batch?.finish(0);}
  dispose(){this.batch?.dispose();this.trailBatch?.dispose();this.clear();}
}
