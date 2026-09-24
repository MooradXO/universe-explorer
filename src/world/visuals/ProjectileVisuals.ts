import * as THREE from 'three';
import { Settings } from '../../core/Settings';
/** Shared projectile meshes for live combat and authored scene previews. */
export class ProjectileVisuals {
  constructor(private previewLow?:boolean){}
  private get low(){return this.previewLow??Settings.graphicsMode==='LOW';}
  protected sharedCylinderGeo=new THREE.CylinderGeometry(1,1,1,8,1,false);
  protected sharedBoltGeo=new THREE.SphereGeometry(1,8,6);
  protected materialCache=new Map<string,THREE.Material>();
  protected laserPool:THREE.Group[]=[];
  protected getOrCreateMaterial(key: string, createFn: () => THREE.Material): THREE.Material {
    let mat = this.materialCache.get(key);
    if (!mat) {
      mat = createFn();
      this.materialCache.set(key, mat);
    }
    return mat;
  }

  public createVolumetricLaser(colorHex: number, height: number, isPlayer: boolean): THREE.Group {
    let group = this.laserPool.pop();
    if (!group) {
      group = new THREE.Group();
      // Core mesh
      const coreMesh = new THREE.Mesh(this.sharedCylinderGeo);
      group.add(coreMesh);
      // Glow mesh
      const glowMesh = new THREE.Mesh(this.sharedCylinderGeo);
      group.add(glowMesh);
      // Soft outer bloom shell
      const auraMesh = new THREE.Mesh(this.sharedCylinderGeo);
      group.add(auraMesh);
    } else if (group.children.length < 3) {
      group.add(new THREE.Mesh(this.sharedCylinderGeo));
    }

    const coreMesh = group.children[0] as THREE.Mesh;
    const glowMesh = group.children[1] as THREE.Mesh;
    const auraMesh = group.children[2] as THREE.Mesh;

    // Apply materials
    coreMesh.material = this.getOrCreateMaterial('laser_core', () => new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false
    }));
    glowMesh.material = this.getOrCreateMaterial(`laser_glow_${colorHex}`, () => new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    auraMesh.material = this.getOrCreateMaterial(`laser_aura_${colorHex}`, () => new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: this.low ? 0.16 : 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));

    // Reset scales based on sizes
    const coreRadius = isPlayer ? 1.4 : 1.7;
    coreMesh.scale.set(coreRadius, 1, coreRadius);
    const glowRadius = isPlayer ? 4.2 : 5;
    glowMesh.scale.set(glowRadius, 1, glowRadius);
    auraMesh.scale.set(glowRadius * 1.65, 1, glowRadius * 1.65);
    for (const mesh of [coreMesh, glowMesh, auraMesh]) { mesh.geometry = this.sharedBoltGeo; mesh.visible = true; }
    auraMesh.visible = !this.low;
    group.userData.isLaserBolt = true;
    group.userData.boltLength = Math.min(900, Math.max(240, height * 1.6));
    group.userData.boltTravel = 0;
    this.updateBoltTail(group, 0);

    // Reset parent scale
    group.scale.set(1, 1, 1);
    group.visible = true;
    return group;
  }

  /** The group origin is the collision tip. The tail grows behind it, never through the muzzle. */
  protected updateBoltTail(mesh: THREE.Object3D, distance: number) {
    if (!mesh.userData.isLaserBolt) return;
    mesh.userData.boltTravel += distance;
    const length = Math.max(1, Math.min(mesh.userData.boltLength, mesh.userData.boltTravel));
    for (const child of mesh.children) { child.position.y = -length / 2; child.scale.y = length / 2; }
  }

  public createMissileOrTorpedo(isTorpedo: boolean, colorHex: number = 0xff5500): THREE.Group {
    let group = this.laserPool.pop();
    if (!group) {
      group = new THREE.Group();
      const coreMesh = new THREE.Mesh(this.sharedCylinderGeo);
      group.add(coreMesh);
      const glowMesh = new THREE.Mesh(this.sharedCylinderGeo);
      group.add(glowMesh);
    }

    const coreMesh = group.children[0] as THREE.Mesh;
    const glowMesh = group.children[1] as THREE.Mesh;

    group.userData.isLaserBolt = false;
    coreMesh.geometry = glowMesh.geometry = this.sharedCylinderGeo;
    for (const child of group.children) child.position.set(0, 0, 0);
    coreMesh.visible = glowMesh.visible = true;
    if (group.children[2]) group.children[2].visible = false;

    if (isTorpedo) {
      coreMesh.material = this.getOrCreateMaterial('torpedo_core', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      glowMesh.material = this.getOrCreateMaterial(`torpedo_glow_${colorHex}`, () => new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      coreMesh.scale.set(10, 80, 10);
      glowMesh.scale.set(20, 80, 20);
    } else {
      coreMesh.material = this.getOrCreateMaterial('missile_core', () => new THREE.MeshBasicMaterial({ color: 0xffdd00, toneMapped: false }));
      glowMesh.material = this.getOrCreateMaterial('missile_glow', () => new THREE.MeshBasicMaterial({
        color: 0xff5500,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      coreMesh.scale.set(8, 80, 8);
      glowMesh.scale.set(15, 80, 15);
    }

    group.scale.set(1, 1, 1);
    group.visible = true;
    return group;
  }


  previewTail(group:THREE.Group,length:number){this.updateBoltTail(group,length);}
  disposeVisuals(){this.sharedCylinderGeo.dispose();this.sharedBoltGeo.dispose();for(const m of this.materialCache.values())m.dispose();this.materialCache.clear();this.laserPool.length=0;}
}
