import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CinematicGeometryPool,CinematicPlanet } from '../../world/visuals/CinematicPlanet';
import { CinematicBackground } from '../../world/visuals/CinematicBackground';
import { OrbitalDebris } from '../../world/visuals/OrbitalDebris';
import { FloatingOrigin } from '../../world/space/FloatingOrigin';
import { worldPosition } from '../../world/space/WorldPosition';
import { orbitalZones } from '../../world/systems/OrbitalSite';
import { REVIEW_WORLDS } from '../../world/environments/EnvironmentReviewWorlds';
import { LIBRARY_COUNTS,SURFACES,OBJECTS,LAYOUTS,STRUCTURES,PHENOMENA,BACKDROP_SHAPES } from '../../world/environments/EnvironmentLibrary';
import { ApprovedFlightFX } from '../../world/visuals/ApprovedFlightFX';
import { ENVIRONMENT_FX_PRESETS } from '../../world/environments/EnvironmentFXPresets';
import { EpicEffectSpace } from '../../world/visuals/EpicEffectSpace';
import type { EpicFX,EpicFXLibrary } from '../../vendor/epic-fx/epic-fx';
import './style.css';

const root=document.querySelector<HTMLElement>('#environments')!;
root.innerHTML=`<header><a href="/">UNIVERSE <b>EXPLORER</b></a><span>БИБЛИОТЕКА ОКРУЖЕНИЙ</span><a href="/">В игру ↗</a></header>
<section class="heading"><div><small>32 МИРА · ОДИН ГЕНЕРАТОР С ИГРОЙ</small><h1>У каждого мира свой характер</h1></div><p>Поверхность, орбитальные зоны и явления.<br>Поворачивайте сцену и сравнивайте соседние миры.</p></section>
<section class="toolbar"><button id="previous" aria-label="Предыдущий мир">←</button><select id="world" aria-label="Мир"></select><button id="next" aria-label="Следующий мир">→</button><select id="view" aria-label="Ракурс"><option value="planet">Планета</option><option value="orbit">Точка прибытия</option><option value="zone">Орбитальная зона</option></select><select id="zone" aria-label="Зона"></select><select id="quality" aria-label="Качество"><option>HIGH</option><option>LOW</option></select><button id="pause">Пауза</button></section>
<section id="stage"><div class="caption"><small id="system"></small><h2 id="name"></h2><p id="description"></p></div><span class="hint">Мышь / касание — повернуть · колесо / два пальца — приблизить</span></section>
<section class="facts"><p id="facts"></p><output id="metrics"></output></section>
<details class="catalog"><summary>Проверка структурных рецептов и эффектов</summary><p>Эти переключатели временно показывают отдельные рецепты. Основной маршрут выше использует профили, назначенные в игре.</p><div class="toolbar"><select id="category" aria-label="Категория рецептов"><option value="surface">Поверхности</option><option value="objects">Объекты</option><option value="layout">Расположение</option><option value="structure">Сооружения</option><option value="phenomenon">Явления</option><option value="backdrop">Свечение</option><option value="fx">Epic FX</option></select><select id="recipe" aria-label="Рецепт"></select><button id="reset">Вернуть профиль мира</button></div></details>
<footer>Реальные планеты: AT-HYG · JPL · IAU. Карты: <a href="https://www.solarsystemscope.com/textures/">Solar System Scope, CC BY 4.0</a>. Окружения и миры у других звёзд — игровые. <a href="/THIRD_PARTY_NOTICES.md">Источники и лицензии</a></footer>`;
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const world=$<HTMLSelectElement>('world'),view=$<HTMLSelectElement>('view'),zone=$<HTMLSelectElement>('zone'),quality=$<HTMLSelectElement>('quality'),stage=$<HTMLElement>('stage');
world.innerHTML=REVIEW_WORLDS.map(({body,system},i)=>`<option value="${i}">${String(i+1).padStart(2,'0')} · ${body.name} / ${system.anchor.title}</option>`).join('');
const params=new URLSearchParams(location.search);world.value=String(Math.max(0,Math.min(31,Number(params.get('world')||0))));quality.value=params.get('quality')==='LOW'?'LOW':'HIGH';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,1,400000),renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;stage.append(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Планета и окружение из игры');
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
const ambient=new THREE.HemisphereLight('#9eaebb','#161923',.8),key=new THREE.DirectionalLight('#fff0d5',2.5);scene.add(ambient,key);
const origin=new FloatingOrigin();let pool:CinematicGeometryPool,planet:CinematicPlanet,background:CinematicBackground,debris:OrbitalDebris,fx:ApprovedFlightFX;
let override:{category:string;recipe:number}|null=null,elapsed=0,paused=false,last=0,raf=0,fps=0,frameCount=0,sampleTime=0,selection=0;
let fxLibrary:EpicFXLibrary|undefined,soloFX:EpicFX|undefined;const soloSpace=new EpicEffectSpace(100);scene.add(soloSpace.anchor);
function select(){
  const ticket=++selection;soloFX?.dispose();soloFX=undefined;
  planet?.dispose();debris?.dispose();background?.dispose();fx?.dispose();pool?.dispose();
  const {body:original,system}=REVIEW_WORLDS[Number(world.value)],body={...original,environment:structuredClone(original.environment)};
  if(override?.category==='surface'){body.id=`review/${original.id}`;body.environment.surface=override.recipe;const s=SURFACES[override.recipe];body.environment.colors=s.colors;body.environment.material=override.recipe*2;body.environment.geography=s.geography;body.environment.warp=s.warp;body.environment.clouds=null;body.environment.ring=null;}
  if(override?.category==='backdrop')body.environment.backdrop.shape=override.recipe;
  const low=quality.value==='LOW';pool=new CinematicGeometryPool(low);planet=new CinematicPlanet(body,pool,system.starColor);background=new CinematicBackground(system.anchor.catalogId,low);background.setEnvironment(body.environment);
  origin.moveTo(worldPosition(undefined,body.position));const zones=orbitalZones(body),index=Math.min(zones.length-1,Number(zone.value)||0),active=zones[index];
  zone.innerHTML=zones.map(z=>`<option value="${z.index}">${z.label}</option>`).join('');zone.value=String(index);
  if(override&&['objects','layout','structure','phenomenon'].includes(override.category)){
    if(override.category==='layout'){body.environment.layout=override.recipe;const replacement=orbitalZones(body)[0];Object.assign(active,{layout:override.recipe,rocks:replacement.rocks});}
    else Object.assign(active,{[override.category]:override.recipe});
  }
  debris=new OrbitalDebris(body,low,[],active);debris.update(origin);scene.add(planet.group,background.mesh,debris.group);fx=new ApprovedFlightFX(scene,low);
  const position=new THREE.Vector3(...origin.fromAbsolute(active.arrival)),center=new THREE.Vector3(...origin.fromAbsolute(active.center));
  if(view.value==='planet'){camera.position.set(body.radius*.75,body.radius*.36,body.radius*(body.environment.ring?6.2:4.1));controls.target.set(0,0,0);debris.group.visible=false;}
  else if(view.value==='orbit'){camera.position.copy(position);controls.target.set(0,0,0);}
  else {camera.position.copy(center).add(new THREE.Vector3(1450,650,1850));controls.target.copy(center);}
  controls.minDistance=body.radius*.1;controls.maxDistance=250000;controls.update();
  key.position.set(...body.position).negate().normalize().multiplyScalar(30000);key.color.setHex(system.starColor).lerp(new THREE.Color('white'),.8);
  if(override?.category==='fx'){
    planet.group.visible=false;debris.group.visible=false;background.mesh.visible=false;scene.background=new THREE.Color('#030710');camera.position.set(0,170,1100);controls.target.set(0,0,0);controls.minDistance=10;controls.update();
    const preset=ENVIRONMENT_FX_PRESETS[override.recipe];void import('../../vendor/epic-fx/epic-fx.js').then(async({EpicFXLibrary})=>{
      fxLibrary??=new EpicFXLibrary('/assets/fx-environments/');await fxLibrary.ready;const effect=await fxLibrary.create(preset.id,{size:1,sound:false,groundY:null,prewarm:false,maxParticles:low?260:700,maxParticlesPerEmitter:low?110:280,density:low?.55:.8,intensity:.4,seed:123});
      if(selection!==ticket){effect.dispose();return;}soloFX=effect;soloSpace.anchor.add(effect.group);
      for(let frame=0;frame<120;frame++)soloSpace.update(effect,1/60,camera);
    });
  }else scene.background=null;
  $('system').textContent=`${system.anchor.title} · ${body.origin==='catalogue'?'СОЛНЕЧНАЯ СИСТЕМА':'ИГРОВОЙ МИР'}`;$('name').textContent=original.name;
  $('description').textContent=`${SURFACES[body.environment.surface].name} · ${BACKDROP_SHAPES[body.environment.backdrop.shape]}`;
  $('facts').textContent=`${zones.length} зон · ${OBJECTS[active.objects].name} · ${LAYOUTS[active.layout].name} · ${active.structure===null?'Без сооружения':STRUCTURES[active.structure].name} · ${PHENOMENA[active.phenomenon].name}`;
  renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.5));fit();
}
function fit(){renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();}
const resize=new ResizeObserver(fit);resize.observe(stage);
world.onchange=()=>{zone.value='0';override=null;select();};view.onchange=select;zone.onchange=select;quality.onchange=select;
$('previous').onclick=()=>{world.value=String((Number(world.value)+31)%32);world.onchange?.(new Event('change'));};$('next').onclick=()=>{world.value=String((Number(world.value)+1)%32);world.onchange?.(new Event('change'));};
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Продолжить':'Пауза';};$('reset').onclick=()=>{override=null;select();};
const category=$<HTMLSelectElement>('category'),recipe=$<HTMLSelectElement>('recipe');
function listRecipes(){const entries=category.value==='surface'?SURFACES:category.value==='objects'?OBJECTS:category.value==='layout'?LAYOUTS:category.value==='structure'?STRUCTURES:category.value==='phenomenon'?PHENOMENA:category.value==='fx'?ENVIRONMENT_FX_PRESETS:BACKDROP_SHAPES.map(name=>({name}));
  recipe.innerHTML=entries.map((item,i)=>`<option value="${i}">${i+1} · ${item.name}</option>`).join('');}
category.onchange=listRecipes;recipe.onchange=()=>{override={category:category.value,recipe:Number(recipe.value)};view.value=['surface','backdrop'].includes(category.value)?'planet':'zone';select();};listRecipes();select();
function tick(now:number){const dt=Math.min(.05,(now-last)/1000||0);last=now;if(!paused)elapsed+=dt;controls.update();planet.update(elapsed);debris.update(origin,elapsed);background.update(camera.position,elapsed);
  if(!paused){if(soloFX)soloSpace.update(soloFX,dt,camera);else if(view.value!=='planet')fx.update(dt,camera,camera.position,camera.quaternion,false,new THREE.Vector3(...origin.fromAbsolute(debris.site.anomaly)),debris.site);}
  renderer.render(scene,camera);frameCount++;sampleTime+=dt;if(sampleTime>1){fps=Math.round(frameCount/sampleTime);frameCount=0;sampleTime=0;$('metrics').textContent=`${fps} FPS · ${renderer.info.render.calls} вызовов · ${renderer.info.memory.geometries} геометрий · ${renderer.info.memory.textures} текстур`;}
  raf=requestAnimationFrame(tick);
}
raf=requestAnimationFrame(tick);
Object.defineProperty(window,'__UNIVERSE_ENVIRONMENTS__',{value:Object.freeze({snapshot:()=>({world:Number(world.value),quality:quality.value,profile:planet.body.environment,zone:debris.snapshot(),counts:LIBRARY_COUNTS,
  fps,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,...renderer.info.memory,fx:fx.snapshot(),soloFX:soloFX?{particles:soloFX.particleCount,finished:soloFX.finished}:null,override})})});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);selection++;resize.disconnect();controls.dispose();soloFX?.dispose();fxLibrary?.dispose();planet.dispose();debris.dispose();background.dispose();fx.dispose();pool.dispose();renderer.dispose();},{once:true});
