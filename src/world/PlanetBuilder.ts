import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { createPlanetSurfaceManifest, createSeededRandom, hashString, PlanetSurfaceManifest } from '../planet/PlanetSurfaceManifest';
import { createSpaceCloudTexture, createSpacePlanetTexture } from '../planet/SpacePlanetSurface';

export interface OrbitObject {
  mesh: THREE.Object3D;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  offset: number;
}

export interface SpacePlanet {
  mesh: THREE.Mesh;
  planetId: string;
  name: string;
  type: string;
  position: THREE.Vector3;
  radius: number;
  manifest: PlanetSurfaceManifest;
}

export class PlanetBuilder {
  private readonly engine: Engine;
  public readonly worldSeed = hashString(`universe-explorer:space-planets:${Date.now()}:${Math.random()}`);
  public orbitObjects: OrbitObject[] = [];
  public cloudMeshes: { mesh: THREE.Mesh; speed: number }[] = [];
  public spacePlanets: SpacePlanet[] = [];
  private readonly planetDetails: {
    center: THREE.Vector3;
    atmosphere: THREE.Mesh;
    clouds: THREE.Mesh;
    ring: THREE.Mesh | null;
  }[] = [];

  constructor(engine: Engine, starGlow: THREE.Texture) {
    this.engine = engine;
    void starGlow;
  }

  private createAtmosphereMaterial(colorHex: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float cosTheta = abs(dot(normal, viewDir));
          float intensity = pow(1.0 - cosTheta, 2.8);
          vec3 lightDir = vec3(0.57735, 0.57735, 0.57735);
          float dotNL = dot(normal, lightDir);
          float lightTerminator = smoothstep(-0.3, 0.4, dotNL);
          vec3 sunsetColor = vec3(1.0, 0.45, 0.08);
          float sunsetBlend = smoothstep(0.35, 0.0, abs(dotNL - 0.05));
          vec3 finalColor = mix(uColor, sunsetColor, sunsetBlend * 0.72);
          gl_FragColor = vec4(finalColor, intensity * lightTerminator * 0.85);
        }
      `,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }

  public buildPlanetsWithSatellites(starMeshes: THREE.Mesh[], worldSize: number) {
    const planetClasses = [
      { b: 0x886644, r: 0xccaa77, n: 'Saturn-Class' },
      { b: 0x5566cc, r: 0x8899dd, n: 'Neptune-Class' },
      { b: 0xcc6633, r: 0, n: 'Mars-Class' },
      { b: 0xaa8855, r: 0xddcc99, n: 'Brown Dwarf' },
      { b: 0x447766, r: 0, n: 'Rocky World' },
      { b: 0xcc8844, r: 0xeecc88, n: 'Jupiter-Class' },
      { b: 0x334466, r: 0, n: 'Ice Giant' },
      { b: 0x996655, r: 0xbb9977, n: 'Dusty Titan' },
      { b: 0x668844, r: 0, n: 'Terrestrial' },
      { b: 0xbb7733, r: 0xddaa66, n: 'Gas Colossus' },
    ];

    const rng = createSeededRandom(this.worldSeed);
    const classOrder = planetClasses.map((_, index) => index);
    for (let i = classOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [classOrder[i], classOrder[j]] = [classOrder[j], classOrder[i]];
    }
    const planetGeometry = new THREE.SphereGeometry(1, 24, 24);
    const satGeometry = new THREE.SphereGeometry(1, 8, 8);
    const ringGeometry = new THREE.RingGeometry(1.5, 2.4, 48);
    const ringMaterials = new Map<number, THREE.MeshBasicMaterial>();
    const satMaterial = new THREE.MeshStandardMaterial({
      color: 0xaabbcc,
      emissive: 0x556677,
      emissiveIntensity: 0.4,
      roughness: 0.6,
    });

    for (let i = 0; i < 80; i++) {
      const classIndex = i < classOrder.length
        ? classOrder[i]
        : Math.floor(rng() * planetClasses.length);
      const planetClass = planetClasses[classIndex];
      const planetId = `planet-${i + 1}`;
      const name = `${planetClass.n}-${i + 1}`;
      const radius = 50 + rng() * 200;
      const pos = new THREE.Vector3(
        (rng() - 0.5) * worldSize * 0.75,
        (rng() - 0.5) * worldSize * 0.75,
        (rng() - 0.5) * worldSize * 0.75,
      );
      const planetSeed = hashString(`${planetId}:${planetClass.n}:${this.worldSeed}:${Math.floor(rng() * 0xffffffff)}`);
      const manifest = createPlanetSurfaceManifest(planetId, planetSeed, classIndex, planetClass.n, radius);
      const surfaceTexture = createSpacePlanetTexture(manifest, manifest.surfaceTint);

      const isLavaOrBrownDwarf = classIndex === 3 || classIndex === 4;
      const isEarthLike = classIndex === 8 || manifest.biome === 'oceanic';
      const mat = new THREE.MeshStandardMaterial({
        map: surfaceTexture,
        roughness: isEarthLike ? 0.35 : 0.85,
        metalness: isEarthLike ? 0.18 : 0.08,
        emissive: isLavaOrBrownDwarf ? new THREE.Color(manifest.surfaceTint) : new THREE.Color(0x000000),
        emissiveMap: isLavaOrBrownDwarf ? surfaceTexture : null,
        emissiveIntensity: isLavaOrBrownDwarf ? 0.75 : 0.0,
      });

      const planet = new THREE.Mesh(planetGeometry, mat);
      planet.position.copy(pos);
      planet.scale.setScalar(radius);
      planet.userData = {
        name,
        type: planetClass.n,
        constellation: 'Deep Space',
        isStar: true,
        isPlanet: true,
        planetId,
        surfaceManifest: manifest,
        radius,
      };

      this.engine.scene.add(planet);
      starMeshes.push(planet);
      this.spacePlanets.push({
        mesh: planet,
        planetId,
        name,
        type: planetClass.n,
        position: pos.clone(),
        radius,
        manifest,
      });

      const atmosMat = this.createAtmosphereMaterial(manifest.skyProfile.horizonColor);
      const atmosMesh = new THREE.Mesh(planetGeometry, atmosMat);
      atmosMesh.position.copy(pos);
      atmosMesh.scale.setScalar(radius * (manifest.biome === 'gas' ? 1.16 : 1.08));
      this.engine.scene.add(atmosMesh);

      const cloudsMat = new THREE.MeshBasicMaterial({
        map: createSpaceCloudTexture(manifest),
        transparent: true,
        opacity: manifest.biome === 'gas' ? 0.58 : 0.72,
        depthWrite: false,
      });
      const cloudsMesh = new THREE.Mesh(planetGeometry, cloudsMat);
      cloudsMesh.position.copy(pos);
      cloudsMesh.scale.setScalar(radius * (manifest.biome === 'gas' ? 1.03 : 1.012));
      cloudsMesh.rotation.x = rng() * Math.PI;
      cloudsMesh.rotation.z = rng() * Math.PI;
      this.engine.scene.add(cloudsMesh);
      this.cloudMeshes.push({
        mesh: cloudsMesh,
        speed: 0.01 + manifest.weatherProfile.windSpeed * 0.012,
      });

      let ring: THREE.Mesh | null = null;
      if (planetClass.r) {
        let ringMaterial = ringMaterials.get(planetClass.r);
        if (!ringMaterial) {
          ringMaterial = new THREE.MeshBasicMaterial({
            color: planetClass.r,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          ringMaterial.forceSinglePass = true;
          ringMaterials.set(planetClass.r, ringMaterial);
        }
        ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(pos);
        ring.scale.setScalar(radius);
        ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.6;
        ring.rotation.z = (rng() - 0.5) * 0.4;
        this.engine.scene.add(ring);
      }

      this.planetDetails.push({
        center: pos,
        atmosphere: atmosMesh,
        clouds: cloudsMesh,
        ring,
      });

      const satCount = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < satCount; s++) {
        const satR = 8 + rng() * 12;
        const sat = new THREE.Mesh(satGeometry, satMaterial);
        sat.scale.setScalar(satR);
        sat.userData = { isAsteroid: true, radius: satR };
        this.engine.scene.add(sat);

        this.orbitObjects.push({
          mesh: sat,
          center: pos.clone(),
          radius: radius * (2.5 + s * 1.2 + rng()),
          speed: 0.3 + rng() * 0.8,
          offset: rng() * Math.PI * 2,
        });
      }
    }
  }

  public update(elapsed: number, userShipGroup: THREE.Group | null, drawDistSq: number) {
    if (userShipGroup) {
      const ringDrawDistSq = drawDistSq * 2.25;
      for (const detail of this.planetDetails) {
        const distanceSq = detail.center.distanceToSquared(userShipGroup.position);
        const showSurfaceDetails = distanceSq <= drawDistSq;
        detail.atmosphere.visible = showSurfaceDetails;
        detail.clouds.visible = showSurfaceDetails;
        if (detail.ring) detail.ring.visible = distanceSq <= ringDrawDistSq;
      }

      for (const orbitObject of this.orbitObjects) {
        if (orbitObject.center.distanceToSquared(userShipGroup.position) > drawDistSq) {
          orbitObject.mesh.visible = false;
          continue;
        }
        orbitObject.mesh.visible = true;
        const angle = elapsed * orbitObject.speed + orbitObject.offset;
        orbitObject.mesh.position.set(
          orbitObject.center.x + Math.cos(angle) * orbitObject.radius,
          orbitObject.center.y + Math.sin(angle * 0.3) * orbitObject.radius * 0.2,
          orbitObject.center.z + Math.sin(angle) * orbitObject.radius,
        );
      }
    }

    for (const cloud of this.cloudMeshes) {
      if (cloud.mesh.visible) cloud.mesh.rotation.y = elapsed * cloud.speed;
    }
  }
}
