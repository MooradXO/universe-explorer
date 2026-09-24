import * as THREE from 'three';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { CombatSystem } from './CombatSystem';

export interface BotState {
  id: string;
  class: 'Interceptor' | 'Bomber';
  state: 'PATROL' | 'CHASE' | 'EVASIVE';
  hp: number;
  maxHP: number;
  squadId: number;
  shootCooldown: number;
  evasiveTime: number;
  evasiveDirection: THREE.Vector3;
  velocity: THREE.Vector3;
  stuntType: 'rollLeft' | 'rollRight' | 'uturn' | null;
  stuntTime: number;
  wanderTarget: THREE.Vector3;
}

export class BotAI {
  private botStates: Map<string, BotState> = new Map();
  private maxGalaxyRadius = 25000;
  private readonly patrolCenter = new THREE.Vector3();
  private readonly obstaclePosition = new THREE.Vector3();
  
  constructor(
    private scene: THREE.Scene,
    private multiplayer: MultiplayerManager,
    private combatSystem: CombatSystem
  ) {}

  public shiftOrigin(delta: THREE.Vector3) {
    this.patrolCenter.sub(delta);
    for (const state of this.botStates.values()) state.wanderTarget.sub(delta);
  }

  public spawnBots(count: number, center = new THREE.Vector3()) {
    this.patrolCenter.copy(center);
    // Clear old bots if any
    for (const id of this.multiplayer.players.keys()) {
      if (id.startsWith('bot_')) {
        this.multiplayer.players.delete(id);
      }
    }
    this.botStates.clear();

    for (let i = 0; i < count; i++) {
      const id = `bot_${i}`;
      
      // 80% Interceptor, 20% Bomber
      const isBomber = Math.random() < 0.2;
      const botClass = isBomber ? 'Bomber' : 'Interceptor';
      const maxHP = isBomber ? 300 : 100;
      
      const startPos = new THREE.Vector3(
        (Math.random() - 0.5) * 30000,
        (Math.random() - 0.5) * 4000,
        (Math.random() - 0.5) * 30000
      );

      startPos.add(this.patrolCenter);
      const squadId = Math.floor(i / 5); // 5 bots per squad
      
      this.botStates.set(id, {
        id,
        class: botClass,
        state: 'PATROL',
        hp: maxHP,
        maxHP: maxHP,
        squadId,
        shootCooldown: Math.random() * 2,
        evasiveTime: 0,
        evasiveDirection: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        stuntType: null,
        stuntTime: 0,
        wanderTarget: new THREE.Vector3(
          (Math.random() - 0.5) * 30000,
          (Math.random() - 0.5) * 4000,
          (Math.random() - 0.5) * 30000
        ).add(this.patrolCenter)
      });

      // Synchronize with combatSystem bot HP
      this.combatSystem.botHP.set(id, maxHP);

      // Register in multiplayer players
      this.multiplayer.players.set(id, {
        id,
        username: `${botClass} Squadron [${squadId}] - Bot ${i}`,
        position: startPos.clone(),
        targetPosition: startPos.clone(),
        quaternion: new THREE.Quaternion(),
        targetQuaternion: new THREE.Quaternion(),
        lastUpdate: Date.now() + 99999999, // Never timeout
        bounty: isBomber ? 350 : 100
      });
    }
  }

  public update(dt: number, userShipGroup: THREE.Group | null, starMeshes: THREE.Mesh[]) {
    const playerPos = userShipGroup ? userShipGroup.position : null;
    const playerVel = userShipGroup ? (this.combatSystem as any).engine.shipController.velocity : new THREE.Vector3();
    
    // Group bot states by squad for flocking cohesion & alignment calculation
    const squads: Map<number, BotState[]> = new Map();
    for (const state of this.botStates.values()) {
      const squadId = state.squadId;
      if (!squads.has(squadId)) {
        squads.set(squadId, []);
      }
      squads.get(squadId)!.push(state);
    }

    for (const [id, state] of this.botStates.entries()) {
      const p = this.multiplayer.players.get(id);
      if (!p) {
        // Bot was killed/removed from multiplayer
        this.botStates.delete(id);
        continue;
      }

      // Synchronize hit damage from CombatSystem
      const currentHP = this.combatSystem.botHP.get(id);
      if (currentHP !== undefined && currentHP !== state.hp) {
        // Took damage! Trigger Evasive maneuver immediately!
        if (state.state !== 'EVASIVE') {
          state.state = 'EVASIVE';
          state.evasiveTime = 1.2; // 1.2s of aggressive evading
          state.evasiveDirection.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          ).normalize();
          state.stuntType = Math.random() < 0.5 ? 'rollLeft' : 'rollRight';
          state.stuntTime = 0;
        }
        state.hp = currentHP;
      }

      // Decrement shoot cooldown
      if (state.shootCooldown > 0) state.shootCooldown -= dt;

      const steer = new THREE.Vector3();
      const distanceToPlayerSq = playerPos ? p.position.distanceToSquared(playerPos) : 999999999999;

      const isBossEscort = id.startsWith('bot_boss_escort_');
      const isBossFlagship = id === 'bot_boss_flagship';

      // ═══════════════════════════════════════════════════
      //   TACTICAL BOSS ESCORT BEHAVIOR (Sprint 6)
      // ═══════════════════════════════════════════════════
      if (isBossEscort && state.state !== 'EVASIVE') {
        const bossP = this.multiplayer.players.get('bot_boss_flagship');
        if (bossP) {
          const escortIdx = parseInt(id.replace('bot_boss_escort_', '')) || 0;
          const angle = (escortIdx / 6) * Math.PI * 2 + (Date.now() * 0.0003); // Slow orbit rotation

          // Form a beautiful rotating hexagon ring around the flagship
          const offset = new THREE.Vector3(
            Math.cos(angle) * 450,
            Math.sin(angle * 2) * 50, // Gentle vertical wave
            Math.sin(angle) * 450
          );

          // Rotate offset with boss flagship's orientation
          offset.applyQuaternion(bossP.quaternion);
          const targetPos = bossP.position.clone().add(offset);

          const toTarget = targetPos.clone().sub(p.position);
          const distToTarget = toTarget.length();

          // If the player is extremely close (< 2200), peel off to intercept! (2200^2 = 4840000)
          if (playerPos && distanceToPlayerSq < 4840000) {
            const chaseForce = playerPos.clone().sub(p.position).normalize().multiplyScalar(650);
            steer.add(chaseForce);
          } else {
            // Otherwise, fly perfectly in defensive formation
            const formationSpeed = distToTarget > 150 ? 550 : distToTarget * 3.5;
            const steerForce = toTarget.normalize().multiplyScalar(formationSpeed);
            steer.add(steerForce);
          }

          // Firing check for escorts while in formation (4000^2 = 16000000)
          if (playerPos && distanceToPlayerSq < 16000000 && state.shootCooldown <= 0) {
            this.botShoot(state, p, playerPos);
          }
        }
      }

      if ((!isBossEscort || !this.multiplayer.players.has('bot_boss_flagship')) && state.state !== 'EVASIVE') {
        // FSM state transitions & steering force
        if (state.state === 'CHASE') {
          if (!playerPos || distanceToPlayerSq > 64000000) { // 8000^2 = 64000000
            state.state = 'PATROL';
          } else {
            const targetOffset = new THREE.Vector3();
            
            if (state.class === 'Interceptor') {
              // Chase logic: get behind player, weave slightly
              targetOffset.copy(playerPos).addScaledVector(playerVel, 0.5); // intercept projection
              // Add a small weaving sine offset for fluid attack runs
              const weave = Math.sin(Date.now() * 0.003 + state.squadId) * 150;
              targetOffset.x += weave;
              targetOffset.y += Math.cos(Date.now() * 0.003) * 50;
              
              const chaseForce = targetOffset.clone().sub(p.position).normalize().multiplyScalar(650);
              steer.add(chaseForce);
              
              // Firing check (3500^2 = 12250000)
              if (distanceToPlayerSq < 12250000 && state.shootCooldown <= 0) {
                this.botShoot(state, p, playerPos);
              }
            } else {
              // Bomber logic: keep distance, face player, fire massive shots
              const speedApproach = isBossFlagship ? 150 : 400;
              const speedBackaway = isBossFlagship ? 180 : 500;

              if (distanceToPlayerSq > 16000000) { // 4000^2 = 16000000
                const approach = playerPos.clone().sub(p.position).normalize().multiplyScalar(speedApproach);
                steer.add(approach);
              } else if (distanceToPlayerSq < 4000000) { // 2000^2 = 4000000
                const backaway = p.position.clone().sub(playerPos).normalize().multiplyScalar(speedBackaway);
                steer.add(backaway);
              }
              
              // Firing check
              const fireDist = isBossFlagship ? 6500 : 5000;
              if (distanceToPlayerSq < (fireDist * fireDist) && state.shootCooldown <= 0) {
                this.botShoot(state, p, playerPos);
              }
            }
          }
        } else {
          // PATROL state
          const chaseThreshold = state.class === 'Interceptor' ? 25000000 : 49000000; // 5000^2, 7000^2
          if (playerPos && distanceToPlayerSq < chaseThreshold) {
            state.state = 'CHASE';
          } else {
            // Wander behavior (500^2 = 250000)
            if (Math.random() < 0.005 || p.position.distanceToSquared(state.wanderTarget) < 250000) {
              state.wanderTarget.set(
                (Math.random() - 0.5) * 30000,
                (Math.random() - 0.5) * 4000,
                (Math.random() - 0.5) * 30000
              ).add(this.patrolCenter);
            }
            const wanderForce = state.wanderTarget.clone().sub(p.position).normalize().multiplyScalar(200);
            steer.add(wanderForce);
          }
        }
      }

      // ═══════════════════════════════════════════════════
      //   BOIDS FLOCKING (Cohesion, Alignment, Separation)
      // ═══════════════════════════════════════════════════
      const squadMates = squads.get(state.squadId) || [];
      if (squadMates.length > 1 && state.state !== 'EVASIVE') {
        const cohesion = new THREE.Vector3();
        const alignment = new THREE.Vector3();
        const separation = new THREE.Vector3();
        let mateCount = 0;

        const isBossSquad = state.squadId === 999;
        
        for (const mate of squadMates) {
          if (mate.id === state.id) continue;
          const mateP = this.multiplayer.players.get(mate.id);
          if (!mateP) continue;
          
          const dSq = p.position.distanceToSquared(mateP.position);
          if (dSq < 6250000) { // 2500^2 = 6250000
            if (!isBossSquad) { // Skip cohesion/alignment for boss formation to prevent clumping
              cohesion.add(mateP.position);
              alignment.add(mate.velocity);
              mateCount++;
            }
          }
          
          // Separation from any bot (wider for boss squad)
          const minSep = isBossSquad ? 700 : 450;
          const minSepSq = minSep * minSep;
          if (dSq < minSepSq) {
            const d = Math.sqrt(dSq);
            const diff = p.position.clone().sub(mateP.position).normalize().divideScalar(d > 0.01 ? d : 0.01);
            separation.add(diff);
          }
        }
        
        if (mateCount > 0 && !isBossSquad) {
          // Cohesion
          cohesion.divideScalar(mateCount).sub(p.position).normalize().multiplyScalar(80);
          steer.add(cohesion);
          // Alignment
          alignment.divideScalar(mateCount).normalize().multiplyScalar(60);
          steer.add(alignment);
        }
        // Separation force (stronger for boss squad)
        if (separation.lengthSq() > 0.0001) {
          const sepWeight = isBossSquad ? 450 : 150;
          steer.add(separation.normalize().multiplyScalar(sepWeight));
        }
      }

      // ═══════════════════════════════════════════════════
      //   OBSTACLE & BOUNDARY AVOIDANCE
      // ═══════════════════════════════════════════════════
      // 1. Planet collisions avoidance
      for (const star of starMeshes) {
        if (!star || !star.userData || star.userData.isBaseShip || star.userData.isStar) continue;
        const radius = star.userData.radius || 150;
        const dangerZone = radius + 600;
        const dangerZoneSq = dangerZone * dangerZone;
        star.getWorldPosition(this.obstaclePosition);
        const distSq = p.position.distanceToSquared(this.obstaclePosition);
        if (distSq < dangerZoneSq) {
          const dist = Math.sqrt(distSq);
          const avoidForce = p.position.clone().sub(this.obstaclePosition).normalize().multiplyScalar(400 * (dangerZone / (dist + 1)));
          steer.add(avoidForce);
        }
      }

      // 2. Keep this squad near its patrol center, independently of render origin
      const centerDist = p.position.distanceTo(this.patrolCenter);
      if (centerDist > this.maxGalaxyRadius) {
        const returnForce = this.patrolCenter.clone().sub(p.position).normalize().multiplyScalar(300);
        steer.add(returnForce);
      }

      // Apply steering force to velocity
      let maxSpeed = state.class === 'Interceptor' ? 550 : 350;
      if (isBossFlagship) maxSpeed = 150; // Majestic slow flagship

      state.velocity.addScaledVector(steer, dt * 2);
      if (state.velocity.length() > maxSpeed) {
        state.velocity.setLength(maxSpeed);
      }

      // Apply drag
      state.velocity.multiplyScalar(Math.pow(0.97, dt * 60));

      // Move bot
      p.position.addScaledVector(state.velocity, dt);
      p.targetPosition.copy(p.position); // LERP directly uses position to bypass remote interpolation lag!

      // Face the movement direction smoothly
      if (state.velocity.lengthSq() > 0.01 && state.state !== 'EVASIVE') {
        const dir = state.velocity.clone().normalize();
        if (state.state === 'CHASE' && playerPos) {
          // Face the player when attacking
          dir.copy(playerPos).sub(p.position).normalize();
        }
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
        p.quaternion.slerp(targetQuat, dt * 4.5);
      }
      p.targetQuaternion.copy(p.quaternion);
    }
  }

  private botShoot(state: BotState, p: any, playerPos: THREE.Vector3) {
    const isBoss = state.id === 'bot_boss_flagship';
    
    // Set custom boss fight shoot cooldown loops
    state.shootCooldown = isBoss 
      ? 1.8 + Math.random() * 0.6 
      : (state.class === 'Interceptor' ? 0.65 + Math.random() * 0.5 : 1.5 + Math.random() * 1.0);

    // Firing direction with slight randomized inaccuracy
    const dir = playerPos.clone().sub(p.position).normalize();
    const inaccuracy = isBoss ? 0.015 : (state.class === 'Interceptor' ? 0.04 : 0.02);
    dir.x += (Math.random() - 0.5) * inaccuracy;
    dir.y += (Math.random() - 0.5) * inaccuracy;
    dir.z += (Math.random() - 0.5) * inaccuracy;
    dir.normalize();

    // ═══════════════════════════════════════════════════
    //   BOSS SPECIAL BARRAGES (Sprint 6)
    // ═══════════════════════════════════════════════════
    if (isBoss) {
      const choice = Math.random();
      const soundVolume = 0.8;

      if (choice < 0.65) {
        // 1. HEAVY PLASMIC BLAST (Giant Purple Shot)
        const laserColorHex = 0xcc22ff;
        const height = 130;
        const laser = this.combatSystem.createVolumetricLaser(laserColorHex, height, false);
        laser.scale.set(6.0, 1.0, 6.0); // Thick cosmic plasma bolt

        laser.position.copy(p.position);
        laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // Perfect alignment along direction (no rotateX)

        this.scene.add(laser);

        const velocity = dir.clone().multiplyScalar(2200).add(state.velocity);
        this.combatSystem.lasers.push({
          mesh: laser,
          velocity,
          life: 2.8,
          ownerId: state.id,
          lastPosition: laser.position.clone()
        });
        this.combatSystem.playWeaponAt('laser', 'blue', soundVolume, p.position);

      } else if (choice < 0.90) {
        // 2. PLASMIC SPREAD FLURRY (3 fanned out bolts)
        const laserColorHex = 0xee22ff;
        const angles = [-0.18, 0, 0.18];
        
        for (const angle of angles) {
          const spreadDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
          const laser = this.combatSystem.createVolumetricLaser(laserColorHex, 120, false);
          laser.scale.set(4.0, 1.0, 4.0);

          laser.position.copy(p.position);
          laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spreadDir);

          this.scene.add(laser);

          const velocity = spreadDir.clone().multiplyScalar(2000).add(state.velocity);
          this.combatSystem.lasers.push({
            mesh: laser,
            velocity,
            life: 2.8,
            ownerId: state.id,
            lastPosition: laser.position.clone()
          });
        }
        this.combatSystem.playWeaponAt('shotgun', 'red', soundVolume, p.position);

      } else {
        // 3. ANOMALOUS HOMING TORPEDO (Pulsing Purple Missiles)
        const laserColorHex = 0xbb00ff;
        
        const group = new THREE.Group();
        const coreGeo = new THREE.CylinderGeometry(10, 10, 80, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
        group.add(new THREE.Mesh(coreGeo, coreMat));

        const glowGeo = new THREE.CylinderGeometry(20, 20, 80, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color: laserColorHex, transparent: true, opacity: 0.8,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        group.add(new THREE.Mesh(glowGeo, glowMat));

        group.position.copy(p.position);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        this.scene.add(group);

        const velocity = dir.clone().multiplyScalar(1700).add(state.velocity);
        this.combatSystem.lasers.push({
          mesh: group,
          velocity,
          life: 4.5,
          ownerId: state.id,
          lastPosition: group.position.clone(),
          isHoming: true
        });
        this.combatSystem.playWeaponAt('missile', 'blue', soundVolume, p.position);
      }
    } else {
      // ═══════════════════════════════════════════════════
      //   STANDARD BOT SHOOT (Correctly aligned, no rotateX)
      // ═══════════════════════════════════════════════════
      const laserColorHex = state.class === 'Interceptor' ? 0xff2222 : 0xaa22ff;
      const height = state.class === 'Interceptor' ? 120 : 130; // Shortened from 250 to make it neat
      
      const laser = this.combatSystem.createVolumetricLaser(laserColorHex, height, false);
      
      if (state.class === 'Bomber') {
        laser.scale.set(3.0, 1.0, 3.0); // Fat plasma slug
      }

      laser.position.copy(p.position);
      laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // Point Y-axis directly along dir (aligned!)

      this.scene.add(laser);

      const laserSpeed = state.class === 'Interceptor' ? 3200 : 2200;
      const velocity = dir.clone().multiplyScalar(laserSpeed).add(state.velocity);

      this.combatSystem.lasers.push({
        mesh: laser,
        velocity,
        life: 2.5,
        ownerId: state.id,
        lastPosition: laser.position.clone()
      });

      // Play procedural audio if close enough (5000^2 = 25000000)
      const distSq = p.position.distanceToSquared(playerPos);
      if (distSq < 25000000) {
        this.combatSystem.playWeaponAt('laser', state.class === 'Interceptor' ? 'red' : 'blue', .45, p.position);
      }
    }
  }
}
