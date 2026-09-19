import * as THREE from 'three';
import { StarMapClient } from '../../catalog/StarMapClient';
import type { StellarAnchor } from '../space/StellarAddress';
import { SYSTEM_CONFIG } from './SystemConfig';

/** A bounded sample of the same AT-HYG coordinates as the map, viewed from this system. */
export class CatalogSky {
  readonly group = new THREE.Group();
  private abort = new AbortController();
  private geometry = new THREE.BufferGeometry();
  private material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, vertexColors: true,
    vertexShader: 'attribute float size; varying vec3 tint; void main(){tint=color;gl_PointSize=size;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 tint; void main(){float r=length(gl_PointCoord*2.0-1.0);if(r>1.0)discard;gl_FragColor=vec4(tint,pow(1.0-r*r,1.4));}',
  });
  private positions: number[] = [];
  private colors: number[] = [];
  private sizes: number[] = [];
  private seen = new Set<number>();
  public status: 'loading' | 'ready' | 'unavailable' = 'loading';
  public bytes = 0;
  constructor(private anchor: StellarAnchor, low: boolean) {
    this.group.name = 'catalogue-sky';
    const points = new THREE.Points(this.geometry, this.material); points.frustumCulled = false; points.renderOrder = -80;
    this.group.add(points); void this.load(low);
  }
  private async load(low: boolean) {
    try {
      const manifest = await StarMapClient.manifest(this.abort.signal);
      const distance = (center: readonly number[]) => Math.hypot(...center.map((value, i) => value - this.anchor.positionParsecs[i]));
      const leaves = manifest.nodes.filter(node => !node.children.length).sort((a, b) => distance(a.center) - distance(b.center)).slice(0, low ? 3 : 6);
      const root = manifest.nodes.find(node => node.key === manifest.root)!;
      const nodes = [...new Map([root, ...leaves].map(node => [node.key, node])).values()];
      const maximum = low ? 12000 : 24000;
      const color = new THREE.Color();
      for (const node of nodes) {
        const tile = await StarMapClient.tile(node.key, manifest.datasetSha256, this.abort.signal);
        if (this.abort.signal.aborted) return;
        this.bytes += node.bytes;
        for (let i = 0; i < tile.ids.length && this.seen.size < maximum; i++) {
          const id = tile.ids[i];
          if (this.seen.has(id) || `athyg:4.0:${id}` === this.anchor.catalogId) continue;
          this.seen.add(id);
          const source = [0, 1, 2].map(axis => node.center[axis] + tile.positions[i * 3 + axis]);
          const relative = source.map((value, axis) => value - this.anchor.positionParsecs[axis]);
          const length = Math.hypot(...relative); if (length < 1e-8) continue;
          this.positions.push(relative[0] / length * 95000, relative[2] / length * 95000, -relative[1] / length * 95000);
          const ci = tile.colorIndices[i];
          // AT-HYG passbands vary. This is a visual palette, not a temperature measurement.
          color.setHex(!Number.isFinite(ci) ? 0xe3eaff : ci > 1.3 ? 0xffa878 : ci > 0.6 ? 0xffdfae : ci < 0 ? 0xabc7ff : 0xe4ebff);
          const apparent = tile.magnitudes[i] + 5 * Math.log10(length / Math.max(1e-5, Math.hypot(...source)));
          const brightness = THREE.MathUtils.clamp(1 - apparent / 17, 0.18, 1);
          this.colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
          this.sizes.push(THREE.MathUtils.clamp(3.6 - apparent * 0.24, 0.65, 5));
        }
      }
      this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
      this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
      this.geometry.setAttribute('size', new THREE.Float32BufferAttribute(this.sizes, 1));
      this.status = 'ready';
      this.positions = []; this.colors = []; this.sizes = [];
    } catch { if (!this.abort.signal.aborted) this.status = 'unavailable'; }
  }
  update(camera: THREE.Vector3) { this.group.position.copy(camera); }
  snapshot() { return { status: this.status, points: this.geometry.getAttribute('position')?.count ?? 0, bytes: this.bytes,
    observerCatalogId: this.anchor.catalogId, localParallax: 'system-anchor', unitsPerParsec: SYSTEM_CONFIG.unitsPerParsec }; }
  dispose() { this.abort.abort(); this.geometry.dispose(); this.material.dispose(); this.group.removeFromParent(); }
}
