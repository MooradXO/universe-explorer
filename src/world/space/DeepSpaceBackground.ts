import * as THREE from 'three';
import { createSeededRandom, hashString, WORLD_SEED } from '../celestial/WorldSeed';

/** Camera-centered spherical layers: no edge, no translation parallax or finite star cube. */
export class DeepSpaceBackground {
  public readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, low: boolean) {
    this.group.name = 'deep-space-background';
    const rng = createSeededRandom(hashString(`${WORLD_SEED}:deep-background:v1`));
    const count = low ? 12_000 : 24_000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const longitude = rng() * Math.PI * 2;
      const y = rng() * 2 - 1;
      const radial = Math.sqrt(1 - y * y);
      positions.set([Math.cos(longitude) * radial * 80_000, y * 80_000, Math.sin(longitude) * radial * 80_000], i * 3);
      color.setHSL(rng() < 0.7 ? 0.58 + rng() * 0.08 : 0.07 + rng() * 0.06, 0.1 + rng() * 0.3, 0.4 + rng() * 0.45);
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = rng() < 0.035 ? 2.2 : 0.65 + rng() * 0.75;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      depthWrite: false, depthTest: true, transparent: true, vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vColor;
        void main() { vColor = color; gl_PointSize = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vColor;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if(d > 1.0) discard;
          gl_FragColor = vec4(vColor, (1.0 - d * d) * 0.85); }`,
    }));
    points.renderOrder = -90;
    points.frustumCulled = false;
    const dust = new THREE.Mesh(new THREE.SphereGeometry(90_000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: `varying vec3 direction;
        void main() { direction = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 direction;
        void main() {
          vec3 d = normalize(direction);
          float band = exp(-pow(dot(d, normalize(vec3(0.25, 0.92, 0.3))) * 5.5, 2.0));
          float detail = sin(d.x * 29.0 + sin(d.z * 17.0)) * sin(d.z * 23.0 + d.y * 12.0);
          float broad = 0.55 + 0.45 * sin(d.x * 5.0 + d.z * 4.0);
          vec3 hue = mix(vec3(0.022, 0.04, 0.075), vec3(0.07, 0.033, 0.08), broad);
          vec3 glow = hue * band * (0.35 + broad * 0.5 + detail * 0.15);
          gl_FragColor = vec4(vec3(0.0015, 0.002, 0.006) + glow, 1.0);
        }`,
    }));
    dust.renderOrder = -100;
    dust.frustumCulled = false;
    this.group.add(dust, points);
    scene.add(this.group);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
      }
    });
    this.group.removeFromParent(); this.group.clear();
  }

  update(cameraPosition: THREE.Vector3) { this.group.position.copy(cameraPosition); }
}
