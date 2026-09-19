import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DIRECTIONS, type Direction, type Quality } from './directions';
import { SUN_DIRECTION, planetMaterial, rimMaterial, nebulaMaterial, starMaterial, glowTexture } from '../../world/visuals/SpaceMaterials';
import { EffectsPreview } from './EffectsPreview';
import { PLAYER_SHIP_VISUAL } from '../../world/ShipVisualConfig';

function seededRandom(seed:number) {
  return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n^=n+Math.imul(n^n>>>7,61|n);return ((n^n>>>14)>>>0)/4294967296;};
}
export class PreviewScene {
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(40,1,.05,600);
  readonly effects:EffectsPreview;
  private controls:OrbitControls;
  private surface=planetMaterial(DIRECTIONS[1]);
  private rim=rimMaterial(DIRECTIONS[1]);
  private nebula=nebulaMaterial(DIRECTIONS[1]);
  private starSurface=starMaterial();
  private starGlow:THREE.SpriteMaterial;
  private asteroids:THREE.InstancedMesh;
  private stars:THREE.Points;
  private fill=new THREE.AmbientLight('#bfd6e5',.5);
  private planet=new THREE.Group();
  private ship?:THREE.Group;
  private raf=0;
  private lastTime=0;
  private elapsed=0;
  private disposed=false;
  private paused=false;
  private direction= DIRECTIONS[1];
  private quality:Quality;
  private resizeObserver:ResizeObserver;
  private frames=0;
  private fpsStart=performance.now();
  private fps=0;
  private shipStatus='loading';
  constructor(private container:HTMLElement,quality:Quality,report:(text:string)=>void) {
    this.quality=quality;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor('#03060b');this.container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','Трёхмерная сцена сравнения: игровая планета, астероиды и корабль');
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.enablePan=false;
    this.controls.minDistance=9;this.controls.maxDistance=27;
    this.controls.minPolarAngle=.45;this.controls.maxPolarAngle=2.35;
    this.controls.minAzimuthAngle=-.7;this.controls.maxAzimuthAngle=.7;
    this.resetCamera();
    this.effects=new EffectsPreview(this.scene,quality,report);
    this.scene.add(this.fill);
    const key=new THREE.DirectionalLight('#ffe5c1',2.8);key.position.copy(SUN_DIRECTION).multiplyScalar(20);this.scene.add(key);
    const edge=new THREE.DirectionalLight('#497591',.65);edge.position.set(8,-1,-4);this.scene.add(edge);
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(300,24,16),this.nebula));
    this.planet.position.set(3.5,1.3,-5);this.planet.rotation.z=-.16;
    this.planet.add(new THREE.Mesh(new THREE.SphereGeometry(3.65,96,64),this.surface));
    this.planet.add(new THREE.Mesh(new THREE.SphereGeometry(3.72,64,48),this.rim));this.scene.add(this.planet);
    const moon=new THREE.Mesh(new THREE.IcosahedronGeometry(.6,4),new THREE.MeshStandardMaterial({color:'#70695f',roughness:1}));
    moon.position.set(7,3.5,-12);this.scene.add(moon);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(.8,40,24),this.starSurface);sun.position.set(-11,7,-26);this.scene.add(sun);
    this.starGlow=new THREE.SpriteMaterial({map:glowTexture(),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
    const corona=new THREE.Sprite(this.starGlow);corona.position.copy(sun.position);corona.scale.setScalar(11);this.scene.add(corona);
    this.stars=this.makeStars();this.scene.add(this.stars);
    this.asteroids=this.makeAsteroids();this.scene.add(this.asteroids);
    void this.loadShip();
    this.setDirection(DIRECTIONS[1]);this.setQuality(quality);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.resize();this.raf=requestAnimationFrame(this.tick);
  }
  private makeStars() {
    const random=seededRandom(1739),positions=[],colors=[],sizes=[];
    const palettes=['#bbcbd5','#9aafc9','#e4c5a1','#efdac1'].map(c=>new THREE.Color(c));
    for(let i=0;i<2600;i++){
      const z=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-z*z);
      positions.push(Math.cos(angle)*r*250,z*250,Math.sin(angle)*r*250);
      const color=palettes[Math.floor(random()*palettes.length)].clone().multiplyScalar(.3+random()*.8);
      colors.push(color.r,color.g,color.b);sizes.push(random()<.02?2.5:random()*.9+.65);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
    return new THREE.Points(geometry,new THREE.ShaderMaterial({
      vertexColors:true,transparent:true,depthWrite:false,uniforms:{pixelRatio:{value:1}},
      vertexShader:`attribute float size; varying vec3 tint; uniform float pixelRatio;
        void main(){tint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelRatio+1.;}`,
      fragmentShader:`varying vec3 tint;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
        gl_FragColor=vec4(tint,pow(1.-d,1.5));
        #include <colorspace_fragment>
      }`,
    }));
  }
  private makeAsteroids() {
    const random=seededRandom(9526),geometry=new THREE.IcosahedronGeometry(1,1);
    const positions=geometry.getAttribute('position');
    // Identical positions share the same deformation, so triangle seams remain closed.
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      const s=.86+.17*Math.sin(x*13+y*7+z*19);positions.setXYZ(i,x*s,y*s,z*s);
    }
    geometry.computeVertexNormals();
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({roughness:1,flatShading:true}),230);
    const object=new THREE.Object3D(),color=new THREE.Color();
    for(let i=0;i<230;i++){
      const x=(random()-.5)*25,y=-2.7+x*.1+(random()-.5)*2.3,z=-1.5+(random()-.5)*11;
      object.position.set(x,y,z);object.rotation.set(random()*6,random()*6,random()*6);
      const s=.08+Math.pow(random(),3)*.7;object.scale.set(s,s*(.65+random()*.5),s*(.8+random()*.5));object.updateMatrix();mesh.setMatrixAt(i,object.matrix);
      color.setHSL(.075+random()*.03,.07+random()*.16,.12+random()*.16);mesh.setColorAt(i,color);
    }
    mesh.instanceMatrix.needsUpdate=true;return mesh;
  }
  private async loadShip() {
    try {
      const gltf=await new GLTFLoader().loadAsync(PLAYER_SHIP_VISUAL.modelPath);
      if(this.disposed){disposeObject(gltf.scene);return;}
      const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      const normalized=new THREE.Group();normalized.add(gltf.scene);normalized.scale.setScalar(2.7/Math.max(size.x,size.y,size.z));
      this.ship=new THREE.Group();this.ship.add(normalized);this.ship.position.set(-.9,-2.2,5);
      this.ship.rotation.set(.12,.6,-.1);this.scene.add(this.ship);this.shipStatus='ready';
    }catch{this.shipStatus='unavailable';}
  }
  setDirection(direction:Direction) {
    this.direction=direction;this.surface.uniforms.ocean.value.set(direction.ocean);
    this.surface.uniforms.land.value.set(direction.land);this.surface.uniforms.coast.value.set(direction.coast);
    this.surface.uniforms.fill.value=direction.fill;this.rim.uniforms.tint.value.set(direction.rim);
    this.rim.uniforms.strength.value=direction.glow;this.nebula.uniforms.warm.value.set(direction.dust);
    this.nebula.uniforms.cool.value.set(direction.gas);this.nebula.uniforms.strength.value=direction.nebula;
    this.starGlow.opacity=Math.min(1,direction.glow*.7);this.fill.intensity=direction.fill*4;
    this.renderer.toneMappingExposure=direction.exposure;
  }
  setQuality(quality:Quality){this.quality=quality;this.asteroids.count=quality==='HIGH'?230:100;
    this.stars.geometry.setDrawRange(0,quality==='HIGH'?2600:1200);this.effects.setQuality(quality);this.resize();}
  setPaused(paused:boolean){this.paused=paused;}
  resetCamera(){this.camera.position.set(0,1,16.5);this.controls.target.set(0,0,-3);this.controls.update();}
  private resize(){
    const width=Math.max(1,this.container.clientWidth),height=Math.max(1,this.container.clientHeight);
    this.renderer.setPixelRatio(this.quality==='HIGH'?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,1));
    this.renderer.setSize(width,height);this.camera.aspect=width/height;
    this.camera.fov=this.camera.aspect<1.2?56:40;this.camera.updateProjectionMatrix();
    (this.stars.material as THREE.ShaderMaterial).uniforms.pixelRatio.value=this.renderer.getPixelRatio();
  }
  private tick=(now:number)=>{
    if(this.disposed)return;
    const dt=Math.min(.05,(now-(this.lastTime||now))/1000);this.lastTime=now;
    if(!document.hidden){
      const step=this.paused?0:dt;this.elapsed+=step;this.controls.update();
      this.planet.rotation.y=this.elapsed*.012;this.surface.uniforms.time.value=this.elapsed;this.starSurface.uniforms.time.value=this.elapsed;
      if(this.ship)this.ship.position.y=-2.2+Math.sin(this.elapsed*.5)*.035;
      this.effects.update(step,this.camera);this.renderer.render(this.scene,this.camera);
      ++this.frames;if(now-this.fpsStart>1500){this.fps=Math.round(this.frames*1000/(now-this.fpsStart));this.frames=0;this.fpsStart=now;}
    }
    this.raf=requestAnimationFrame(this.tick);
  };
  snapshot(){return {direction:this.direction.id,quality:this.quality,paused:this.paused,ship:this.shipStatus,
    fps:this.fps,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,
    geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,effect:this.effects.snapshot()};}
  dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.resizeObserver.disconnect();this.controls.dispose();this.effects.dispose();
    disposeObject(this.scene);this.renderer.dispose();this.renderer.domElement.remove();}
}
function disposeObject(root:THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(object=>{
    const mesh=object as THREE.Mesh;
    if(mesh.geometry)geometries.add(mesh.geometry);
    if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
    }
  });
  textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}
