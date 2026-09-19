import * as THREE from 'three';
import type { PlanetDescriptor } from './PlanetDescriptor';
import { createSpaceCloudTexture, createSpacePlanetTexture } from './PlanetTextures';
import { createPlanetRimMaterial } from './PlanetRimMaterial';

export class PlanetGeometryPool {
  readonly sphere = new THREE.SphereGeometry(1, 24, 24);
  readonly moon = new THREE.SphereGeometry(1, 8, 8);
  readonly ring = new THREE.RingGeometry(1.5, 2.4, 48);
  readonly moonMaterial = new THREE.MeshStandardMaterial({
    color: 0xaabbcc, emissive: 0x556677, emissiveIntensity: 0.4, roughness: 0.6,
  });
  dispose() { this.sphere.dispose(); this.moon.dispose(); this.ring.dispose(); this.moonMaterial.dispose(); }
}

/** One local planet; geometry is shared, all owned maps/materials are disposed on eviction. */
export class PlanetVisual {
  readonly group = new THREE.Group();
  readonly sphere: THREE.Mesh;
  readonly clouds: THREE.Mesh;
  readonly moons: THREE.Mesh[] = [];
  private readonly materials = new Set<THREE.Material>();
  private readonly textures: THREE.Texture[];

  constructor(readonly descriptor: PlanetDescriptor, pool: PlanetGeometryPool) {
    const { planetId, name, className, radius, biome, visual } = descriptor;
    this.group.name = planetId;
    const surface = createSpacePlanetTexture(descriptor, visual.surfaceTint);
    const cloud = createSpaceCloudTexture(descriptor);
    this.textures = [surface, cloud];
    const oceanLike = biome === 'forest' || biome === 'oceanic';
    const emissive = biome === 'volcanic';
    const material = new THREE.MeshStandardMaterial({
      map: surface, roughness: oceanLike ? 0.35 : 0.85, metalness: oceanLike ? 0.18 : 0.08,
      emissive: new THREE.Color(emissive ? visual.surfaceTint : 0),
      emissiveMap: emissive ? surface : null, emissiveIntensity: emissive ? 0.75 : 0,
    });
    this.sphere = new THREE.Mesh(pool.sphere, material);
    this.sphere.scale.setScalar(radius);
    this.sphere.userData = { name, type: className, constellation: 'Deep Space', isStar: true, isPlanet: true, planetId, radius };
    const rimMaterial = createPlanetRimMaterial(visual.rimColor);
    const rim = new THREE.Mesh(pool.sphere, rimMaterial);
    rim.scale.setScalar(radius * (biome === 'gas' ? 1.16 : 1.08));
    const cloudMaterial = new THREE.MeshBasicMaterial({
      map: cloud, transparent: true, opacity: biome === 'gas' ? 0.58 : 0.72, depthWrite: false,
    });
    this.clouds = new THREE.Mesh(pool.sphere, cloudMaterial);
    this.clouds.scale.setScalar(radius * (biome === 'gas' ? 1.03 : 1.012));
    this.clouds.rotation.set(...descriptor.cloudRotation);
    this.group.add(this.sphere, rim, this.clouds);
    this.materials.add(material).add(rimMaterial).add(cloudMaterial);
    if (descriptor.ring) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: descriptor.ring.color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
      });
      ringMaterial.forceSinglePass = true;
      this.materials.add(ringMaterial);
      const ring = new THREE.Mesh(pool.ring, ringMaterial);
      ring.scale.setScalar(radius);
      ring.rotation.set(...descriptor.ring.rotation);
      this.group.add(ring);
    }
    for (const moon of descriptor.moons) {
      const mesh = new THREE.Mesh(pool.moon, pool.moonMaterial);
      mesh.scale.setScalar(moon.radius);
      mesh.userData = { isAsteroid: true, radius: moon.radius };
      this.group.add(mesh);
      this.moons.push(mesh);
    }
    this.update(0);
  }

  update(elapsed: number) {
    this.clouds.rotation.y = elapsed * this.descriptor.visual.cloudSpeed;
    this.descriptor.moons.forEach((moon, index) => {
      const angle = elapsed * moon.speed + moon.phase;
      this.moons[index].position.set(Math.cos(angle) * moon.orbitRadius,
        Math.sin(angle * 0.3) * moon.orbitRadius * 0.2, Math.sin(angle) * moon.orbitRadius);
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.group.clear();
  }
}
