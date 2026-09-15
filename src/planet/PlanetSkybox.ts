import * as THREE from 'three';
import { PlanetSurfaceManifest } from './PlanetSurfaceManifest';

function getSunColor(biome: PlanetSurfaceManifest['biome']): number {
  switch (biome) {
    case 'desert':
      return 0xffbd73;
    case 'oceanic':
      return 0xffefcf;
    case 'ice':
      return 0xdff5ff;
    case 'volcanic':
      return 0xff6a35;
    case 'gas':
      return 0xffb86b;
    default:
      return 0xffe4b8;
  }
}

export class PlanetSkybox {
  public readonly group = new THREE.Group();
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly skyGeometry: THREE.SphereGeometry;
  private readonly skyMesh: THREE.Mesh;

  constructor(manifest: PlanetSurfaceManifest) {
    const nadirColor = new THREE.Color(manifest.skyProfile.fogColor)
      .lerp(new THREE.Color(manifest.levelDesign.palette.low), 0.45)
      .multiplyScalar(0.42);

    this.skyGeometry = new THREE.SphereGeometry(52000, 32, 16);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(manifest.skyProfile.zenithColor) },
        uHorizon: { value: new THREE.Color(manifest.skyProfile.horizonColor) },
        uNadir: { value: nadirColor },
        uHaze: { value: new THREE.Color(manifest.skyProfile.fogColor) },
        uHazeStrength: { value: manifest.levelDesign.weatherSet.hazeStrength },
        uSunColor: { value: new THREE.Color(getSunColor(manifest.biome)) },
        uSunDirection: { value: new THREE.Vector3(0.37, 0.58, -0.72).normalize() },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uNadir;
        uniform vec3 uHaze;
        uniform float uHazeStrength;
        uniform vec3 uSunColor;
        uniform vec3 uSunDirection;
        varying vec3 vWorldDir;

        void main() {
          vec3 direction = normalize(vWorldDir);
          float elevation = clamp(direction.y, -1.0, 1.0);
          float skyMix = smoothstep(0.0, 0.78, max(elevation, 0.0));
          float groundMix = smoothstep(0.0, 0.72, max(-elevation, 0.0));
          vec3 color = mix(uHorizon, uZenith, skyMix);
          color = mix(color, uNadir, groundMix * 0.82);

          float horizonBand = exp(-abs(elevation) * 18.0);
          color = mix(color, uHaze, clamp(horizonBand * uHazeStrength, 0.0, 0.72));

          float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);
          float sunDisc = pow(sunDot, 640.0);
          float sunHalo = pow(sunDot, 18.0) * 0.32;
          color += uSunColor * (sunDisc * 1.7 + sunHalo);

          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          color += (dither - 0.5) / 255.0;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);
  }

  public update(cameraPosition: THREE.Vector3) {
    this.skyMesh.position.copy(cameraPosition);
  }

  public dispose() {
    this.group.remove(this.skyMesh);
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
  }
}
