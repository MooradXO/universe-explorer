import * as THREE from 'three';
import type { SystemBody } from '../systems/SystemDescriptor';
import type { FloatingOrigin } from '../space/FloatingOrigin';
import { worldPosition } from '../space/WorldPosition';
import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import { EnvironmentTextures } from './EnvironmentMaterials';

/** One distant artistic debris ribbon. It has no catalogue identity or collision target. */
export class OrbitalPanorama {
  readonly group = new THREE.Group();
  private geometry = new THREE.IcosahedronGeometry(1, 0);
  private textures: EnvironmentTextures;
  private material: THREE.MeshStandardMaterial;
  private mesh: THREE.InstancedMesh;
  private body: SystemBody | null = null;
  private span = 0;
  constructor(low: boolean) {
    this.group.name = 'artistic-orbital-panorama';
    this.textures = new EnvironmentTextures(low);
    this.material = new THREE.MeshStandardMaterial({ map: this.textures.acquire('regolith'), roughness: .95, metalness: .05, flatShading: true, transparent: true, depthWrite: false });
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float panoramaDistance;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        panoramaDistance=length((modelMatrix*instanceMatrix*vec4(position,1.0)).xyz-cameraPosition);`);
      shader.fragmentShader = 'varying float panoramaDistance;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        diffuseColor.a*=smoothstep(1500.,3500.,panoramaDistance)*(1.-smoothstep(45000.,65000.,panoramaDistance));
        if(diffuseColor.a<.01)discard;
        #include <opaque_fragment>`);
    };
    this.material.customProgramCacheKey = () => 'orbital-panorama-v1';
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, low ? 180 : 420);
    this.mesh.frustumCulled = false; this.group.add(this.mesh);
  }
  setBody(body: SystemBody) {
    if (this.body?.id === body.id) return;
    this.body = body;
    const random = createSeededRandom(hashString(`${body.id}:panorama:v1`));
    const object = new THREE.Object3D(), tint = new THREE.Color(body.environment.backdrop.cool), color = new THREE.Color();
    this.span = 14000 + body.radius * 1.2;
    const lean = body.id === 'sol/earth' ? .19 : (random() - .5) * .55;
    for (let i = 0; i < this.mesh.count; i++) {
      const t = i / (this.mesh.count - 1), u = (t - .5) * 2;
      const clump = .3 + .7 * Math.abs(Math.sin(t * 17 + body.environment.variant));
      const x = u * this.span + (random() - .5) * 800;
      const y = -body.radius * .55 - 1100 + x * lean + Math.sin(u * 2.6) * 1000 + (random() - .5) * 1200 * clump;
      const z = -body.radius * 1.8 - 5500 + Math.cos(u * 2) * 900 + (random() - .5) * 2400;
      const size = i % 43 === 0 ? 180 + random() * 280 : (14 + random() ** 2 * 115) * clump;
      object.position.set(x, y, z); object.rotation.set(random() * 6, random() * 6, random() * 6);
      object.scale.set(size * (.65 + random() * .8), size * (.55 + random() * .5), size); object.updateMatrix();
      this.mesh.setMatrixAt(i, object.matrix);
      color.setScalar(.3 + random() * .35).lerp(tint, .12); this.mesh.setColorAt(i, color);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true;
  }
  update(origin: FloatingOrigin, focus: THREE.Vector3) {
    if (!this.body) { this.group.visible = false; return; }
    this.group.position.set(...origin.toLocal(worldPosition(undefined, this.body.position)));
    this.group.visible = this.group.position.distanceTo(focus) < 70000;
  }
  snapshot() { return { body: this.body?.id ?? null, instances: this.group.visible ? this.mesh.count : 0, span: this.span * 2, drawCalls: this.group.visible ? 1 : 0, origin: 'artistic-distant-scenery' }; }
  dispose() { this.mesh.dispose(); this.geometry.dispose(); this.material.dispose(); this.textures.dispose(); this.group.removeFromParent(); }
}
