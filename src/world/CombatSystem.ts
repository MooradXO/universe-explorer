import * as THREE from 'three';
import { impactMaterial } from './visuals/ImpactVisuals';
import { ProjectileVisuals } from './visuals/ProjectileVisuals';
import gsap from 'gsap';
import { Engine } from '../core/Engine';
import { SoundManager } from '../core/SoundManager';
import { UIManager } from '../ui/UIManager';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { Settings } from '../core/Settings';
import { OrbitObject } from './PlanetBuilder';
import { PLAYER_SHIP_VISUAL } from './ShipVisualConfig';
import type { WorldSnapshot } from '../network/shared/Protocol';
import type { WeaponSound } from '../core/WeaponAudio';

const PROJECTILE_AXIS = new THREE.Vector3(0, 1, 0);
const SHIP_FORWARD_AXIS = new THREE.Vector3(0, 0, -1);
const PLAYER_MUZZLE_FALLBACK = new THREE.Vector3(0, 0, -64);
const PLAYER_PROJECTILE_SAFE_OFFSET = 72;
const PLAYER_PROJECTILE_VISUAL_OFFSET = 72;
const PROJECTILE_SPEED_MARGIN = 600;

export interface LaserInstance {
  networkId?: number;
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
  ownerId?: string;
  lastPosition?: THREE.Vector3;
  isHoming?: boolean;
}

interface PlayerShotSource {
  muzzleWorld: THREE.Vector3;
  forwardWorld: THREE.Vector3;
  upWorld: THREE.Vector3;
}

interface PreparedPlayerProjectile {
  velocity: THREE.Vector3;
  lastPosition: THREE.Vector3;
}

export class CombatSystem extends ProjectileVisuals {
  private engine: Engine;
  private soundManager: SoundManager;
  private ui: UIManager;
  private multiplayer: MultiplayerManager;
  private bgDot: THREE.Texture;

  // Shared Geometries


  private sharedSphere16Geo!: THREE.SphereGeometry;
  private sharedSphere32Geo!: THREE.SphereGeometry;

  // Material Cache


  // Object Pools

  private explosionPool: THREE.Mesh[] = [];
  private shieldFlarePool: THREE.Mesh[] = [];
  private sparksPool: THREE.Points[] = [];

  public lasers: LaserInstance[] = [];
  private readonly pendingPositions = new Set<THREE.Vector3>();
  private readonly obstaclePosition = new THREE.Vector3();

  public shiftOrigin(delta: THREE.Vector3) {
    for (const laser of this.lasers) laser.lastPosition?.sub(delta);
    for (const position of this.pendingPositions) position.sub(delta);
  }
  public get laserColor(): 'red' | 'blue' {
    return this.engine.shipController.laserColor;
  }
  public set laserColor(value: 'red' | 'blue') {
    this.engine.shipController.laserColor = value;
  }
  public lastShootTime = 0;
  public botHP: Map<string, number> = new Map();

  public clearProjectiles() {
    for (const laser of this.lasers) this.returnLaserToPool(laser.mesh as THREE.Group);
    this.lasers.length = 0; this.botHP.clear();
  }

  public snapshot() {
    return { shots: this.lasers.slice(0, 24).map(shot => ({ id: shot.networkId ?? null, head: shot.mesh.position.toArray(),
      velocity: shot.velocity.toArray(), tailLength: shot.mesh.userData.isLaserBolt ? Math.min(shot.mesh.userData.boltLength, shot.mesh.userData.boltTravel) : 0,
      laser: !!shot.mesh.userData.isLaserBolt, life: shot.life })) };
  }

  public applyNetworkProjectiles(data: WorldSnapshot) {
    if (!this.engine.shipController.combatEnabled) return;
    const gone = new Set(data.shotGone);
    const heard = new Set<string>();
    for (let i = this.lasers.length - 1; i >= 0; i--) if (gone.has(this.lasers[i].networkId!)) {
      this.returnLaserToPool(this.lasers[i].mesh as THREE.Group); this.lasers.splice(i, 1);
    }
    for (const shot of data.shots) {
      let laser = this.lasers.find(item => item.networkId === shot.id);
      const velocity = new THREE.Vector3().fromArray(shot.v), position = new THREE.Vector3(...this.multiplayer.toLocal(shot.p));
      if (!laser) {
        const local = shot.owner === data.self.id;
        const color = shot.weapon === 'missile' ? 0xffaa00 : ({ red: 0xff2222, blue: 0x2288ff, green: 0x55ff88, purple: 0xaa22ff, yellow: 0xffdd44 }[shot.color] ?? 0xff2222);
        const mesh = shot.weapon === 'missile' ? this.createMissileOrTorpedo(false) : this.createVolumetricLaser(color, local ? (shot.weapon === 'shotgun' ? 260 : 420) : 120, local);
        if (shot.color === 'purple') mesh.scale.set(3, 1, 3);
        this.engine.scene.add(mesh);
        laser = { mesh, networkId: shot.id, velocity, life: shot.life, ownerId: shot.owner }; this.lasers.push(laser);
        const soundKey = `${shot.owner}/${shot.weapon}`;
        if (!local && !heard.has(soundKey) && this.multiplayer.localPlayerPosition && position.distanceTo(this.multiplayer.localPlayerPosition) < 8000) {
          const source = this.multiplayer.players.get(shot.owner)?.position ?? position;
          this.playWeaponAt(shot.weapon, shot.color === 'blue' ? 'blue' : 'red', .4, source); heard.add(soundKey);
        }
      }
      laser.mesh.position.copy(position); laser.velocity.copy(velocity); laser.life = shot.life;
      if (laser.mesh.userData.isLaserBolt) {
        const duration = shot.weapon === 'shotgun' ? 1.5 : 2;
        laser.mesh.userData.boltTravel = Math.max(0, duration - shot.life) * velocity.length();
        this.updateBoltTail(laser.mesh, 0);
      }
      laser.mesh.quaternion.setFromUnitVectors(PROJECTILE_AXIS, velocity.clone().normalize());
    }
  }

  public playWeaponAt(kind: WeaponSound, color: 'red' | 'blue', volume: number, position: THREE.Vector3) {
    this.soundManager.playWeapon(kind, color, volume, position);
  }

  constructor(
    engine: Engine,
    soundManager: SoundManager,
    ui: UIManager,
    multiplayer: MultiplayerManager,
    bgDot: THREE.Texture
  ) {
    super();
    this.engine = engine;
    this.soundManager = soundManager;
    this.ui = ui;
    this.multiplayer = multiplayer;
    this.bgDot = bgDot;
    this.initPools();
  }

  private initPools() {
    // Geometries (all normalized to radius/height 1 for scale-based reuse)


    this.sharedSphere16Geo = new THREE.SphereGeometry(1, 16, 16);
    this.sharedSphere32Geo = new THREE.SphereGeometry(1, 32, 32);
  }

  private getConfiguredForwardLocal() {
    const configured = PLAYER_SHIP_VISUAL.forwardLocal;
    const forward = configured
      ? new THREE.Vector3(configured[0], configured[1], configured[2])
      : SHIP_FORWARD_AXIS.clone();

    return forward.lengthSq() > 0.0001 ? forward.normalize() : SHIP_FORWARD_AXIS.clone();
  }

  private getConfiguredMuzzleLocal() {
    const configured = PLAYER_SHIP_VISUAL.laserMuzzleLocal;
    return configured
      ? new THREE.Vector3(configured[0], configured[1], configured[2])
      : PLAYER_MUZZLE_FALLBACK.clone();
  }

  private getForwardVector(source: THREE.Object3D) {
    return this.getConfiguredForwardLocal().applyQuaternion(source.quaternion).normalize();
  }

  private getPlayerShotSource(userShipGroup: THREE.Group): PlayerShotSource {
    userShipGroup.updateMatrixWorld(true);

    const muzzleWorld = userShipGroup.localToWorld(this.getConfiguredMuzzleLocal());
    const forwardWorld = this.getForwardVector(userShipGroup);
    const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(userShipGroup.quaternion).normalize();

    return { muzzleWorld, forwardWorld, upWorld };
  }

  private placeProjectileFromMuzzle(
    projectile: THREE.Object3D,
    muzzleWorld: THREE.Vector3,
    direction: THREE.Vector3,
    visualLength: number,
    visualOffset = PLAYER_PROJECTILE_VISUAL_OFFSET
  ) {
    projectile.position.copy(muzzleWorld).addScaledVector(direction, projectile.userData.isLaserBolt ? PLAYER_PROJECTILE_SAFE_OFFSET : visualOffset + visualLength * 0.5);
    projectile.quaternion.setFromUnitVectors(PROJECTILE_AXIS, direction);
  }

  private preparePlayerProjectile(
    projectile: THREE.Object3D,
    muzzleWorld: THREE.Vector3,
    directionWorld: THREE.Vector3,
    visualLength: number,
    shipVelocity: THREE.Vector3,
    baseSpeed: number,
    safeOffset = PLAYER_PROJECTILE_SAFE_OFFSET
  ): PreparedPlayerProjectile {
    const direction = directionWorld.clone().normalize();
    this.placeProjectileFromMuzzle(projectile, muzzleWorld, direction, visualLength);

    const shipForwardSpeed = Math.max(0, shipVelocity.dot(direction));
    const projectileSpeed = Math.max(baseSpeed, shipForwardSpeed + PROJECTILE_SPEED_MARGIN);

    return {
      velocity: direction.clone().multiplyScalar(projectileSpeed),
      lastPosition: muzzleWorld.clone().addScaledVector(direction, safeOffset)
    };
  }

  public placeProjectile(
    projectile: THREE.Object3D,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    visualLength: number,
    muzzleClearance: number
  ) {
    const muzzlePosition = origin.clone().addScaledVector(direction, muzzleClearance);
    projectile.position.copy(muzzlePosition).addScaledVector(direction, projectile.userData.isLaserBolt ? 0 : visualLength * 0.5);
    projectile.quaternion.setFromUnitVectors(PROJECTILE_AXIS, direction);
    return muzzlePosition;
  }

  private returnLaserToPool(group: THREE.Group) {
    group.visible = false;
    this.engine.scene.remove(group);
    this.laserPool.push(group);
  }

  public createSparksAt(pos: THREE.Vector3, colorHex: number = 0xffcc00, count: number = 15) {
    const isLow = Settings.graphicsMode === 'LOW';
    if (isLow) return;

    let pSystem = this.sparksPool.pop();
    if (!pSystem) {
      const geo = new THREE.BufferGeometry();
      const maxCount = 35;
      const positions = new Float32Array(maxCount * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pSystem = new THREE.Points(geo);
      pSystem.userData = {
        velocities: new Array(maxCount).fill(null).map(() => new THREE.Vector3())
      };
    }

    const geo = pSystem.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const pArray = posAttr.array as Float32Array;
    const velocities = pSystem.userData.velocities as THREE.Vector3[];

    const actualCount = Math.min(count, 35);
    for (let i = 0; i < 35; i++) {
      const i3 = i * 3;
      pArray[i3] = 0;
      pArray[i3 + 1] = 0;
      pArray[i3 + 2] = 0;

      if (i < actualCount) {
        const dir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();
        const speed = 100 + Math.random() * 250;
        velocities[i].copy(dir.multiplyScalar(speed));
      } else {
        velocities[i].set(0, 0, 0);
      }
    }
    posAttr.needsUpdate = true;

    pSystem.material = this.getOrCreateMaterial(`sparks_${colorHex}`, () => impactMaterial('sparks', colorHex, this.bgDot));

    (pSystem.material as THREE.PointsMaterial).opacity = 1.0;

    pSystem.position.copy(pos);
    pSystem.visible = true;
    this.engine.scene.add(pSystem);

    const animObj = { progress: 0 };

    gsap.killTweensOf(animObj);
    gsap.killTweensOf(pSystem.material);

    gsap.to(animObj, {
      progress: 1,
      duration: 0.45,
      ease: 'power1.out',
      onUpdate: () => {
        const p = animObj.progress;
        for (let i = 0; i < actualCount; i++) {
          const v = velocities[i];
          const i3 = i * 3;
          pArray[i3] = v.x * p;
          pArray[i3 + 1] = v.y * p;
          pArray[i3 + 2] = v.z * p;
        }
        posAttr.needsUpdate = true;
      }
    });

    gsap.to(pSystem.material, {
      opacity: 0,
      duration: 0.45,
      ease: 'power2.in',
      onComplete: () => {
        pSystem!.visible = false;
        this.engine.scene.remove(pSystem!);
        this.sparksPool.push(pSystem!);
      }
    });
  }

  public createExplosionAt(pos: THREE.Vector3, color: number = 0xff4400, scale: number = 5) {
    let mesh = this.explosionPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.sharedSphere16Geo);
    }

    mesh.material = this.getOrCreateMaterial(`explosion_${color}`, () => impactMaterial('explosion', color));

    (mesh.material as THREE.MeshBasicMaterial).opacity = 1.0;

    mesh.position.copy(pos);
    mesh.scale.set(scale, scale, scale);
    mesh.visible = true;
    this.engine.scene.add(mesh);
    
    gsap.killTweensOf(mesh.scale);
    gsap.killTweensOf(mesh.material);

    gsap.to(mesh.scale, { x: scale * 3, y: scale * 3, z: scale * 3, duration: 0.5, ease: 'power2.out' });
    gsap.to(mesh.material, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => {
      mesh!.visible = false;
      this.engine.scene.remove(mesh!);
      this.explosionPool.push(mesh!);
    }});
  }

  public createShieldFlare(pos: THREE.Vector3, isLocal: boolean) {
    this.createSparksAt(pos, 0x00aaff, 12);

    let bubble = this.shieldFlarePool.pop();
    if (!bubble) {
      bubble = new THREE.Mesh(this.sharedSphere32Geo);
    }

    bubble.material = this.getOrCreateMaterial('shield_flare', () => impactMaterial('shield', 0x00aaff));

    (bubble.material as THREE.MeshBasicMaterial).opacity = 0.7;

    const baseScale = isLocal ? 40 : 60;
    bubble.position.copy(pos);
    bubble.scale.set(baseScale, baseScale, baseScale);
    bubble.visible = true;
    this.engine.scene.add(bubble);

    gsap.killTweensOf(bubble.scale);
    gsap.killTweensOf(bubble.material);

    gsap.to(bubble.scale, { x: baseScale * 1.2, y: baseScale * 1.2, z: baseScale * 1.2, duration: 0.3, ease: 'power2.out' });
    gsap.to(bubble.material, { opacity: 0, duration: 0.3, onComplete: () => {
      bubble!.visible = false;
      this.engine.scene.remove(bubble!);
      this.shieldFlarePool.push(bubble!);
    } });
  }

  public shootLaser(userShipGroup: THREE.Group | null, authProfileId: string | undefined, shipVelocity: THREE.Vector3) {
    if (!this.engine.shipController.combatEnabled) return;
    if (!userShipGroup) return;

    if (this.multiplayer.authoritative) {
      const weapon = this.engine.shipController.activeWeapon, now = Date.now(), cooldown = weapon === 'laser' ? 200 : weapon === 'shotgun' ? 400 : 650;
      if (this.engine.shipController.isDead || now - this.lastShootTime < cooldown) return;
      if (!this.multiplayer.action('fire', { weapon, color: this.laserColor })) return;
      this.lastShootTime = now;

      this.soundManager.playWeapon(weapon, this.laserColor, weapon === 'missile' ? .4 : .3); return;
    }

    const now = Date.now();
    
    // Subsystem Weapons Check: Misfires
    const weaponHP = this.engine.shipController.subsystems.weapons;
    if (weaponHP < 50) {
      const misfireChance = 1 - (weaponHP / 100);
      if (Math.random() < misfireChance * 0.8) {
        // Weapon misfire!
        this.soundManager.playLaser(this.laserColor === 'red' ? 'blue' : 'red', 0.15);
        window.dispatchEvent(new CustomEvent('WeaponMisfire'));
        return;
      }
    }

    const activeWeapon = this.engine.shipController.activeWeapon;
    const cooldown = activeWeapon === 'laser' ? 200 : (activeWeapon === 'shotgun' ? 400 : 650);
    if (now - this.lastShootTime < cooldown) return;
    this.lastShootTime = now;

    if (activeWeapon === 'shotgun') {
      // PLASMA SHOTGUN: 3 spreading lasers
      this.soundManager.playWeapon('shotgun', this.laserColor, .34);
      const laserColorHex = this.laserColor === 'red' ? 0xff2222 : 0x2288ff;
      const shotSource = this.getPlayerShotSource(userShipGroup);
      const forwardVec = shotSource.forwardWorld;
      const spreadAxis = shotSource.upWorld;
      const laserLength = 260;
      const laserSpeed = 3800;

      const angles = [0, -0.15, 0.15];
      for (const angle of angles) {
        const dir = forwardVec.clone().applyAxisAngle(spreadAxis, angle).normalize();
        const laser = this.createVolumetricLaser(laserColorHex, laserLength, true);
        const prepared = this.preparePlayerProjectile(
          laser,
          shotSource.muzzleWorld,
          dir,
          laserLength,
          shipVelocity,
          laserSpeed
        );

        this.engine.scene.add(laser);

        this.lasers.push({
          mesh: laser,
          velocity: prepared.velocity,
          life: 1.5,
          ownerId: authProfileId,
          lastPosition: prepared.lastPosition
        });
      }
      this.multiplayer.broadcastShoot(forwardVec, this.laserColor, 'shotgun');

    } else if (activeWeapon === 'missile') {
      // HOMING MISSILE: Heavy rocket tracking nearest bot
      this.soundManager.playWeapon('missile', this.laserColor, .4);


      const group = this.createMissileOrTorpedo(false);
      const shotSource = this.getPlayerShotSource(userShipGroup);
      const forwardVec = shotSource.forwardWorld;
      const missileSpeed = 2800;
      const prepared = this.preparePlayerProjectile(
        group,
        shotSource.muzzleWorld,
        forwardVec,
        80,
        shipVelocity,
        missileSpeed
      );

      this.engine.scene.add(group);

      this.multiplayer.broadcastShoot(forwardVec, 'red', 'missile');
      this.lasers.push({
        mesh: group,
        velocity: prepared.velocity,
        life: 4.0,
        ownerId: authProfileId,
        lastPosition: prepared.lastPosition,
        isHoming: true
      });

    } else {
      // STANDARD LASER
      this.soundManager.playLaser(this.laserColor);

      const laserColorHex = this.laserColor === 'red' ? 0xff2222 : 0x2288ff;
      const laserLength = 420;
      const laser = this.createVolumetricLaser(laserColorHex, laserLength, true);
      const shotSource = this.getPlayerShotSource(userShipGroup);
      const forwardVec = shotSource.forwardWorld;
      const laserSpeed = 4000;
      const prepared = this.preparePlayerProjectile(
        laser,
        shotSource.muzzleWorld,
        forwardVec,
        laserLength,
        shipVelocity,
        laserSpeed
      );

      this.engine.scene.add(laser);

      this.multiplayer.broadcastShoot(forwardVec, this.laserColor, 'laser');
      this.lasers.push({
        mesh: laser,
        velocity: prepared.velocity,
        life: 2.0,
        ownerId: authProfileId,
        lastPosition: prepared.lastPosition
      });
    }
  }

  public update(dt: number, authProfileId: string | undefined, starMeshes: THREE.Mesh[], orbitObjects: OrbitObject[], userShipGroup: THREE.Group | null) {
    if (this.multiplayer.authoritative) {
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        const shot = this.lasers[i]; shot.mesh.position.addScaledVector(shot.velocity, dt); shot.life -= dt;
        this.updateBoltTail(shot.mesh, shot.velocity.length() * dt);
        if (shot.life <= 0) { this.returnLaserToPool(shot.mesh as THREE.Group); this.lasers.splice(i, 1); }
      }
      return;
    }
    // Lasers and Real-time Projectile Hit Detection
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      
      // Homing missile logic: track nearest bot (Sprint 4)
      if (l.isHoming) {
        let nearestBot: any = null;
        let minDistSq = 36000000; // 6000^2 = 36000000
        for (const [botId, bot] of this.multiplayer.players.entries()) {
          if (botId.startsWith('bot_')) {
            const distSq = l.mesh.position.distanceToSquared(bot.position);
            if (distSq < minDistSq) {
              minDistSq = distSq;
              nearestBot = bot;
            }
          }
        }
        if (nearestBot) {
          const targetDir = nearestBot.position.clone().sub(l.mesh.position).normalize();
          const currentDir = l.velocity.clone().normalize();
          currentDir.lerp(targetDir, dt * 6.0).normalize();
          l.velocity.copy(currentDir).multiplyScalar(2800);
          
          l.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), currentDir);
        }
      }

      const prevPos = l.lastPosition ? l.lastPosition.clone() : l.mesh.position.clone();
      
      l.mesh.position.addScaledVector(l.velocity, dt);
      this.updateBoltTail(l.mesh, l.velocity.length() * dt);
      if (!l.lastPosition) {
        l.lastPosition = new THREE.Vector3();
      }
      l.lastPosition.copy(l.mesh.position);
      
      l.life -= dt;
      let hitSomeone = false;
      
      const AB = l.mesh.position.clone().sub(prevPos);
      const lenAB2 = AB.lengthSq();
      
      // Projectile swept collision (Math check, infinitely faster than Raycaster polygons)
      for (const [id, p] of this.multiplayer.players.entries()) {
        // Prevent laser hitting the person who shot it
        if (l.ownerId === id || l.ownerId + "_ghost" === id) continue;

        // Projectile trajectory segment check
        const AC = p.position.clone().sub(prevPos);
        let t = lenAB2 > 0.0001 ? AC.dot(AB) / lenAB2 : 0;
        t = Math.max(0, Math.min(1, t));
        const closestPoint = prevPos.clone().addScaledVector(AB, t);
        const distSq = closestPoint.distanceToSquared(p.position);

        const boundingRadius = 40; // Fighter scale hitbox radius
        if (distSq < boundingRadius * boundingRadius) {
          const laserColor = (l.mesh.children[1] as THREE.Mesh)?.material instanceof THREE.MeshBasicMaterial
            ? ((l.mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()
            : 0xff2222;

          this.returnLaserToPool(l.mesh as THREE.Group);
          this.lasers.splice(i, 1);

          // If the bot got hit!
          if (id.startsWith('bot_')) {
            const hp = (this.botHP.get(id) ?? 100) - 20;
            if (hp <= 0) {
              this.botHP.delete(id);
              
              if (id === 'bot_boss_flagship') {
                // Majestic Boss Explosion Sequence!
                const deathPos = p.position.clone();
                for (let e = 0; e < 5; e++) {
                  const delay = e * 0.25;
                  const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 120
                  );
                  const explodePos = deathPos.clone().add(offset);
                  this.pendingPositions.add(explodePos);
                  
                  gsap.delayedCall(delay, () => {
                    this.pendingPositions.delete(explodePos);
                    const colors = [0xff22ff, 0xffaa00, 0xff0000, 0x00ffff, 0xffffff];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    this.createExplosionAt(explodePos, randomColor, 25 + Math.random() * 20);
                    this.createSparksAt(explodePos, randomColor, 35);
                    this.soundManager.playWeapon('impact', 'red', .45, explodePos);
                  });
                }
                
                if (l.ownerId === authProfileId) {
                  (window as any).localPlayerBounty = ((window as any).localPlayerBounty || 0) + 15000;
                  this.ui.addKillFeed("🏆 VICTORY", "YOU DESTROYED ELITE FLAGSHIP! +15000 BNTY");
                } else {
                  this.ui.addKillFeed("🏆 VICTORY", "ELITE FLAGSHIP DESTROYED BY FLEET!");
                }
                
                const wb = (this as any).worldBuilder;
                if (wb) {
                  wb.cleanupBoss();
                } else {
                  this.multiplayer.players.delete(id);
                }
              } else {
                // Regular bot death
                this.createExplosionAt(closestPoint, 0xff5500, 8);
                this.ui.addKillFeed(l.ownerId === authProfileId ? (window as any).localPlayerBounty !== undefined ? "You" : "Pilot" : "Pilot", p.username);
                
                if (l.ownerId === authProfileId) {
                  (window as any).localPlayerBounty = ((window as any).localPlayerBounty || 0) + 100;
                }
                this.multiplayer.players.delete(id);

                // Render debris on bot death!
                const fragment = new THREE.Mesh(
                  new THREE.ConeGeometry(5, 20, 4),
                  new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 })
                );
                const debrisAnchor = new THREE.Group();
                debrisAnchor.position.copy(p.position);
                debrisAnchor.add(fragment);
                this.engine.scene.add(debrisAnchor);
                gsap.to(fragment.position, {
                  x: fragment.position.x + (Math.random() - 0.5) * 200,
                  y: fragment.position.y + (Math.random() - 0.5) * 200,
                  z: fragment.position.z + (Math.random() - 0.5) * 200,
                  duration: 2,
                  onComplete: () => {
                    debrisAnchor.removeFromParent();
                    gsap.killTweensOf(fragment.rotation);
                    fragment.geometry.dispose();
                    if (Array.isArray(fragment.material)) {
                      fragment.material.forEach((m) => m.dispose());
                    } else {
                      fragment.material.dispose();
                    }
                  }
                });
                gsap.to(fragment.rotation, { y: Math.PI * 2, duration: 2, repeat: -1, ease: 'linear' });
              }
            } else {
              this.botHP.set(id, hp);
              this.createExplosionAt(closestPoint, 0xffaa00, 1);
              this.createSparksAt(closestPoint, laserColor, 10);
              
              // Volumetric Shield flash on boss hit
              if (id === 'bot_boss_flagship') {
                const wb = (this as any).worldBuilder;
                if (wb && wb.bossShieldMesh) {
                  const shieldMat = wb.bossShieldMesh.material as THREE.MeshBasicMaterial;
                  shieldMat.opacity = 0.95;
                }
              }
            }
          } else {
             this.multiplayer.broadcastHit(id, 20);
             this.createExplosionAt(closestPoint, 0xffaa00, 1);
             this.createSparksAt(closestPoint, laserColor, 10);
          }
          hitSomeone = true;
          break;
        }
      }

      // Collision check with local player (e.g. from bot lasers)
      if (!hitSomeone && userShipGroup && l.ownerId?.startsWith('bot_')) {
        const playerPos = userShipGroup.position;
        const AC = playerPos.clone().sub(prevPos);
        let t = lenAB2 > 0.0001 ? AC.dot(AB) / lenAB2 : 0;
        t = Math.max(0, Math.min(1, t));
        const closestPoint = prevPos.clone().addScaledVector(AB, t);
        const distSq = closestPoint.distanceToSquared(playerPos);

        const boundingRadius = 25; // Player ship hitbox radius
        if (distSq < boundingRadius * boundingRadius) {
          const laserColor = (l.mesh.children[1] as THREE.Mesh)?.material instanceof THREE.MeshBasicMaterial
            ? ((l.mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()
            : 0xff2222;

          this.returnLaserToPool(l.mesh as THREE.Group);
          this.lasers.splice(i, 1);

          // Local player takes damage from bot!
          if (this.ui) {
            const isBomber = l.mesh.scale.x > 1.5; // Bomber lasers are scaled up
            const damage = isBomber ? 35 : 15;
            
            const dead = this.engine.shipController.takeDamage(damage);
            this.ui.updateHP(this.engine.shipController.currentHP, this.engine.shipController.maxHP);
            this.ui.updateShield(this.engine.shipController.currentShield, this.engine.shipController.maxShield);

            if (dead) {
              this.ui.showDeathScreen(5);
              this.multiplayer.broadcastDie(l.ownerId, "Enemy Ship");
              this.createExplosionAt(playerPos, 0xff0000, 10);
            } else {
              if (this.engine.shipController.currentShield > 0) {
                this.createShieldFlare(playerPos, true);
              } else {
                this.createExplosionAt(playerPos, laserColor, 2);
              }
            }
          }

          hitSomeone = true;
        }
      }

      // Collision with planets / celestial objects in starMeshes
      if (!hitSomeone) {
        for (const star of starMeshes) {
          if (!star || !star.userData) continue;
          const r = star.userData.radius || (star.userData.isStar ? 50 : 0);
          if (r > 0) {
            star.getWorldPosition(this.obstaclePosition);
            const AC = this.obstaclePosition.clone().sub(prevPos);
            let t = lenAB2 > 0.0001 ? AC.dot(AB) / lenAB2 : 0;
            t = Math.max(0, Math.min(1, t));
            const closestPoint = prevPos.clone().addScaledVector(AB, t);
            const distSq = closestPoint.distanceToSquared(this.obstaclePosition);

            if (distSq < r * r) {
              const laserColor = (l.mesh.children[1] as THREE.Mesh)?.material instanceof THREE.MeshBasicMaterial
                ? ((l.mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()
                : 0xffaa00;
              this.createExplosionAt(closestPoint, laserColor, 2);
              this.createSparksAt(closestPoint, laserColor, 15);
              
              this.returnLaserToPool(l.mesh as THREE.Group);
              this.lasers.splice(i, 1);
              hitSomeone = true;
              break;
            }
          }
        }
      }

      // Collision with orbiting satellites (asteroids)
      if (!hitSomeone) {
        for (const o of orbitObjects) {
          if (!o.mesh || !o.mesh.visible || !o.mesh.userData) continue;
          const r = o.mesh.userData.radius || 15;
          
          o.mesh.getWorldPosition(this.obstaclePosition);
          const AC = this.obstaclePosition.clone().sub(prevPos);
          let t = lenAB2 > 0.0001 ? AC.dot(AB) / lenAB2 : 0;
          t = Math.max(0, Math.min(1, t));
          const closestPoint = prevPos.clone().addScaledVector(AB, t);
          const distSq = closestPoint.distanceToSquared(this.obstaclePosition);

          if (distSq < r * r) {
            const laserColor = (l.mesh.children[1] as THREE.Mesh)?.material instanceof THREE.MeshBasicMaterial
              ? ((l.mesh.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex()
              : 0xffaa00;
            this.createExplosionAt(closestPoint, laserColor, 1);
            this.createSparksAt(closestPoint, laserColor, 8);
            
            this.returnLaserToPool(l.mesh as THREE.Group);
            this.lasers.splice(i, 1);
            hitSomeone = true;
            break;
          }
        }
      }

      // Cleanup expired lasers
      if (!hitSomeone && l.life <= 0) {
        this.returnLaserToPool(l.mesh as THREE.Group);
        this.lasers.splice(i, 1);
      }
    }
  }

  public cleanup() {
    for (const l of this.lasers) {
      this.returnLaserToPool(l.mesh as THREE.Group);
    }
    this.lasers = [];
  }
}
