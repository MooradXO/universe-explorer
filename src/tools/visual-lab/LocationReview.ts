import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSeededRandom } from '../../world/celestial/WorldSeed';
import { starMaterial, glowTexture, planetMaterial, rimMaterial } from '../../world/visuals/SpaceMaterials';

import { CINEMATIC_STYLE } from '../../world/visuals/CinematicStyle';

export const LOCATIONS = [
  { id: 'ice', name: 'Ледяное кольцо', short: 'Лёд',
    description: 'Светлый газовый гигант, несколько широких слоёв льда и крупные расколотые глыбы. Полёт между фрагментами, просветы в кольце и поиск следов в затенённых карманах.' },
  { id: 'yard', name: 'Заброшенная верфь', short: 'Верфь',
    description: 'Разорванные причальные кольца, длинные фермы и остатки корпусов. Тёплые сигнальные огни в холодной тени. Пролёт сквозь доки, поиск источника сигнала и исследование обломков.' },
  { id: 'rift', name: 'Ионный разлом', short: 'Разлом',
    description: 'Пространственные газовые слои, тёмные скальные осколки и электрические дуги вокруг светящегося ядра. Поиск проходов, сканирование аномалии; помехи и опасность ещё предстоит согласовать.' },
] as const;
export type LocationId = typeof LOCATIONS[number]['id'];

/** Separate art proposals with compressed distances; nothing is installed in gameplay. */
export class LocationReview {
  private scene = new THREE.Scene();
  private root = new THREE.Group();
  private camera = new THREE.PerspectiveCamera(48, 1, .1, 700);
  private renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private controls: OrbitControls;
  private resize: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;
  private flight = true;
  private low: boolean;
  private id: LocationId = 'ice';
  private animated: THREE.ShaderMaterial[] = [];
  private fps = 0;
  private frames = 0;
  private interval = 0;
  constructor(private container: HTMLElement, low: boolean) {
    this.low = low; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.container.append(this.renderer.domElement); this.scene.add(this.root);
    this.renderer.domElement.setAttribute('aria-label', 'Пространственный эскиз локации');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.minDistance = 4; this.controls.maxDistance = 100;
    this.controls.addEventListener('start', () => { this.flight = false; this.onFlightChange?.(false); });
    this.resize = new ResizeObserver(() => this.fit()); this.resize.observe(container);
    this.select('ice'); this.fit(); this.raf = requestAnimationFrame(this.tick);
  }
  onFlightChange?: (playing: boolean) => void;
  private fit() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.low ? 1 : 1.5));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.fov = this.camera.aspect < 1 ? 65 : 48; this.camera.updateProjectionMatrix();
  }
  setQuality(low: boolean) { this.low = low; this.select(this.id); this.fit(); }
  setFlight(flight: boolean) { this.flight = flight; this.onFlightChange?.(flight); }
  reset() { this.time = 0; this.camera.position.set(0, 4, 28); this.controls.target.set(0, 0, -14); this.controls.update(); }
  select(id: LocationId) {
    this.clear(); this.id = id; this.reset();
    this.scene.background = new THREE.Color(id === 'ice' ? '#07121e' : id === 'yard' ? '#03080e' : '#070410');
    this.scene.fog = new THREE.FogExp2(id === 'rift' ? '#100b24' : '#06111b', id === 'rift' ? .012 : .002);
    const ambient = new THREE.HemisphereLight(id === 'ice' ? '#adcfe8' : '#527ca1', '#111119', id === 'ice' ? 1.3 : .65);
    const key = new THREE.DirectionalLight(id === 'ice' ? '#ffe2b7' : '#ffc48d', 3.4); key.position.set(-30, 28, -18);
    const fill = new THREE.DirectionalLight('#8ab8d0', .7); fill.position.set(15, 7, 20); this.root.add(ambient, key, fill);
    this.starfield();
    if (id === 'ice') this.ice(); else if (id === 'yard') this.yard(); else this.rift();
    this.setFlight(true);
  }
  private starfield() {
    const random = createSeededRandom(446), vertices: number[] = [];
    for (let i = 0; i < (this.low ? 450 : 1100); i++) {
      const p = new THREE.Vector3(random() - .5, random() - .5, random() - .5).normalize().multiplyScalar(280);
      vertices.push(...p.toArray());
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    this.root.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#a4b6c9', size: .3, transparent: true, opacity: .6 })));
  }
  private planet(position: number[], radius: number, gas: boolean, tint: string) {
    const palette = { ...CINEMATIC_STYLE, land: tint, coast: gas ? '#ddd2b7' : '#7e998e', ocean: '#164564' };
    const material = planetMaterial(palette); material.uniforms.mode.value = gas ? 2 : 0;
    material.uniforms.cloudAmount.value = gas ? 0 : .65;
    material.uniforms.seed.value = gas ? 315 : 126; this.animated.push(material);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(radius, this.low ? 48 : 96, 48), material);
    planet.position.fromArray(position); this.root.add(planet);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 48, 32), rimMaterial(palette));
    rim.position.copy(planet.position); this.root.add(rim); return planet;
  }
  private ice() {
    const planet = this.planet([15, 12, -72], 27, true, '#e4c799'); planet.rotation.z = .28;
    const random = createSeededRandom(795), dummy = new THREE.Object3D();
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) { const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i); const s = .8 + .18 * Math.sin(x * 15 + y * 9 + z * 18); positions.setXYZ(i, x * s, y * s, z * s); } geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: '#bacdd3', roughness: .28, metalness: .12, flatShading: true });
    const field = new THREE.InstancedMesh(geometry, material, this.low ? 460 : 1100);
    for (let i = 0; i < field.count; i++) {
      const lane = i % 3, x = (random() - .5) * 125, z = random() * -145 + 25;
      dummy.position.set(x, -6 + lane * 2.2 + x * .06 + (random() - .5) * 1.1, z);
      const size = .15 + random() ** 4 * 2.3;
      dummy.scale.set(size, size * (.25 + random()), size * 2.4); dummy.rotation.set(random() * 3, random() * 6, random() * 2);
      dummy.updateMatrix(); field.setMatrixAt(i, dummy.matrix);
    }
    this.root.add(field);
    // Long translucent ring sheets connect nearby fragments to the distant giant.
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(35 + i * 5, 38 + i * 5, 160),
        new THREE.MeshBasicMaterial({ color: '#9fb9c4', side: THREE.DoubleSide, transparent: true, opacity: .15 + i * .04, depthWrite: false }));
      ring.position.copy(planet.position); ring.rotation.set(-1.14, .2, .28); this.root.add(ring);
    }
  }
  private yard() {
    this.planet([21, -9, -94], 31, false, '#578bb6');
    const steel = new THREE.MeshStandardMaterial({ color: '#87939d', roughness: .65, metalness: .3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#242c34', roughness: .6, metalness: .8 });
    const glow = new THREE.MeshBasicMaterial({ color: '#ffc076' });
    const box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
    const beams = new THREE.InstancedMesh(box, steel, 100); let index = 0;
    for (let bay = 0; bay < 5; bay++) {
      const z = -bay * 18;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(10, .65, 8, 72, Math.PI * 1.6), steel);
      ring.position.set(-5, 0, z); ring.rotation.set(.1 * bay, -.08 * bay, .15 + bay * .23); this.root.add(ring);
      for (let side = -1; side <= 1; side += 2) {
        const rail = new THREE.Mesh(box, dark); rail.position.set(-5 + side * 10, -4, z - 8); rail.scale.set(2, 3, 16); this.root.add(rail);
        const lamp = new THREE.Mesh(box, glow); lamp.position.set(-5 + side * 9, -2.3, z); lamp.scale.set(.2, .3, 4); this.root.add(lamp);
      }
      for (let j = 0; j < 20; j++) {
        dummy.position.set(-5 + Math.cos(j * .34) * 11, Math.sin(j * .34) * 11, z - 7);
        dummy.scale.set(.18, .18, 13); dummy.rotation.set(0, 0, j); dummy.updateMatrix(); beams.setMatrixAt(index++, dummy.matrix);
      }
    }
    this.root.add(beams);
    const random = createSeededRandom(712);
    for (let i = 0; i < 14; i++) {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.4, 8, 6, 1, true), steel);
      hull.position.set((random() - .5) * 55, (random() - .5) * 27, -random() * 90);
      hull.rotation.set(random() * 3, random() * 3, random() * 3); this.root.add(hull);
    }
  }
  private rift() {
    this.planet([24, -12, -100], 29, false, '#7a526a');
    const rockMaterial = new THREE.MeshStandardMaterial({ color: '#46505f', roughness: .8, metalness: .12, flatShading: true });
    const random = createSeededRandom(851), dummy = new THREE.Object3D();
    const shards = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), rockMaterial, 75);
    for (let i = 0; i < shards.count; i++) {
      const angle = random() * Math.PI * 2, radius = 13 + random() * 14;
      dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * .65, -random() * 90);
      dummy.scale.set(1 + random() * 3, 2 + random() * 7, 1 + random() * 3); dummy.rotation.set(random(), random() * 3, random());
      dummy.updateMatrix(); shards.setMatrixAt(i, dummy.matrix);
    }
    this.root.add(shards);
    const gas = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 p; uniform float time;
        void main(){float veins=sin(p.x*.75+sin(p.y*.8+time*.22)*1.5+sin(p.z*.9));
        float cloud=pow(max(0.,veins),3.);float edge=pow(max(0.,1.-length(p.xy)/22.),1.4);
        gl_FragColor=vec4(mix(vec3(.09,.26,.55),vec3(.6,.22,.68),cloud),cloud*edge*.14);}` });
    this.animated.push(gas);
    for (let i = 0; i < (this.low ? 5 : 9); i++) {
      const layer = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), gas);
      layer.position.set(Math.sin(i) * 5, Math.cos(i) * 4, -i * 9); layer.rotation.set(.25 * Math.sin(i), .4 * Math.cos(i), i * .7); this.root.add(layer);
    }
    const filamentMaterial = new THREE.LineBasicMaterial({ color: '#82dce8', transparent: true, opacity: .65, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 6; i++) {
      const points = [];
      for (let j = 0; j < 55; j++) {
        const t = j / 54, angle = t * 5 + i;
        points.push(new THREE.Vector3(Math.cos(angle) * (9 + Math.sin(j * 2) * .5), Math.sin(angle) * 9, -t * 75));
      }
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), filamentMaterial));
    }
    const coreMaterial = starMaterial(); this.animated.push(coreMaterial);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 24), coreMaterial); core.position.set(-3, 1, -24); this.root.add(core);
    coreMaterial.uniforms.tint.value.set('#82d5ff');
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#579de8', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(core.position); glow.scale.setScalar(18); this.root.add(glow);
  }
  private tick = (now: number) => {
    const dt = Math.min(.05, (now - (this.last || now)) / 1000); this.last = now;
    if (!document.hidden) {
      this.time += dt; for (const material of this.animated) material.uniforms.time.value = this.time;
      if (this.flight) {
        // Closed continuous camera path: real parallax through the proposal, without jumps.
        const phase = this.time * .14;
        this.camera.position.set(Math.sin(phase) * 4, 3 + Math.sin(phase * 2) * 1.2, 14 + Math.cos(phase) * 15);
        this.controls.target.set(-2, 0, this.camera.position.z - 40);
      }
      this.controls.update(); this.renderer.render(this.scene, this.camera);
      this.frames++; this.interval += dt;
      if (this.interval > 1) { this.fps = Math.round(this.frames / this.interval); this.frames = 0; this.interval = 0; }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
  snapshot() { return { location: this.id, quality: this.low ? 'LOW' : 'HIGH', flight: this.flight, fps: this.fps,
    camera: this.camera.position.toArray(), calls: this.renderer.info.render.calls, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures }; }
  private clear() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.root.traverse(object => {
      const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.root.clear(); this.animated = [];
  }
  dispose() { cancelAnimationFrame(this.raf); this.resize.disconnect(); this.controls.dispose(); this.clear(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
