import * as THREE from 'three';
import { Engine } from '../core/Engine';

export class BlackHole {
  private engine: Engine;
  
  public group: THREE.Group;
  public eventHorizon!: THREE.Mesh;
  public accretionDisk!: THREE.Mesh;
  public einsteinRing!: THREE.Mesh;
  public lensingHalo!: THREE.Mesh;
  
  private diskTexture!: THREE.Texture;
  private diskMaterial!: THREE.MeshStandardMaterial;
  private lensMaterial!: THREE.ShaderMaterial;
  
  private coreRadius = 400;
  private diskInnerRadius = 550;
  private diskOuterRadius = 1800;

  constructor(engine: Engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    this.engine.scene.add(this.group);
    
    this.initEventHorizon();
    this.initAccretionDisk();
    this.initEinsteinRing();
    this.initLensingHalo();
  }

  // 1. Event Horizon: Absolute black core sphere
  private initEventHorizon() {
    const geo = new THREE.SphereGeometry(this.coreRadius, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: false,
      toneMapped: false
    });
    
    this.eventHorizon = new THREE.Mesh(geo, mat);
    this.eventHorizon.userData = {
      name: "Gargantua Singularity",
      type: "Event Horizon",
      constellation: "Galactic Center",
      isStar: true,
      radius: this.coreRadius
    };
    this.group.add(this.eventHorizon);
  }

  // Generates custom plasma texture with gold, red and purple swirls for accretion disk
  private generatePlasmaTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Dark base
    ctx.fillStyle = '#050208';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw multiple overlapping spiral bands of superheated gas (accretion flow)
    const numBands = 24;
    for (let i = 0; i < numBands; i++) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      
      // Beautiful glowing gradient: deep purple -> bright red-orange -> blazing gold -> transparent
      const shift = i / numBands;
      const alpha = 0.25 + Math.sin(shift * Math.PI) * 0.45;
      
      grad.addColorStop(0, 'rgba(15, 2, 25, 0.0)');
      grad.addColorStop(0.2, `rgba(180, 20, 100, ${alpha * 0.3})`);     // Deep plasma purple
      grad.addColorStop(0.45, `rgba(255, 60, 10, ${alpha * 0.95})`);    // Blazing orange
      grad.addColorStop(0.55, `rgba(255, 215, 0, ${alpha * 1.0})`);     // Superheated gold
      grad.addColorStop(0.65, `rgba(255, 255, 230, ${alpha * 0.8})`);   // White-hot core
      grad.addColorStop(0.85, `rgba(200, 30, 120, ${alpha * 0.25})`);   // Glowing halo edge
      grad.addColorStop(1, 'rgba(5, 0, 10, 0.0)');

      ctx.fillStyle = grad;
      
      // Paint wavy horizontal lines that map perfectly to the Ring polar coordinates
      const cy = (canvas.height / numBands) * i;
      const thickness = 12 + Math.sin(shift * 25.0) * 10;
      
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x <= canvas.width; x += 10) {
        const wave = Math.sin(x * 0.02 + shift * 50.0) * 12 + Math.cos(x * 0.005) * 8;
        ctx.lineTo(x, cy + wave);
      }
      ctx.lineTo(canvas.width, cy + thickness);
      ctx.lineTo(0, cy + thickness);
      ctx.closePath();
      ctx.fill();
    }

    // Add high-frequency turbulence noise (plasma dust)
    for (let p = 0; p < 800; p++) {
      const px = Math.random() * canvas.width;
      const py = Math.random() * canvas.height;
      const size = 1.0 + Math.random() * 2.5;
      const colorIntensity = Math.random();
      
      ctx.fillStyle = colorIntensity > 0.65 ? '#ffffff' : (colorIntensity > 0.3 ? '#ffaa00' : '#8a2be2');
      ctx.fillRect(px, py, size, size);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // 2. Accretion Disk: Flat, highly-emissive rotating ring in XZ plane
  private initAccretionDisk() {
    this.diskTexture = this.generatePlasmaTexture();
    const geo = new THREE.RingGeometry(this.diskInnerRadius, this.diskOuterRadius, 128);
    
    // UV Mapping alignment for polar coordinates ring wrapping
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const angle = Math.atan2(v.y, v.x);
      const dist = v.length();
      const uVal = (angle + Math.PI) / (Math.PI * 2);
      const vVal = (dist - this.diskInnerRadius) / (this.diskOuterRadius - this.diskInnerRadius);
      uv.setXY(i, uVal, vVal);
    }
    uv.needsUpdate = true;

    this.diskMaterial = new THREE.MeshStandardMaterial({
      map: this.diskTexture,
      roughness: 0.9,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffaa00),
      emissiveMap: this.diskTexture,
      emissiveIntensity: 1.8, // Balanced bloom intensity
      depthWrite: false
    });

    this.accretionDisk = new THREE.Mesh(geo, this.diskMaterial);
    // Rotate to lie horizontally on the XZ plane
    this.accretionDisk.rotation.x = -Math.PI / 2;
    this.group.add(this.accretionDisk);
  }

  // 3. Einstein Ring: Vertical warped ring to replicate background lensing bending over/under event horizon
  private initEinsteinRing() {
    // A slightly smaller Ring rotated differently to create the Interstellar lensing appearance
    const geo = new THREE.RingGeometry(this.coreRadius * 1.05, this.diskInnerRadius * 1.15, 96);
    
    // Warp UV coords for polar alignment
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const angle = Math.atan2(v.y, v.x);
      const dist = v.length();
      const uVal = (angle + Math.PI) / (Math.PI * 2);
      const vVal = (dist - this.coreRadius) / (this.diskInnerRadius - this.coreRadius);
      uv.setXY(i, uVal, vVal);
    }
    uv.needsUpdate = true;

    const ringMat = new THREE.MeshStandardMaterial({
      map: this.diskTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xff33aa),
      emissiveMap: this.diskTexture,
      emissiveIntensity: 1.2,
      depthWrite: false
    });

    this.einsteinRing = new THREE.Mesh(geo, ringMat);
    // The vertical ring is positioned directly around the horizon event to mimic light wrapping
    this.einsteinRing.rotation.y = 0;
    this.group.add(this.einsteinRing);
  }

  // 4. Lensing Halo: Sphere with custom GLSL ShaderMaterial to bend light around core
  private initLensingHalo() {
    const geo = new THREE.SphereGeometry(this.diskInnerRadius * 0.98, 32, 32);
    
    // Custom Gravitational Lensing Shader
    // Warps UV grids and creates a beautiful refractive aura of starlight diffraction
    this.lensMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cameraPos: { value: new THREE.Vector3() },
        coreRadius: { value: this.coreRadius },
        haloRadius: { value: this.diskInnerRadius }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        
        uniform float time;
        uniform vec3 cameraPos;
        uniform float coreRadius;
        uniform float haloRadius;
        
        void main() {
          // Normal to view alignment (fresnel factor)
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          
          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
          
          // Generate active plasma diffraction colors (gold, orange, cyan edge)
          vec3 goldColor = vec3(1.0, 0.65, 0.0);
          vec3 purpleColor = vec3(0.6, 0.1, 1.0);
          vec3 neonCyan = vec3(0.0, 0.8, 1.0);
          
          // Dynamic heat shimmer noise
          float shimmer = sin(time * 3.0 + vWorldPosition.x * 0.01) * cos(time * 2.0 + vWorldPosition.y * 0.01) * 0.1;
          
          // Radial distance from core
          float distRatio = fresnel + shimmer;
          
          // Color grading based on gravitational bending gradient
          vec3 finalGlow = mix(purpleColor, goldColor, distRatio);
          finalGlow = mix(finalGlow, neonCyan, pow(fresnel, 5.0) * 0.5);
          
          // Intensely hot light refraction closer to Event Horizon
          float intensity = pow(fresnel, 2.2) * 1.2;
          
          // Fadeout at the outer edge
          float opacity = pow(fresnel, 1.8) * 0.85;
          
          gl_FragColor = vec4(finalGlow * intensity, opacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.lensingHalo = new THREE.Mesh(geo, this.lensMaterial);
    this.group.add(this.lensingHalo);
  }

  // Animates the black hole subsystems
  public update(elapsed: number, dt: number, cameraPosition: THREE.Vector3) {
    // 1. Rotate the Accretion Disk (faster near the core)
    if (this.diskTexture) {
      // Rotate the plasma texture offset
      this.diskTexture.offset.x -= dt * 0.085;
    }
    
    // Slow rotation of the disk mesh itself for secondary turbulence
    this.accretionDisk.rotation.z += dt * 0.015;

    // 2. Einstein Ring rotates at a slightly different speed to simulate relativistic velocity shear
    this.einsteinRing.rotation.z -= dt * 0.035;
    
    // Dynamic billboard look: Orient the Einstein Ring and Lensing Halo to always face the camera
    // This replicates how a spherical gravitational lens warping looks from any perspective!
    this.einsteinRing.lookAt(cameraPosition);
    
    // 3. Update uniforms for GLSL Lensing shader
    if (this.lensMaterial) {
      this.lensMaterial.uniforms.time.value = elapsed;
      this.lensMaterial.uniforms.cameraPos.value.copy(cameraPosition);
    }
  }
}
