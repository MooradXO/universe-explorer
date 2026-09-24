import * as T from 'three';
import { SceneComposer,MODEL_CONFIGS } from '../../world/generation/SceneComposer';
import { readScene,PLAY_KEY,type SceneDocument } from '../../world/generation/SceneDocument';
import { ShipController } from '../../core/ShipController';
import { ShipEngineVFX } from '../../world/ShipEngineVFX';
import { ProjectileVisuals } from '../../world/visuals/ProjectileVisuals';
import { MobileControlsUI } from '../../ui/MobileFlightControlsUI';
import { usesMobileLayout } from '../../ui/uiPlatform';

/** A local flight test of the document; no account, network connection or saved game. */
export async function startPlay(){
  document.body.classList.add('workshop-flight');const root=document.querySelector<HTMLElement>('#environments')!;let documentData:SceneDocument;
  try{documentData=readScene(localStorage.getItem(PLAY_KEY)||'');}catch{root.innerHTML="<p class=\"help\">No scene is ready. Open the workshop and select Fly in scene.</p><a href=\"/environments.html\">Open workshop</a>";return;}
  root.innerHTML="<div class=\"play-bar\"><span id=\"play-title\"></span><button id=\"play-reset\">Return to start</button><a href=\"/environments.html\">Workshop</a></div><div class=\"play-help\">Preview flight · W/S thrust · A/D strafe · Mouse steer · Shift boost · V camera · 1/2/3 weapons · Left click fire · Esc release pointer</div><div class=\"play-crosshair\">+</div><div class=\"play-vitals\" id=\"play-vitals\"></div>";
  document.getElementById('play-title')!.textContent=documentData.name;
  const low=new URLSearchParams(location.search).get('quality')==='LOW',composer=new SceneComposer(low);composer.sync(documentData);
  const camera=new T.PerspectiveCamera(65,innerWidth/innerHeight,1,2000000),renderer=new T.WebGLRenderer({antialias:!low,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=Number(documentData.settings.exposure);renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.5));renderer.setSize(innerWidth,innerHeight);root.append(renderer.domElement);
  const ship=new T.Group(),controller=new ShipController(camera);composer.scene.add(ship);controller.setShip(ship);const config=MODEL_CONFIGS[0];let active=true,ready=false;
  const visual=new T.Group();ship.add(visual);try{const model=await composer.model(0);if(!active)return;model.scale.setScalar(config.scale);model.rotation.set(...config.rotation);visual.add(model);ready=true;}catch{document.getElementById('play-title')!.textContent+=" · could not load ship";}
  const engine=new ShipEngineVFX(visual,config.nozzles,config.engineColor,config.nozzleSizes,low),weapons=new ProjectileVisuals(low);
  const mobile=new MobileControlsUI();mobile.setVisible(true);if(usesMobileLayout()){document.body.classList.add('is-mobile','titan-ui');document.querySelector('.play-help')!.textContent="Left thumb: fly and steer · Right thumb: fire";}document.querySelector('.mobile-action--voice')?.remove();
  const box=composer.bounds(),primary=documentData.entities.find(e=>e.visible&&e.kind==='planet'),center=primary?composer.object(primary.id)!.getWorldPosition(new T.Vector3()):box.getCenter(new T.Vector3()),size=primary?Number(primary.params.radius)*composer.object(primary.id)!.getWorldScale(new T.Vector3()).x:Math.max(1200,box.getSize(new T.Vector3()).length()/2),spawn=center.clone().add(new T.Vector3(0,size*.15,size*3));
  function reset(){ship.position.copy(spawn);ship.quaternion.identity();controller.setShip(ship);controller.resetTransitMotion();camera.position.copy(spawn).add(new T.Vector3(0,120,400));camera.lookAt(center);}
  reset();document.getElementById('play-reset')!.onclick=reset;
  let firing=false,cooldown=0,shotsFired=0;type Shot={object:T.Group;velocity:T.Vector3;life:number};const shots:Shot[]=[];
  const fireStart=()=>{firing=true;},fireEnd=()=>{firing=false;};window.addEventListener('PrimaryFireStart',fireStart);window.addEventListener('PrimaryFireEnd',fireEnd);
  function fire(){if(shots.length>90)return;const kind=controller.activeWeapon,color=controller.laserColor==='blue'?0x2288ff:0xff3333,count=kind==='shotgun'?3:1;
    for(let i=0;i<count;i++){const shot=kind==='missile'?weapons.createMissileOrTorpedo(false):weapons.createVolumetricLaser(color,kind==='shotgun'?260:420,true),direction=new T.Vector3((i-(count-1)/2)*.035,0,-1).normalize().applyQuaternion(ship.quaternion);shot.position.set(0,0,-150).applyQuaternion(ship.quaternion).add(ship.position);shot.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);composer.scene.add(shot);shots.push({object:shot,velocity:direction.multiplyScalar(kind==='missile'?4000:11000).add(controller.velocity),life:3});shotsFired++;}
    cooldown=kind==='missile'?.65:kind==='shotgun'?.35:.16;
  }
  let elapsed=0,last=0,raf=0;const ray=new T.Raycaster(),direction=new T.Vector3();
  function tick(now:number){const dt=Math.min(.05,(now-last)/1000||0);last=now;elapsed+=dt;controller.update(dt);visual.visible=controller.viewMode!=='first';engine.update(dt,elapsed,controller.velocity.length(),controller.isBoosting,config.engineColor);cooldown-=dt;if(firing&&cooldown<=0)fire();
    for(let i=shots.length-1;i>=0;i--){const s=shots[i],distance=s.velocity.length()*dt;direction.copy(s.velocity).normalize();ray.set(s.object.position,direction);ray.far=distance;const hit=ray.intersectObjects(composer.objects.children,true).some(h=>{let o:T.Object3D|null=h.object;while(o&&o!==composer.objects){if(!o.visible)return false;o=o.parent;}return true;});s.object.position.addScaledVector(s.velocity,dt);weapons.previewTail(s.object,distance);s.life-=dt;if(s.life<=0||hit){s.object.removeFromParent();shots.splice(i,1);}}
    composer.update(dt,elapsed,camera);renderer.render(composer.scene,camera);document.getElementById('play-vitals')!.textContent=`${Math.round(controller.velocity.length())} units/s · boost ${Math.round(controller.currentBoost)}% · ${controller.activeWeapon}`;raf=requestAnimationFrame(tick);
  }
  const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};window.addEventListener('resize',resize);raf=requestAnimationFrame(tick);
  Object.defineProperty(window,'__UNIVERSE_WORKSHOP_FLIGHT__',{value:Object.freeze({snapshot:()=>({ready,position:ship.position.toArray(),rotation:ship.quaternion.toArray(),speed:controller.velocity.length(),weapon:controller.activeWeapon,view:controller.viewMode,shots:shots.length,shotsFired,scene:composer.snapshot()})})});
  window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);window.removeEventListener('PrimaryFireStart',fireStart);window.removeEventListener('PrimaryFireEnd',fireEnd);controller.clearShip();mobile.setVisible(false);engine.dispose();weapons.disposeVisuals();composer.dispose();renderer.dispose();},{once:true});
}
