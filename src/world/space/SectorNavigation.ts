import * as THREE from 'three';
import type { SectorManifest } from './SectorManifest';
import type { FloatingOrigin } from './FloatingOrigin';
import { worldPosition } from './WorldPosition';

interface SectorPoints { points: THREE.Points; manifest: SectorManifest; mask: THREE.BufferAttribute; }

/** One draw call per interest sector, including small planet impostors. */
export class SectorNavigation {
  public readonly group = new THREE.Group();
  private readonly sectors = new Map<string, SectorPoints>();
  private readonly material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { screenScale: { value: 500 } },
    vertexShader: `
      attribute float radius;
      attribute float enabled;
      attribute float planet;
      uniform float screenScale;
      varying vec3 vColor;
      varying float vPlanet;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vColor = color;
        vPlanet = planet;
        gl_PointSize = enabled * clamp(radius * screenScale / max(1.0, -view.z), 1.2, 40.0);
        gl_Position = projectionMatrix * view;
        if (enabled < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPlanet;
      void main() {
        vec2 xy = gl_PointCoord * 2.0 - 1.0;
        float d = dot(xy, xy);
        if (d > 1.0) discard;
        float shade = mix(1.0, 0.4 + 0.6 * sqrt(1.0 - d), vPlanet);
        float alpha = mix(pow(1.0 - d, 2.0), (1.0 - smoothstep(0.75, 1.0, d)), vPlanet);
        gl_FragColor = vec4(vColor * shade, alpha * 0.9);
      }`,
  });

  constructor(scene: THREE.Scene) { this.group.name = 'sector-navigation'; scene.add(this.group); }

  update(manifests: readonly SectorManifest[], origin: FloatingOrigin, activePlanets: ReadonlySet<string>, screenScale: number): boolean {
    const desired = new Set(manifests.map((manifest) => manifest.key));
    for (const [key, sector] of this.sectors) {
      if (desired.has(key)) continue;
      sector.points.removeFromParent();
      sector.points.geometry.dispose();
      this.sectors.delete(key);
    }
    let built = false;
    for (const manifest of manifests) {
      if (!this.sectors.has(manifest.key) && !built) {
        this.sectors.set(manifest.key, this.build(manifest));
        built = true;
      }
    }
    this.material.uniforms.screenScale.value = screenScale;
    for (const sector of this.sectors.values()) {
      sector.points.position.set(...origin.toLocal(worldPosition(sector.manifest.sector)));
      sector.manifest.planets.forEach((planet, index) => {
        sector.mask.setX(sector.manifest.stars.length + index, activePlanets.has(planet.planetId) ? 0 : 1);
      });
      sector.mask.needsUpdate = true;
    }
    return built;
  }

  private build(manifest: SectorManifest): SectorPoints {
    const count = manifest.stars.length + manifest.planets.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    const planetFlags = new Float32Array(count);
    const enabled = new Float32Array(count).fill(1);
    const color = new THREE.Color();
    const objects = [...manifest.stars, ...manifest.planets];
    objects.forEach((object, i) => {
      positions.set(object.position, i * 3);
      color.setHex('visual' in object ? object.visual.surfaceTint : object.color);
      colors.set([color.r, color.g, color.b], i * 3);
      radii[i] = object.radius * 2;
      planetFlags[i] = 'visual' in object ? 1 : 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('radius', new THREE.BufferAttribute(radii, 1));
    geometry.setAttribute('planet', new THREE.BufferAttribute(planetFlags, 1));
    const mask = new THREE.BufferAttribute(enabled, 1);
    geometry.setAttribute('enabled', mask);
    geometry.computeBoundingSphere();
    const points = new THREE.Points(geometry, this.material);
    this.group.add(points);
    return { points, manifest, mask };
  }

  snapshot() { return { groups: this.sectors.size, points: [...this.sectors.values()].reduce((n, sector) => n + sector.mask.count, 0) }; }
  visiblePlanetCount(frustum: THREE.Frustum, active: ReadonlySet<string>): number {
    const sphere = new THREE.Sphere(); let count = 0;
    for (const sector of this.sectors.values()) for (const planet of sector.manifest.planets) {
      if (active.has(planet.planetId)) continue;
      sphere.center.set(...planet.position).add(sector.points.position);
      sphere.radius = planet.radius;
      if (frustum.intersectsSphere(sphere)) count++;
    }
    return count;
  }
  dispose() {
    for (const sector of this.sectors.values()) sector.points.geometry.dispose();
    this.material.dispose(); this.sectors.clear(); this.group.removeFromParent();
  }
}
