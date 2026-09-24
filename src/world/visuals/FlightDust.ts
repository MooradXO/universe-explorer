import * as THREE from 'three';
import { createSeededRandom } from '../celestial/WorldSeed';

const HALF = 620;
const wrap = (value: number) => ((value + HALF) % (HALF * 2) + HALF * 2) % (HALF * 2) - HALF;

/** Local, illustrative dust, never catalogue stars. World axes stay fixed on camera turns.
 * Translation comes from measured ship displacement, including cruise, not throttle input.
 * Recycling is faded at the volume boundary. No autonomous drift at rest.
 */
export class FlightDust {
  readonly group = new THREE.Group();
  private positions: Float32Array;
  private trails: Float32Array;
  private geometry = new THREE.BufferGeometry();
  private lineGeometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private lineMaterial = new THREE.LineBasicMaterial({ color: '#a5bccb', transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  private previous = new THREE.Vector3();
  private delta = new THREE.Vector3();
  private visualDelta = new THREE.Vector3();
  private ready = false;
  private speed = 0;
  private visibility = 1;
  private resets = 0;
  private shifted = 0;
  readonly count: number;
  constructor(low: boolean) {
    this.count = low ? 420 : 900;
    const random = createSeededRandom(91317);
    this.positions = new Float32Array(this.count * 3);
    this.trails = new Float32Array(this.count * 6);
    const sizes = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      for (let axis = 0; axis < 3; axis++) this.positions[i * 3 + axis] = (random() * 2 - 1) * HALF;
      sizes[i] = 1.1 + random() * 1.4;
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('grain', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { visibility: { value: 1 }, pixelScale: { value: 700 } },
      vertexShader: `attribute float grain; uniform float pixelScale; varying float fade;
        void main(){ vec4 view=modelViewMatrix*vec4(position,1.);
          float edge=max(max(abs(position.x),abs(position.y)),abs(position.z));
          fade=(1.-smoothstep(490.,620.,edge))*smoothstep(12.,65.,length(view.xyz));
          gl_PointSize=clamp(grain*pixelScale/max(1.,-view.z),1.2,5.);
          gl_Position=projectionMatrix*view; }`,
      fragmentShader: `uniform float visibility; varying float fade;
        void main(){float radius=length(gl_PointCoord-.5)*2.;
          float alpha=(1.-smoothstep(.15,1.,radius))*fade*visibility*.68;
          gl_FragColor=vec4(.64,.72,.78,alpha);}`,
    });
    const points = new THREE.Points(this.geometry, this.material); points.frustumCulled = false;
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.trails, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial); lines.frustumCulled = false;
    this.group.name = 'local-flight-dust-illustrative'; this.group.add(points, lines);
  }
  shiftOrigin(delta: THREE.Vector3) { this.previous.sub(delta); this.group.position.sub(delta); this.shifted++; }
  reset(position: THREE.Vector3) {
    this.previous.copy(position); this.group.position.copy(position); this.delta.set(0, 0, 0);
    this.ready = true; this.speed = 0; this.visibility = 0; this.resets++;
  }
  update(dt: number, position: THREE.Vector3, warping: boolean, pixelHeight = 810) {
    if (!this.ready) this.reset(position);
    this.delta.subVectors(position, this.previous); this.previous.copy(position); this.group.position.copy(position);
    this.speed = dt > 0 ? this.delta.length() / dt : 0;
    // Compress the illustrative dust's exposure speed while preserving its real
    // direction. Wrapping million-unit jumps made every frame an unrelated field.
    const visualSpeed = Math.min(this.speed, 2500);
    this.visualDelta.copy(this.delta).multiplyScalar(this.speed > 0 ? visualSpeed / this.speed : 0);
    // At cruise speeds individual grains would alias; fade them out, leaving bounded exposure streaks.
    const target = warping ? 0 : 1 - THREE.MathUtils.smoothstep(this.speed, 2500, 12000);
    this.visibility = THREE.MathUtils.damp(this.visibility, target, 7, dt);
    this.material.uniforms.visibility.value = this.visibility;
    this.material.uniforms.pixelScale.value = pixelHeight * .9;
    this.group.visible = !warping;
    const tail = Math.min(75, this.speed * .018);
    const direction = this.delta.lengthSq() > 0 ? tail / this.delta.length() : 0;
    this.lineMaterial.opacity = warping ? 0 : Math.min(.24, this.speed / 6000);
    for (let i = 0; i < this.count; i++) {
      const index = i * 3, line = i * 6;
      for (let axis = 0; axis < 3; axis++) {
        const value = wrap(this.positions[index + axis] - this.visualDelta.getComponent(axis));
        this.positions[index + axis] = value; this.trails[line + axis] = value;
      }
      const edge = Math.max(Math.abs(this.positions[index]), Math.abs(this.positions[index + 1]), Math.abs(this.positions[index + 2]));
      const fade = 1 - THREE.MathUtils.smoothstep(edge, 490, HALF);
      for (let axis = 0; axis < 3; axis++) this.trails[line + 3 + axis] = this.positions[index + axis] + this.delta.getComponent(axis) * direction * fade;
    }
    this.geometry.getAttribute('position').needsUpdate = true; this.lineGeometry.getAttribute('position').needsUpdate = true;
  }
  snapshot() { return { kind: 'illustrative-local-dust', count: this.count, speed: this.speed,
    displacement: this.delta.toArray(), sample: Array.from(this.positions.slice(0, 12)), center: this.group.position.toArray(),
    visualDisplacement: this.visualDelta.toArray(),
    visible: this.group.visible, opacity: this.visibility, resets: this.resets, originShifts: this.shifted,
    maxOffset: this.positions.reduce((max, value) => Math.max(max, Math.abs(value)), 0) }; }
  dispose() { this.group.removeFromParent(); this.geometry.dispose(); this.material.dispose(); this.lineGeometry.dispose(); this.lineMaterial.dispose(); }
}
