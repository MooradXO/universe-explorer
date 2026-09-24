import { Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera, type Camera, type Quaternion } from 'three';
import { WarpTimeline } from './WarpTimeline';

/** Own procedural tunnel: one draw, no asset fetch, no world/ship rotation. */
export class WarpTransition {
  readonly group = new Group();
  readonly timeline = new WarpTimeline();
  private material: ShaderMaterial;
  private mesh: Mesh;
  private aim = new Vector3();
  private forward = new Vector3();
  private clock = 0;
  private streaks: number;
  constructor(low: boolean) {
    this.streaks = low ? 140 : 320;
    this.material = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
      uniforms: { clock: { value: 0 }, amount: { value: 0 }, field: { value: 0 }, radius: { value: .05 }, aperture: { value: 0 },
        aspect: { value: 1 }, center: { value: new Vector2() }, lanes: { value: this.streaks } },
      vertexShader: `varying vec2 uvScreen; void main(){ uvScreen=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 uvScreen;
        uniform float clock,amount,field,radius,aperture,aspect,lanes;
        uniform vec2 center;
        float hash(float n){return fract(sin(n*127.1)*43758.5453);}
        void main(){
          vec2 p=(uvScreen-center)*vec2(aspect,1.);
          float r=length(p), a=atan(p.y,p.x), depth=.65/(r+.06);
          float cloud=.5+.25*sin(a*3.+depth*.9-clock*1.1)+.18*sin(a*7.-depth*1.4+clock*.7);
          float filaments=pow(max(0.,sin(a*11.+sin(depth*.5-clock)*1.6)),7.);
          vec3 wall=mix(vec3(.012,.025,.095),vec3(.16,.05,.36),cloud);
          wall+=vec3(.10,.22,.36)*pow(max(0.,cloud),4.)+vec3(.055,.065,.18)*filaments;
          wall*=smoothstep(.025,.25,r);
          float lane=(a+3.14159265)/6.2831853*lanes;
          float ray=pow(max(0.,sin(fract(lane)*3.14159265)),22.);
          float packet=fract(depth+clock*(.35+field*1.9)+hash(floor(lane))*8.);
          float tail=smoothstep(.65,.92,packet)*(1.-smoothstep(.97,1.,packet));
          float sparks=ray*tail*smoothstep(.09,.35,r)*(1.1+field);
          float ring=exp(-pow((r-radius)/(.012+radius*.045),2.));
          float halo=exp(-pow((r-radius)/(.07+radius*.15),2.));
          vec3 color=wall+vec3(.29,.49,.74)*sparks+vec3(.35,.72,1.)*(ring*.8+halo*.18)*(1.-field);
          float edge=field*.97+(ring*.7+halo*.22)*(1.-field);
          float opening=aperture>0. ? smoothstep(aperture-.15,aperture+.1,r) : 1.;
          float alpha=clamp(edge*amount*opening,0.,.985);
          gl_FragColor=vec4(color,alpha);
        }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 40;
    this.group.name = 'procedural-warp-transition'; this.group.add(this.mesh); this.group.visible = false;
  }
  update(dt: number, camera: Camera, position: Vector3, rotation: Quaternion, confirmed: boolean) {
    this.timeline.update(dt, confirmed); this.group.visible = this.timeline.phase !== 'idle';
    if (!this.group.visible) return;
    this.clock += dt;
    const view = camera as PerspectiveCamera;
    camera.updateMatrixWorld(true);
    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.mesh.position.copy(camera.position).addScaledVector(this.forward, 900); this.mesh.quaternion.copy(camera.quaternion);
    const height = Math.tan(view.fov * Math.PI / 360) * 900;
    this.mesh.scale.set(height * view.aspect, height, 1);
    this.aim.set(0, 0, -5000).applyQuaternion(rotation).add(position).project(camera);
    const u = this.material.uniforms;
    u.center.value.set(this.aim.x, this.aim.y); u.aspect.value = view.aspect;
    u.clock.value = this.clock; u.amount.value = this.timeline.intensity; u.field.value = this.timeline.field;
    u.radius.value = this.timeline.portalRadius; u.aperture.value = this.timeline.aperture;
  }
  arrive() { this.timeline.arrive(); }
  clear() { this.timeline.clear(); this.group.visible = false; }
  snapshot() { return { preset: 'original-procedural-transit', requested: this.timeline.requested, ready: true, failed: false,
    phase: this.timeline.phase, elapsed: this.timeline.elapsed, intensity: this.timeline.intensity,
    particles: 0, streaks: this.group.visible ? this.streaks : 0, drawCalls: this.group.visible ? 1 : 0, visible: this.group.visible }; }
  dispose() { this.clear(); this.mesh.geometry.dispose(); this.material.dispose(); this.group.removeFromParent(); }
}
