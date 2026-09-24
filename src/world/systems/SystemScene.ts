import { surfaceRecipe } from '../generation/SurfaceRecipe';
import { physicsFingerprint } from '../generation/SystemPhysics';
import * as THREE from 'three';
import type { Engine } from '../../core/Engine';
import { Settings } from '../../core/Settings';
import { CinematicGeometryPool, CinematicPlanet } from '../visuals/CinematicPlanet';
import { CinematicBackground } from '../visuals/CinematicBackground';
import { OrbitalDebris } from '../visuals/OrbitalDebris';
import { starMaterial, glowTexture } from '../visuals/SpaceMaterials';
import type { FloatingOrigin } from '../space/FloatingOrigin';
import { worldPosition } from '../space/WorldPosition';
import { type SystemBody, type SystemDescriptor } from './SystemDescriptor';
import { CatalogSky } from './CatalogSky';
import { SYSTEM_CONFIG } from './SystemConfig';
import { orbitalZones, type OrbitalZone } from './OrbitalSite';
import { SpaceEnvironmentRenderer } from '../environments/SpaceEnvironmentRenderer';
import { OrbitalPanorama } from '../environments/OrbitalPanorama';

export class SystemScene {
  readonly group = new THREE.Group();
  readonly sky: CatalogSky;
  private pool = new CinematicGeometryPool(Settings.graphicsMode==='LOW');
  private planets = new Map<string, CinematicPlanet>();
  private backdrop:CinematicBackground;
  private zones:{body:SystemBody;zone:OrbitalZone}[]=[];
  private debris=new Map<string,OrbitalDebris>();
  private nearestZone:OrbitalZone|null=null;
  readonly openSpace:SpaceEnvironmentRenderer;
  private panorama = new OrbitalPanorama(Settings.graphicsMode === 'LOW');
  private anomaly: THREE.Vector3 | null = null;
  private anomalyAddress: ReturnType<typeof worldPosition> | null = null;
  private glowTexture=glowTexture();
  private glowMaterial=new THREE.SpriteMaterial({map:this.glowTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  private glow=new THREE.Sprite(this.glowMaterial);
  private starGeometry = new THREE.SphereGeometry(1, 40, 24);
  private starMaterial: THREE.ShaderMaterial;
  private star: THREE.Mesh;
  private proxyGeometry = new THREE.BufferGeometry();
  private proxyMaterial = new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 });
  private proxies = new THREE.Points(this.proxyGeometry, this.proxyMaterial);
  private selectionTime = 1;
  private previousFocus:number[]|null=null;
  private streamMs=0;
  private readonly local = new THREE.Vector3();
  constructor(readonly descriptor: SystemDescriptor, private engine: Engine, private targets: THREE.Mesh[]) {
    this.group.name = 'stellar-system';
    this.group.add(this.panorama.group);
    this.openSpace=new SpaceEnvironmentRenderer(descriptor,Settings.graphicsMode==='LOW',targets);this.group.add(this.openSpace.group);
    this.zones=descriptor.bodies.flatMap(body=>orbitalZones(body).map(zone=>({body,zone})));
    this.starMaterial = starMaterial();this.starMaterial.uniforms.tint.value.setHex(descriptor.starColor);
    this.glowMaterial.color.setHex(descriptor.starColor);this.glowMaterial.opacity=.75;
    this.star = new THREE.Mesh(this.starGeometry, this.starMaterial);
    this.star.userData = { name: descriptor.anchor.title, type: `Звезда ${descriptor.spectrum ?? ''}`, isStar: true, isFixedScale: true,
      radius: descriptor.starRadius, collisionEnabled: false };
    this.targets.push(this.star); this.group.add(this.star, this.glow, this.proxies); this.proxies.frustumCulled = false;
    this.backdrop=new CinematicBackground(descriptor.anchor.catalogId,Settings.graphicsMode==='LOW');this.group.add(this.backdrop.mesh);
    this.sky = new CatalogSky(descriptor.anchor, Settings.graphicsMode === 'LOW');
    this.group.add(this.sky.group); engine.scene.add(this.group);
  }
  update(dt: number, elapsed: number, origin: FloatingOrigin, focus: THREE.Vector3) {
    this.pool.surfaces.pump();
    this.starMaterial.uniforms.time.value = elapsed;
    this.sky.update(this.engine.camera.position);
    this.backdrop.update(this.engine.camera.position,elapsed);
    const absoluteShip = origin.toAbsolute(focus.toArray());
    this.openSpace.update(dt,elapsed,origin,focus);
    const starPosition = origin.toLocal(worldPosition());
    this.local.set(...starPosition).sub(this.engine.camera.position);
    const distance = this.local.length(), projection = Math.min(1, 90000 / Math.max(1, distance));
    this.star.position.copy(this.local).multiplyScalar(projection).add(this.engine.camera.position);
    this.star.scale.setScalar(this.descriptor.starRadius * projection);
    this.glow.position.copy(this.star.position);this.glow.scale.setScalar(this.descriptor.starRadius*projection*9);
    this.star.userData.collisionEnabled = projection === 1;
    this.selectionTime += dt;
    if (this.selectionTime >= 0.2) {
      this.selectionTime = 0;
      const selectionStarted=performance.now();
      const projected=absoluteShip.map((v,i)=>v+(this.previousFocus?Math.max(-20000,Math.min(20000,(v-this.previousFocus[i])*3)):0));
      this.previousFocus=[...absoluteShip];
      const ahead=this.descriptor.bodies.filter(b=>this.distance(b,projected)<SYSTEM_CONFIG.renderDistance*1.25).sort((a,b)=>this.distance(a,projected)-this.distance(b,projected)).slice(0,Settings.graphicsMode==='LOW'?2:4);
      for(const body of ahead)this.pool.surfaces.prefetch(surfaceRecipe(body));
      const wanted = this.descriptor.bodies.filter(body => Math.hypot(...body.position.map((v, i) => v - absoluteShip[i])) < SYSTEM_CONFIG.renderDistance*(this.planets.has(body.id)?1.15:1))
        .sort((a, b) => (this.distance(a, absoluteShip)*(this.planets.has(a.id)?.9:1)) - (this.distance(b, absoluteShip)*(this.planets.has(b.id)?.9:1))).slice(0, Settings.graphicsMode === 'LOW' ? 2 : 4);
      const ids = new Set(wanted.map(body => body.id));
      for (const [id, planet] of this.planets) if (!ids.has(id)) { this.removeTarget(planet.sphere); planet.dispose(); this.planets.delete(id); }
      const next = wanted.find(body => !this.planets.has(body.id));
      if (next) {
        const visual = new CinematicPlanet(next, this.pool, this.descriptor.starColor);
        visual.sphere.userData.isFixedScale = true;
        visual.sphere.userData.type = next.origin === 'procedural' ? 'Игровой процедурный мир' : 'Планета Солнечной системы';
        this.planets.set(next.id, visual); this.group.add(visual.group); this.targets.push(visual.sphere);
      }
      const nearest=this.descriptor.bodies.slice().sort((a,b)=>this.distance(a,absoluteShip)-this.distance(b,absoluteShip))[0];
      if(nearest){this.backdrop.setEnvironment(nearest.environment);this.panorama.setBody(nearest);}
      const nearby=this.zones.map(item=>({...item,distance:Math.hypot(...item.zone.arrival.map((v,i)=>v-absoluteShip[i]))}))
        .filter(item=>item.distance<10000).sort((a,b)=>a.distance-b.distance).slice(0,Settings.graphicsMode==='LOW'?1:2);
      const zoneIds=new Set(nearby.map(item=>item.zone.id));
      for(const [id,visual] of this.debris)if(!zoneIds.has(id)){visual.dispose();this.debris.delete(id);}
      for(const {body,zone} of nearby)if(!this.debris.has(zone.id)&&performance.now()-selectionStarted<3){const visual=new OrbitalDebris(body,Settings.graphicsMode==='LOW',this.targets,zone);this.group.add(visual.group);this.debris.set(zone.id,visual);break;}
      this.nearestZone=nearby[0]?.zone??null;
      this.streamMs=Math.max(this.streamMs,performance.now()-selectionStarted);
    }
    const orbital=[...this.debris.values()][0]?.site??null,deep=this.openSpace.effectZone;
    this.panorama.update(origin, focus);
    const candidates=[orbital,deep].filter((zone):zone is OrbitalZone=>!!zone);
    this.nearestZone=candidates.sort((a,b)=>Math.hypot(...a.anomaly.map((v,i)=>v-absoluteShip[i]))-Math.hypot(...b.anomaly.map((v,i)=>v-absoluteShip[i])))[0]??null;
    this.anomalyAddress=this.nearestZone?worldPosition(undefined,this.nearestZone.anomaly):null;
    if (this.anomalyAddress) {
      this.anomaly ??= new THREE.Vector3();
      this.anomaly.set(...origin.toLocal(this.anomalyAddress));
    } else this.anomaly = null;
    for(const visual of this.debris.values())visual.update(origin,elapsed);
    for (const body of this.descriptor.bodies) {
      const planet = this.planets.get(body.id);
      if (planet) { planet.group.position.set(...origin.toLocal(worldPosition(undefined, body.position))); planet.update(elapsed,this.engine.camera); }
    }
    const positions: number[] = [], colors: number[] = [], color = new THREE.Color();
    for (const body of this.descriptor.bodies) if (!this.planets.has(body.id)) {
      this.local.set(...origin.toLocal(worldPosition(undefined, body.position))).sub(this.engine.camera.position).normalize().multiplyScalar(85000).add(this.engine.camera.position);
      positions.push(...this.local.toArray()); color.setHex(body.visual.visual.surfaceTint); colors.push(color.r, color.g, color.b);
    }
    // At most eight proxies; attributes are reused between frames.
    if (this.proxyGeometry.getAttribute('position')?.count !== positions.length / 3) {
      this.proxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.proxyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    } else {
      const attribute = this.proxyGeometry.getAttribute('position'); (attribute.array as Float32Array).set(positions); attribute.needsUpdate = true;
      const tint = this.proxyGeometry.getAttribute('color'); (tint.array as Float32Array).set(colors); tint.needsUpdate = true;
    }
  }
  private distance(body: SystemBody, position: readonly number[]) { return Math.hypot(...body.position.map((v, i) => v - position[i])); }
  get anomalyPosition() { return this.anomaly; }
  get environmentZone(){return this.nearestZone;}
  visiblePlanetCount(frustum: THREE.Frustum) { return [...this.planets.values()].filter(planet => frustum.intersectsObject(planet.sphere)).length; }
  private removeTarget(mesh: THREE.Mesh) { const index = this.targets.indexOf(mesh); if (index >= 0) this.targets.splice(index, 1); }
  snapshot() { return { id: this.descriptor.anchor.catalogId, title: this.descriptor.anchor.title, spectrum: this.descriptor.spectrum,
    starRadiusIsIllustrative: this.descriptor.starRadiusIsIllustrative, fullPlanets: this.planets.size, sky: this.sky.snapshot(),
    generator:this.descriptor.generator,physics:physicsFingerprint(this.descriptor),generation:{...this.pool.surfaces.snapshot(),maxSelectionMs:this.streamMs},visualStyle:'cinematic',decorativeBackground:true,backdrop:this.backdrop.snapshot(),debris:[...this.debris.values()][0]?.snapshot()??null,
    zones:[...this.debris.values()].map(zone=>zone.snapshot()),
    openSpace:this.openSpace.snapshot(),panorama:this.panorama.snapshot(),
    bodies: this.descriptor.bodies.map(body => ({ id: body.id, name: body.name, origin: body.origin, position: [...body.position], radius: body.radius, semiMajorAu: body.orbit.semiMajorAu,
      environment:body.appearance,model:body.model,surface:this.planets.get(body.id)?.snapshot().surface??null,satellites:this.planets.get(body.id)?.snapshot().satellites??[] })) }; }
  dispose() {
    this.removeTarget(this.star); this.starGeometry.dispose(); this.starMaterial.dispose();
    this.glowTexture.dispose();this.glowMaterial.dispose();this.backdrop.dispose();this.openSpace.dispose();this.panorama.dispose();for(const zone of this.debris.values())zone.dispose();this.debris.clear();
    for (const planet of this.planets.values()) { this.removeTarget(planet.sphere); planet.dispose(); }
    this.planets.clear(); this.pool.dispose(); this.proxyGeometry.dispose(); this.proxyMaterial.dispose(); this.sky.dispose(); this.group.removeFromParent();
  }
}
