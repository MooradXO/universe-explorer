import * as THREE from 'three';
import gsap from 'gsap';
import { Engine } from '../core/Engine';
import { Settings } from '../core/Settings';
// @ts-ignore
import constellationLinesData from '../data/constellations.lines.json';

const STAR_COLORS = [
  { h: 0.08, s: 0.85, l: 0.65 },
  { h: 0.6,  s: 0.6,  l: 0.7  },
  { h: 0.15, s: 0.25, l: 0.88 },
  { h: 0.0,  s: 0.55, l: 0.6  },
  { h: 0.55, s: 0.45, l: 0.75 },
  { h: 0.12, s: 0.7,  l: 0.68 },
  { h: 0.75, s: 0.35, l: 0.65 },
  { h: 0.0,  s: 0.0,  l: 0.92 },
];

function srand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class CosmosGenerator {
  private engine: Engine;
  public starGlow: THREE.Texture;
  private starMeshes: THREE.Mesh[];
  private worldSize: number;

  public bgPoints: THREE.Points | null = null;
  public nebulaSprites: THREE.Sprite[] = [];

  constructor(
    engine: Engine,
    starGlow: THREE.Texture,
    starMeshes: THREE.Mesh[],
    worldSize: number
  ) {
    this.engine = engine;
    this.starGlow = starGlow;
    this.starMeshes = starMeshes;
    this.worldSize = worldSize;

  }

  public generateAll() {
    this.buildBackgroundStarfield();
    this.buildMilkyWayBand();
    this.buildNebulae();
    this.buildGasClouds();
    this.buildRealConstellations();
    this.buildComets();
    this.buildAsteroidFields();
    this.spawnMerchants();
  }

  public update(dt: number, elapsed: number) {
    // Background drift
    if (this.bgPoints) {
      this.bgPoints.rotation.y += dt * 0.0003;
      this.bgPoints.rotation.x += dt * 0.0001;
      
      if (this.bgPoints.material instanceof THREE.ShaderMaterial) {
        this.bgPoints.material.uniforms.uTime.value = elapsed;
      }
    }

    // Nebulae rotation
    for (const s of this.nebulaSprites) {
      s.material.rotation += dt * 0.0015;
    }
  }

  private buildBackgroundStarfield() {
    const isLow = Settings.graphicsMode === 'LOW';
    const count = isLow ? 20000 : 70000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const R = this.worldSize;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3]     = (Math.random() - 0.5) * R;
      positions[i3 + 1] = (Math.random() - 0.5) * R;
      positions[i3 + 2] = (Math.random() - 0.5) * R;

      const c = new THREE.Color();
      const t = Math.random();
      if (t < 0.3)       c.setHSL(0.15, 0.1 + Math.random() * 0.15, 0.8 + Math.random() * 0.2);
      else if (t < 0.5)  c.setHSL(0.6, 0.15 + Math.random() * 0.2, 0.8 + Math.random() * 0.2);
      else if (t < 0.7)  c.setHSL(0.08, 0.2 + Math.random() * 0.3, 0.75 + Math.random() * 0.25);
      else if (t < 0.85) c.setHSL(0.0, 0.0, 0.85 + Math.random() * 0.15);
      else                c.setHSL(0.55 + Math.random() * 0.2, 0.3, 0.7 + Math.random() * 0.3);
      colors[i3] = c.r; colors[i3+1] = c.g; colors[i3+2] = c.b;
      
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    if (isLow) {
      this.bgPoints = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 25,
        map: this.makeBgDot(),
        alphaTest: 0.01,
        transparent: true,
        vertexColors: true,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
    } else {
      this.bgPoints = new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMap: { value: this.makeBgDot() }
        },
        vertexShader: `
          uniform float uTime;
          attribute float aSeed;
          varying vec3 vColor;
          varying float vTwinkle;

          void main() {
            vColor = color;
            float speed = 0.5 + aSeed * 2.0;
            vTwinkle = 0.45 + 0.55 * sin(uTime * speed + aSeed * 40.0);
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 25.0 * (300.0 / -mvPosition.z) * (0.8 + 0.2 * sin(uTime * (1.2 + speed) + aSeed));
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          varying vec3 vColor;
          varying float vTwinkle;

          void main() {
            vec4 texColor = texture2D(uMap, gl_PointCoord);
            if (texColor.a < 0.01) discard;
            gl_FragColor = vec4(vColor * vTwinkle, texColor.a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      }));
    }
    this.engine.scene.add(this.bgPoints);
  }

  private buildMilkyWayBand() {
    const isLow = Settings.graphicsMode === 'LOW';
    const count = isLow ? 10000 : 18000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const r = 2000 + Math.random() * 20000;
      const thickness = (200 + Math.random() * 600) * (1 - r / 25000);
      positions[i3]     = Math.cos(angle) * r + (Math.random() - 0.5) * 2000;
      positions[i3 + 1] = (Math.random() - 0.5) * thickness;
      positions[i3 + 2] = Math.sin(angle) * r + (Math.random() - 0.5) * 2000;

      const c = new THREE.Color();
      c.setHSL(0.6 + Math.random() * 0.1, 0.1 + Math.random() * 0.15, 0.65 + Math.random() * 0.25);
      colors[i3] = c.r; colors[i3+1] = c.g; colors[i3+2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.engine.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 18,
      map: this.makeBgDot(),
      alphaTest: 0.01,
      transparent: true,
      vertexColors: true,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.25,
    })));
  }

  private buildNebulae() {
    if (Settings.graphicsMode === 'LOW') return;
    
    const nebColors: number[][] = [
      [0.3,0.1,0.5],[0.12,0.25,0.6],[0.55,0.1,0.18],[0.05,0.4,0.35],
      [0.4,0.18,0.5],[0.18,0.12,0.4],[0.5,0.25,0.12],[0.12,0.35,0.18],
      [0.35,0.08,0.55],[0.65,0.18,0.22],[0.1,0.18,0.45],[0.25,0.45,0.35],
    ];
    for (let i = 0; i < 8; i++) {
      const rgb = nebColors[i % nebColors.length];
      const tex = this.makeNebTex(rgb);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true,
        opacity: 0.08 + Math.random() * 0.08,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.position.set(
        (Math.random()-0.5)*this.worldSize*0.8,
        (Math.random()-0.5)*this.worldSize*0.8,
        (Math.random()-0.5)*this.worldSize*0.8,
      );
      const s = 1500 + Math.random() * 4000;
      sprite.scale.set(s, s, 1);
      sprite.userData = {
        radius: s * 0.45,
        color: new THREE.Color(rgb[0], rgb[1], rgb[2])
      };
      this.nebulaSprites.push(sprite);
      this.engine.scene.add(sprite);
    }
  }

  public getNebulaAtPosition(pos: THREE.Vector3): { color: THREE.Color; radius: number } | null {
    for (const sprite of this.nebulaSprites) {
      const dist = pos.distanceTo(sprite.position);
      const rad = sprite.userData.radius || 0;
      if (dist < rad) {
        return {
          color: sprite.userData.color as THREE.Color,
          radius: rad
        };
      }
    }
    return null;
  }

  private makeNebTex(rgb: number[]): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < 6; i++) {
      const cx = 70 + Math.random() * 116;
      const cy = 70 + Math.random() * 116;
      const r = 40 + Math.random() * 100;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = 0.2 + Math.random() * 0.5;
      const c1 = [Math.min(1,rgb[0]+(Math.random()-0.5)*0.15), Math.min(1,rgb[1]+(Math.random()-0.5)*0.15), Math.min(1,rgb[2]+(Math.random()-0.5)*0.15)];
      g.addColorStop(0, 'rgba('+Math.floor(c1[0]*255)+','+Math.floor(c1[1]*255)+','+Math.floor(c1[2]*255)+','+a+')');
      g.addColorStop(0.4, 'rgba('+Math.floor(c1[0]*160)+','+Math.floor(c1[1]*160)+','+Math.floor(c1[2]*160)+','+(a*0.2)+')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(c);
  }

  private buildGasClouds() {
    const isLow = Settings.graphicsMode === 'LOW';
    if (isLow) return; // Fully disable on LOW graphics for ultimate mobile speed!

    const cc = [0x5533bb, 0x2266dd, 0xdd3355, 0x22bb99, 0xbb5599, 0x3377bb, 0x88aa22, 0xcc6622, 0x6644cc, 0x44aacc];
    const cloudCount = 8;
    
    // Compute total particles
    let totalPoints = 0;
    const cloudsData: { cnt: number; cx: number; cy: number; cz: number; sp: number; colorHex: number }[] = [];
    
    for (let ci = 0; ci < cloudCount; ci++) {
      const cnt = 150 + Math.floor(Math.random() * 300);
      totalPoints += cnt;
      cloudsData.push({
        cnt,
        cx: (Math.random()-0.5)*this.worldSize*0.7,
        cy: (Math.random()-0.5)*this.worldSize*0.7,
        cz: (Math.random()-0.5)*this.worldSize*0.7,
        sp: 200 + Math.random() * 800,
        colorHex: cc[ci % cc.length]
      });
    }

    const positions = new Float32Array(totalPoints * 3);
    const colors = new Float32Array(totalPoints * 3);
    
    let index = 0;
    for (const cloud of cloudsData) {
      const col = new THREE.Color(cloud.colorHex);
      for (let i = 0; i < cloud.cnt; i++) {
        const i3 = index * 3;
        positions[i3]   = cloud.cx + (Math.random()+Math.random()+Math.random()-1.5)*cloud.sp;
        positions[i3+1] = cloud.cy + (Math.random()+Math.random()+Math.random()-1.5)*cloud.sp;
        positions[i3+2] = cloud.cz + (Math.random()+Math.random()+Math.random()-1.5)*cloud.sp;
        
        colors[i3]   = col.r;
        colors[i3+1] = col.g;
        colors[i3+2] = col.b;
        index++;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 50,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: this.makeBgDot(),
      sizeAttenuation: true,
      vertexColors: true
    });

    const gasPoints = new THREE.Points(geo, mat);
    this.engine.scene.add(gasPoints);
  }

  private buildRealConstellations() {
    const isLow = Settings.graphicsMode === 'LOW';
    const features = (constellationLinesData as any).features || [];
    const constellationPositions: number[] = [];
    const constellationColors: number[] = [];

    // Compute centers
    const centers: {ra: number; dec: number}[] = [];
    for (const f of features) {
      let sr = 0, sd = 0, n = 0;
      for (const p of (f.geometry?.coordinates || [])) for (const pt of p) { sr += pt[0]; sd += pt[1]; n++; }
      centers.push({ ra: n ? sr/n : 0, dec: n ? sd/n : 0 });
    }

    for (let fi = 0; fi < features.length; fi++) {
      const f = features[fi];
      const lines: number[][][] = f.geometry?.coordinates || [];
      const cen = centers[fi];

      // Random 3D position in the huge volume
      const cPos = new THREE.Vector3(
        (srand(fi*7+1)-0.5) * this.worldSize * 0.7,
        (srand(fi*7+2)-0.5) * this.worldSize * 0.7,
        (srand(fi*7+3)-0.5) * this.worldSize * 0.7,
      );
      const scale = 40 + srand(fi*7+4) * 50;

      const group = new THREE.Group();
      const lineVertices: THREE.Vector3[] = [];

      for (const poly of lines) {
        const pts: THREE.Vector3[] = [];
        for (let pi = 0; pi < poly.length; pi++) {
          const [ra, dec] = poly[pi];
          const lx = (ra - cen.ra) * scale;
          const ly = (dec - cen.dec) * scale;
          const lz = (srand(fi*100+pi*31) - 0.5) * scale * 10;
          const pos = new THREE.Vector3(cPos.x+lx, cPos.y+ly, cPos.z+lz);
          pts.push(pos);

          const ci = (fi+pi) % STAR_COLORS.length;
          const starColor = new THREE.Color().setHSL(
            STAR_COLORS[ci].h,
            STAR_COLORS[ci].s,
            STAR_COLORS[ci].l,
          );
          constellationPositions.push(pos.x, pos.y, pos.z);
          constellationColors.push(starColor.r, starColor.g, starColor.b);

        }

        // Thin energy lines between stars
        if (!isLow && fi % 7 === 0 && pts.length >= 2) {
          for (let li = 0; li < pts.length-1; li++) {
            lineVertices.push(pts[li], pts[li+1]);
          }
        }
      }

      if (lineVertices.length > 0) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(lineVertices);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x1199ff,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
        group.add(lineSegments);
      }

      this.engine.scene.add(group);
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(constellationPositions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(constellationColors, 3));
    const starPoints = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      size: isLow ? 34 : 50,
      map: this.starGlow,
      alphaTest: 0.02,
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    starPoints.frustumCulled = false;
    this.engine.scene.add(starPoints);
  }

  private buildComets() {
    const isLow = Settings.graphicsMode === 'LOW';
    const cometCount = isLow ? 8 : 18;
    const tailCount = isLow ? 6 : 10;
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < cometCount; i++) {
      const pos = new THREE.Vector3(
        (Math.random()-0.5)*this.worldSize*0.6,
        (Math.random()-0.5)*this.worldSize*0.6,
        (Math.random()-0.5)*this.worldSize*0.6,
      );
      const dir = new THREE.Vector3(srand(i*3)-0.5, srand(i*3+1)-0.5, srand(i*3+2)-0.5).normalize();
      for (let t = 0; t <= tailCount; t++) {
        const tailPos = pos.clone().sub(dir.clone().multiplyScalar(t * 40));
        const fade = 1 - t / (tailCount + 1);
        positions.push(tailPos.x, tailPos.y, tailPos.z);
        colors.push(0.45 * fade, 0.68 * fade, 0.9 * fade);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.engine.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      size: isLow ? 24 : 32,
      map: this.starGlow,
      alphaTest: 0.02,
      transparent: true,
      opacity: 0.72,
      vertexColors: true,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })));
  }

  private buildAsteroidFields() {
    const isLow = Settings.graphicsMode === 'LOW';
    const fieldCount = isLow ? 1 : 12;
    const asteroidsPerField = 40;
    const totalAsteroids = fieldCount * asteroidsPerField;

    const geo = new THREE.DodecahedronGeometry(1, 0); // Unit geometry
    
    let mat: THREE.Material;
    if (isLow) {
      mat = new THREE.MeshBasicMaterial({ color: 0x443322 });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x665544, roughness: 0.9, metalness: 0.1,
        emissive: 0x221100, emissiveIntensity: 0.1,
      });
    }

    const instancedMesh = new THREE.InstancedMesh(geo, mat, totalAsteroids);
    const dummy = new THREE.Object3D();
    let index = 0;

    for (let fi = 0; fi < fieldCount; fi++) {
      const center = new THREE.Vector3(
        (Math.random()-0.5)*this.worldSize*0.6,
        (Math.random()-0.5)*this.worldSize*0.6,
        (Math.random()-0.5)*this.worldSize*0.6,
      );

      for (let i = 0; i < asteroidsPerField; i++) {
        const sz = 5 + Math.random() * 20;
        dummy.position.set(
          center.x + (Math.random()-0.5)*2000,
          center.y + (Math.random()-0.5)*2000,
          center.z + (Math.random()-0.5)*2000,
        );
        dummy.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
        dummy.scale.set(sz, sz, sz);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(index++, dummy.matrix);
      }
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.engine.scene.add(instancedMesh);
  }

  private spawnMerchants() {
    const merchantGroup = new THREE.Group();
    merchantGroup.position.set(-1000, -400, -2600); 

    const ringGeo = new THREE.PlaneGeometry(600, 600);
    const ringMat = new THREE.MeshBasicMaterial({
      map: this.makeHolographicGridTex(),
      color: 0x0055aa,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    merchantGroup.add(ring);
    
    gsap.to(ring.rotation, { z: Math.PI * 2, duration: 35, repeat: -1, ease: 'linear' });

    const shieldGeo = new THREE.SphereGeometry(150, 40, 40);
    
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x002255,
      transparent: true,
      opacity: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.scale.set(0.5, 1.5, 0.5);
    merchantGroup.add(shield);

    const shieldGridMat = new THREE.MeshBasicMaterial({
      color: 0x004488,
      wireframe: true,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const shieldGrid = new THREE.Mesh(shieldGeo, shieldGridMat);
    shieldGrid.scale.set(0.5, 1.5, 0.5);
    merchantGroup.add(shieldGrid);

    gsap.to(shieldMat, {
      opacity: 0.005,
      duration: 4,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });
    
    gsap.to(shieldGridMat, {
      opacity: 0.008,
      duration: 2.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });
 
    gsap.to(shieldGrid.rotation, {
      y: Math.PI * 2,
      duration: 120,
      repeat: -1,
      ease: 'linear'
    });

    const coreGeo = new THREE.OctahedronGeometry(20, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x0066aa,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.set(0, 10, 0);
    merchantGroup.add(coreMesh);

    gsap.to(coreMesh.rotation, {
      x: Math.PI * 2,
      y: Math.PI * 2,
      duration: 10,
      repeat: -1,
      ease: 'linear'
    });

    const coreGlowMat = new THREE.SpriteMaterial({
      map: this.starGlow,
      color: 0x003388,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const coreGlow = new THREE.Sprite(coreGlowMat);
    coreGlow.position.set(0, 10, 0);
    coreGlow.scale.set(70, 70, 1);
    merchantGroup.add(coreGlow);

    const hitGeo = new THREE.SphereGeometry(150, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitGeo, hitMat);
    hitBox.userData = { isMerchant: true, name: 'GITHUB REPOSITORY HUB', type: 'Smart Search', radius: 150 };
    merchantGroup.add(hitBox);
    this.starMeshes.push(hitBox);

    this.engine.scene.add(merchantGroup);
  }

  private makeHolographicGridTex(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;

    ctx.clearRect(0, 0, 512, 512);

    const cx = 256;
    const cy = 256;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 250);
    glow.addColorStop(0, 'rgba(0, 170, 255, 0.18)');
    glow.addColorStop(0.5, 'rgba(0, 100, 255, 0.05)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 256, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 220, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 160, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, 170, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(0, 120, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 180, 255, 0.35)';
    ctx.lineWidth = 1;
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i * Math.PI * 2) / rayCount;
      const rx = cx + Math.cos(angle) * 240;
      const ry = cy + Math.sin(angle) * 240;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 30, cy + Math.sin(angle) * 30);
      ctx.lineTo(rx, ry);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 255, 200, 0.75)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 240, angle - 0.05, angle + 0.05);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(c);
  }

  private makeBgDot(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(230,240,255,0.5)');
    g.addColorStop(0.5, 'rgba(140,170,220,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
}
