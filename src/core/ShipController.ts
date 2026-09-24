import * as THREE from 'three';
import { idleInput, type PilotInput, type SelfSnapshot } from '../network/shared/Protocol';
import { levelFlightDirection } from '../world/systems/FlightOrientation';
import { mobileFlightInput } from './MobileFlightInput';

declare global {
  interface Window {
    localPlayerBounty: number;
  }
}
window.localPlayerBounty = 50000;

type WeaponType = 'laser' | 'shotgun' | 'missile';

export class ShipController {
  public networkDrive?: (dt: number) => void;
  private networkTranslation = new THREE.Vector3();
  private wasNetworkCruising = false;
  public cruiseSpeed = 0;
  public warpIntensity = 0;
  private cruiseIntensity = 0;
  get cruiseEffectIntensity() { return this.cruiseIntensity; }
  public networkAction?: (type: string, data?: Record<string, unknown>) => void;
  public readPilotInput(seq: number, dt: number): PilotInput {
    if (this.inputBlocked || this.isTyping || this.isDead || document.hidden) return idleInput(seq);
    const input: PilotInput = { seq,
      x: this.keys.KeyA ? -1 : this.keys.KeyD ? 1 : this.touchMoveX,
      y: this.keys.Space ? 1 : (this.keys.KeyX || this.keys.ControlLeft) ? -1 : 0,
      z: this.keys.KeyW ? 1 : this.keys.KeyS ? -1 : this.touchFlight.thrust || this.touchMoveY,
      yaw: THREE.MathUtils.clamp(this.mouseInput.x + this.touchFlight.yaw, -1, 1),
      pitch: THREE.MathUtils.clamp(this.mouseInput.y + this.touchFlight.pitch, -1, 1), roll: (this.keys.KeyQ ? 1 : 0) - (this.keys.KeyE ? 1 : 0),
      boost: !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.touchBoost), stunt: this.isStunting ? this.stuntType : null };
    this.mouseInput.multiplyScalar(Math.pow(.005, dt)); this.isStunting = false; this.stuntType = null;
    return input;
  }
  public applyServerVitals(state: SelfSnapshot) {
    this.currentHP = state.hp; this.maxHP = state.maxHP; this.currentShield = state.shield; this.maxShield = state.maxHP;
    this.isDead = state.dead; this.subsystems = { ...state.subsystems }; window.localPlayerBounty = state.bounty;
  }
  public onRespawn?: () => void;
  private shipGroup: THREE.Group | null = null;
  private camera: THREE.PerspectiveCamera;

  // Key states
  private keys: { [key: string]: boolean } = {};
  
  // Mouse and Rotational Physics States
  private freeLookYaw = 0;
  private freeLookPitch = 0;
  public isFreeLooking = false;
  private targetQuaternion = new THREE.Quaternion();
  
  // Smooth Flight Rotations (Inertia)
  private angularVelocity = new THREE.Vector3(); // X: Pitch, Y: Yaw, Z: Roll
  private targetAngularVelocity = new THREE.Vector3();
  private rotationSpeed = 2.0; // Max turn rate rad/s
  private rotationAcceleration = 6.5; // Inertia responsiveness

  private mouseInput = new THREE.Vector2(); // Cumulative frame movement

  // Stunt states
  private stuntType: 'uturn' | 'rollLeft' | 'rollRight' | null = null;
  private lastAltPress = 0;
  private lastA = 0;
  private lastD = 0;
  private lastS = 0;
  private isStunting = false;
  private stuntTime = 0;

  // Ship dynamics
  public velocity = new THREE.Vector3();
  
  // Mobile Touch States
  public touchMoveY = 0; // -1 to 1 (Forward/Back)
  public touchMoveX = 0; // -1 to 1 (Strafe horizontal)
  public touchBoost = false;
  private touchFlight = mobileFlightInput(0, 0, false);
  get mobileInput() { return { ...this.touchFlight, firing: this.isPrimaryFireHeld }; }
  private maxSpeed = 550;
  private acceleration = 1800;
  private strafeAcceleration = 1500; // Maneuvering thrusters lateral/vertical strength
  private friction = 0.96; // Smooth outer space coasting drift
  
  // Sprint System
  public maxBoost = 100;
  public currentBoost = 100;
  public isBoosting = false;
  private boostExhausted = false;
  private shakeTime = 0;

  public viewMode: 'first' | 'third' = 'third';

  // Combat system
  public maxHP = 100;
  public currentHP = 100;
  public maxShield = 100;
  public currentShield = 100;
  public shieldRegenDelay = 0;
  public isDead = false;
  public isTyping = false;
  private inputBlocks = new Set<string>();
  public get inputBlocked() { return this.inputBlocks.size > 0; }
  public setInputBlocked(reason: string, blocked: boolean) {
    const wasBlocked = this.inputBlocked;
    if (blocked) this.inputBlocks.add(reason); else this.inputBlocks.delete(reason);
    if (this.inputBlocked) {
      this.keys = {}; this.mouseInput.set(0, 0); this.touchMoveX = 0; this.touchMoveY = 0;
      this.touchFlight = mobileFlightInput(0, 0, false);
      this.touchBoost = false; this.isBoosting = false; this.isFreeLooking = false;
      this.stopPrimaryFire();
    } else if (wasBlocked) {
      window.dispatchEvent(new CustomEvent('FlightInputResumed'));
    }
  }
  private spawnPosition = new THREE.Vector3();

  // Component Damage & Upgrade System (Sprint 4)
  public subsystems = {
    engines: 100,
    weapons: 100,
    shieldGenerator: 100
  };
  public activeWeapon: WeaponType = 'laser';
  public laserColor: 'red' | 'blue' = 'red';
  public hasShotgun: boolean = true;
  public hasMissile: boolean = true;
  private isPrimaryFireHeld = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.initListeners();
  }

  private selectWeapon(weapon: WeaponType): void {
    if (this.inputBlocked) return;
    this.activeWeapon = weapon;
    window.dispatchEvent(new CustomEvent<WeaponType>('WeaponChanged', { detail: weapon }));
  }

  private startPrimaryFire() {
    if (this.inputBlocked || this.isPrimaryFireHeld) return;
    this.isPrimaryFireHeld = true;
    window.dispatchEvent(new CustomEvent('PrimaryFireStart'));
  }

  private stopPrimaryFire() {
    if (!this.isPrimaryFireHeld) return;
    this.isPrimaryFireHeld = false;
    window.dispatchEvent(new CustomEvent('PrimaryFireEnd'));
  }

  public setSpawn(pos: THREE.Vector3, baseHP: number) {
    this.spawnPosition.copy(pos);
    this.maxHP = baseHP;
    this.currentHP = baseHP;
    this.maxShield = baseHP; // Shield matches HP baseline initially
    this.currentShield = baseHP;
    this.shieldRegenDelay = 0;
    this.isDead = false;
    this.subsystems = { engines: 100, weapons: 100, shieldGenerator: 100 };
    this.activeWeapon = 'laser';
    
    // Jump to spawn
    if (this.shipGroup) {
      this.shipGroup.position.copy(pos);
      this.velocity.set(0, 0, 0);
    }
  }

  public healShield(amount: number) {
    if (this.networkDrive) return;
    if (this.isDead) return;
    this.currentShield = Math.min(this.maxShield, this.currentShield + amount);
    // Visual effect could be dispatched here later
  }

  public takeDamage(amount: number): boolean {
    if (this.networkDrive) return this.isDead;
    if (this.isDead) return false;

    window.dispatchEvent(new CustomEvent('ShipDamaged', { detail: { amount } }));

    let hitHull = false;

    // Shield takes damage first
    if (this.currentShield > 0) {
      this.currentShield -= amount;
      this.shieldRegenDelay = 5.0; // 5 second interrupt
      if (this.currentShield < 0) {
        this.currentHP += this.currentShield; // Overflow damage to hull
        this.currentShield = 0;
        hitHull = true;
      }
    } else {
      this.currentHP -= amount;
      this.shieldRegenDelay = 5.0;
      hitHull = true;
    }

    // Apply subsystem component damage if hull took a hit
    if (hitHull && this.currentHP > 0) {
      const systems: ('engines' | 'weapons' | 'shieldGenerator')[] = ['engines', 'weapons', 'shieldGenerator'];
      const chosen = systems[Math.floor(Math.random() * systems.length)];
      const sysDamage = Math.floor(amount * 0.4 + Math.random() * amount * 0.4);
      this.subsystems[chosen] = Math.max(0, this.subsystems[chosen] - sysDamage);

      window.dispatchEvent(new CustomEvent('SubsystemDamaged', {
        detail: { system: chosen, health: this.subsystems[chosen] }
      }));
    }

    if (this.currentHP <= 0) {
      this.die();
      return true; // Returned true if this hit killed them
    }
    return false;
  }

  private die() {
    this.isDead = true;
    this.currentHP = 0;
    window.localPlayerBounty = 100; // Reset bounty on death
    this.keys = {};
    this.velocity.set(0, 0, 0);
    
    // Respawn after 5 seconds
    const respawningShip = this.shipGroup;
    setTimeout(() => {
      if (this.shipGroup && this.shipGroup === respawningShip) {
        this.shipGroup.position.copy(this.spawnPosition);
        // Randomize spawn slightly so they don't clip into base
        this.shipGroup.position.x += (Math.random() - 0.5) * 50;
        this.shipGroup.position.z += (Math.random() - 0.5) * 50;
        this.currentHP = this.maxHP;
        this.currentShield = this.maxShield;
        this.isDead = false;
        this.onRespawn?.();
        console.log("Respawned!");
      }
    }, 5000);
  }

  public shiftOrigin(delta: THREE.Vector3) {
    this.spawnPosition.sub(delta);
  }

  public clearShip() {
    this.resetTransitMotion();
    this.wasNetworkCruising = false;
    this.cruiseSpeed = 0; this.cruiseIntensity = 0;
    this.shipGroup = null;
    this.velocity.set(0, 0, 0);
    this.keys = {};
    this.stopPrimaryFire();
  }

  public setShip(shipGroup: THREE.Group) {
    this.shipGroup = shipGroup;
    this.targetQuaternion.copy(this.shipGroup.quaternion);
    this.velocity.set(0, 0, 0);
  }

  /** Travel changes motion without repairing the ship or resetting combat cooldowns. */
  public levelTransitOrientation() { if (this.shipGroup) levelFlightDirection(this.shipGroup.quaternion); }
  public resetTransitMotion() {
    this.velocity.set(0, 0, 0); this.angularVelocity.set(0, 0, 0); this.targetAngularVelocity.set(0, 0, 0);
    this.isStunting = false; this.stuntType = null; this.keys = {}; this.mouseInput.set(0, 0);
    this.touchMoveX = 0; this.touchMoveY = 0; this.touchBoost = false; this.isBoosting = false;
    this.touchFlight = mobileFlightInput(0, 0, false);
    this.stopPrimaryFire();
    if (this.shipGroup) this.targetQuaternion.copy(this.shipGroup.quaternion);
  }

  private initListeners() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return; // Let user type freely in chat and search inputs.
      if (this.isTyping || this.inputBlocked) return;

      // Prevent scrolling when pressing movement keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Space'].includes(e.code)) {
        e.preventDefault();
        // Snap camera back if flying blindly
        if (this.isFreeLooking) this.isFreeLooking = false;
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyV') {
        this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
      }
      if (e.code === 'Digit1') {
        this.selectWeapon('laser');
      }
      if (e.code === 'Digit2') {
        this.selectWeapon('shotgun');
      }
      if (e.code === 'Digit3') {
        this.selectWeapon('missile');
      }
      if (e.code === 'KeyC') {
        this.laserColor = this.laserColor === 'red' ? 'blue' : 'red';
        window.dispatchEvent(new CustomEvent('LaserColorChanged', { detail: this.laserColor }));
      }
      if (e.code === 'KeyT') {
        window.dispatchEvent(new CustomEvent('ToggleVoiceMute'));
      }
      
      const now = Date.now();

      if (e.code === 'KeyA') {
        if (now - this.lastA < 300 && !this.isStunting) {
          this.isStunting = true; this.stuntType = 'rollLeft'; this.stuntTime = 0;
        }
        this.lastA = now;
      }
      if (e.code === 'KeyD') {
        if (now - this.lastD < 300 && !this.isStunting) {
          this.isStunting = true; this.stuntType = 'rollRight'; this.stuntTime = 0;
        }
        this.lastD = now;
      }
      if (e.code === 'KeyS') {
        if (now - this.lastS < 300 && !this.isStunting) {
          this.isStunting = true; this.stuntType = 'uturn'; this.stuntTime = 0;
        }
        this.lastS = now;
      }

      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
          if (now - this.lastAltPress < 350 && !this.isStunting) {
            this.isStunting = true;
            this.stuntType = 'uturn';
            this.stuntTime = 0;
          }
        }
        this.lastAltPress = now;
      }
    });

    // Mobile Virtual Joystick Hooks
    window.addEventListener('TouchFlightInput', ((e: CustomEvent) => {
      if (this.inputBlocked) return;
      this.touchFlight = mobileFlightInput(e.detail.x, e.detail.y, e.detail.active);
    }) as EventListener);
    window.addEventListener('TouchFireStart', () => this.startPrimaryFire());
    window.addEventListener('TouchFireEnd', () => this.stopPrimaryFire());
    window.addEventListener('DualJoystickMove', ((e: CustomEvent) => {
      if (this.inputBlocked) return;
      this.touchMoveX = e.detail.x;
      this.touchMoveY = e.detail.y;
    }) as EventListener);

    window.addEventListener('DualJoystickLook', ((e: CustomEvent) => {
      this.addTouchLook(e.detail.dx, e.detail.dy);
    }) as EventListener);

    window.addEventListener('TouchBoostOn', () => { if (!this.inputBlocked) this.touchBoost = true; });
    window.addEventListener('TouchBoostOff', () => { this.touchBoost = false; });

    window.addEventListener('TouchStunt', () => {
      if (this.inputBlocked) return;
      if (!this.isStunting) {
        this.isStunting = true;
        this.stuntType = 'uturn'; // Default mobile stunt is U-Turn
        this.stuntTime = 0;
      }
    });

    window.addEventListener('keyup', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {}; // Clear stuck keys when clicking away!
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.touchFlight = mobileFlightInput(0, 0, false);
      this.touchBoost = false;
      this.isStunting = false;
      this.isBoosting = false;
      this.stopPrimaryFire();
    });

    window.addEventListener('mousedown', (e) => {
      if (this.inputBlocked) return;
      if (navigator.maxTouchPoints > 0) return; // Ignore general mousedown shooting on mobile devices!

      // Only ignore clicks if they hit UI elements
      const target = e.target as HTMLElement;
      if (target.closest('#auth-ui') || target.closest('#settings-menu') || target.closest('button') || target.closest('input')) return;

      if (e.button === 0) {
        if (document.pointerLockElement !== document.body && navigator.maxTouchPoints === 0) {
          try {
            const lockRequest = document.body.requestPointerLock();
            if (lockRequest && typeof lockRequest.catch === 'function') {
              void lockRequest.catch(() => undefined);
            }
          } catch {
            // Pointer lock can be denied by embedded browsers; firing should still work.
          }
        }
        if (this.isFreeLooking) this.isFreeLooking = false;
        this.startPrimaryFire();
      }
      if (e.button === 2 && document.pointerLockElement === document.body) {
        this.isFreeLooking = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.stopPrimaryFire();
      if (e.button === 2) this.isFreeLooking = false;
    });

    // Prevent context menu to allow Right Click free look
    window.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (this.inputBlocked) return;
      if (document.pointerLockElement === document.body && this.shipGroup && !this.isDead && !this.isStunting) {
        let dx = e.movementX;
        let dy = e.movementY;
        
        if (this.isFreeLooking) {
          this.freeLookYaw -= dx * 0.005;
          this.freeLookPitch -= dy * 0.005;
          this.freeLookPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.freeLookPitch));
        } else {
          // Accumulate mouse movements as pilot stick deflection (yaw/pitch rates)
          const sensitivity = 0.12; 
          this.mouseInput.x += -dx * sensitivity;
          this.mouseInput.y += -dy * sensitivity;
          
          // Clamp virtual stick to -1..1 range
          this.mouseInput.x = Math.max(-1.0, Math.min(1.0, this.mouseInput.x));
          this.mouseInput.y = Math.max(-1.0, Math.min(1.0, this.mouseInput.y));
        }
      }
    });

    window.addEventListener('ToggleLaserColor', () => {
      if (this.inputBlocked) return;
      this.laserColor = this.laserColor === 'red' ? 'blue' : 'red';
      window.dispatchEvent(new CustomEvent('LaserColorChanged', { detail: this.laserColor }));
    });

    window.addEventListener('CycleWeaponType', () => {
      if (this.activeWeapon === 'laser') this.selectWeapon('shotgun');
      else if (this.activeWeapon === 'shotgun') this.selectWeapon('missile');
      else this.selectWeapon('laser');
    });

    window.addEventListener('SelectWeaponType', (event) => {
      const weapon = (event as CustomEvent<WeaponType>).detail;
      if (weapon === 'laser' || weapon === 'shotgun' || weapon === 'missile') {
        this.selectWeapon(weapon);
      }
    });

    window.addEventListener('ToggleCameraView', () => {
      if (this.inputBlocked) return;
      this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    });
  }

  public addTouchLook(dx: number, dy: number) {
    if (!this.shipGroup || this.isDead || this.inputBlocked) return;
    
    if (this.isFreeLooking) {
      this.freeLookYaw -= dx * 0.005;
      this.freeLookPitch -= dy * 0.005;
      this.freeLookPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.freeLookPitch));
    } else {
      const sensitivity = 0.12; 
      this.mouseInput.x += -dx * sensitivity;
      this.mouseInput.y += -dy * sensitivity;
      
      this.mouseInput.x = Math.max(-1.0, Math.min(1.0, this.mouseInput.x));
      this.mouseInput.y = Math.max(-1.0, Math.min(1.0, this.mouseInput.y));
    }
  }

  public update(dt: number) {
    if (this.shipGroup && this.networkDrive) {
      const cruising = this.inputBlocks.has('stellar-cruise');
      this.networkTranslation.copy(this.shipGroup.position);
      this.networkDrive(dt);
      // Cruise crosses millions of units per second. Transport the camera with the
      // rendered displacement, including the final arrival, before its local spring.
      if (cruising || this.wasNetworkCruising) this.camera.position.add(this.networkTranslation.subVectors(this.shipGroup.position, this.networkTranslation));
      this.wasNetworkCruising = cruising;
      this.updateCamera(dt); return;
    }
    if (!this.shipGroup || this.isDead) return;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.shipGroup.quaternion);

    // Stunt Animations (Keep intact but align with physics)
    if (this.isStunting) {
      this.stuntTime += dt;
      
      const endStunt = () => {
         this.isStunting = false;
         const e = new THREE.Euler().setFromQuaternion(this.shipGroup!.quaternion, 'YXZ');
         e.z = 0;
         this.shipGroup!.quaternion.setFromEuler(e);
         this.angularVelocity.set(0, 0, 0);
      };

      if (this.stuntType === 'uturn' || !this.stuntType) {
        if (this.stuntTime < 0.75) {
           this.shipGroup.rotateX(Math.PI * dt / 0.75); // Pitch UP 180 
        } else if (this.stuntTime < 1.5) {
           this.shipGroup.rotateZ(Math.PI * dt / 0.75); // Roll 180 
        } else {
           endStunt();
        }
      } else if (this.stuntType === 'rollLeft') {
        if (this.stuntTime < 0.6) {
           this.shipGroup.rotateZ(Math.PI * 2 * dt / 0.6); // Full 360 roll left
        } else {
           endStunt();
        }
      } else if (this.stuntType === 'rollRight') {
        if (this.stuntTime < 0.6) {
           this.shipGroup.rotateZ(-Math.PI * 2 * dt / 0.6); // Full 360 roll right 
        } else {
           endStunt();
        }
      }

      this.targetQuaternion.copy(this.shipGroup.quaternion);
      
      // Preserve momentum + boost
      const thrustAccel = this.stuntType === 'uturn' ? this.acceleration * 4 : this.acceleration * 1.5;
      this.velocity.add(forward.clone().multiplyScalar(thrustAccel * dt));
      this.velocity.multiplyScalar(Math.pow(this.friction, dt * 60));
      this.shipGroup.position.addScaledVector(this.velocity, dt);
      this.updateCamera(dt);
      return; 
    }

    // ═══════════════════════════════════════════════════
    //   1. ROTATION DYNAMICS (Inertia + Damping)
    // ═══════════════════════════════════════════════════
    
    // Convert accumulated mouse input into target angular rates (yaw and pitch)
    this.targetAngularVelocity.x = THREE.MathUtils.clamp(this.mouseInput.y + this.touchFlight.pitch, -1, 1) * this.rotationSpeed;
    this.targetAngularVelocity.y = THREE.MathUtils.clamp(this.mouseInput.x + this.touchFlight.yaw, -1, 1) * this.rotationSpeed;

    // Manual roll using Q and E keys
    let rollInput = 0;
    if (this.keys['KeyQ']) rollInput += 1.0;
    if (this.keys['KeyE']) rollInput -= 1.0;
    this.targetAngularVelocity.z = rollInput * (this.rotationSpeed * 1.3);

    // Decay mouse input virtual stick back to center over time (flight dampening)
    // Decreases stick deflection when player stops moving physical mouse
    const mouseDecay = Math.pow(0.005, dt);
    this.mouseInput.multiplyScalar(mouseDecay);

    // Apply inertia: lerp current angular velocity to target angular velocity
    this.angularVelocity.lerp(this.targetAngularVelocity, dt * this.rotationAcceleration);

    // Apply local rotations based on angular velocity
    this.shipGroup.rotateX(this.angularVelocity.x * dt);
    this.shipGroup.rotateY(this.angularVelocity.y * dt);
    this.shipGroup.rotateZ(this.angularVelocity.z * dt);

    // Auto-horizon banking: lean ship into turning and lateral movements if not rolling manually
    const euler = new THREE.Euler().setFromQuaternion(this.shipGroup.quaternion, 'YXZ');
    let targetLean = 0;
    
    if (this.keys['KeyA'] || this.touchMoveX < -0.2) {
      targetLean += Math.PI / 5.0; // Dip left wing on lateral strafe
    }
    if (this.keys['KeyD'] || this.touchMoveX > 0.2) {
      targetLean -= Math.PI / 5.0; // Dip right wing on lateral strafe
    }
    
    // Add yaw-induced banking (leaning into the turn)
    targetLean += this.angularVelocity.y * 0.16;

    // Transit owns the quaternion; manual auto-banking would undo its smooth turn.
    if (!this.inputBlocks.has('stellar-cruise') && !this.inputBlocks.has('stellar-warp') && !this.keys['KeyQ'] && !this.keys['KeyE']) {
      euler.z = THREE.MathUtils.lerp(euler.z, targetLean, dt * 5.0);
      this.shipGroup.quaternion.setFromEuler(euler);
    }

    // Sprint System (Sprint Physics & CoolDown)
    if (this.currentBoost <= 0) {
      this.boostExhausted = true;
    } else if (this.currentBoost > 25) { 
      this.boostExhausted = false;
    }

    const wantsToBoost = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchBoost) && !this.boostExhausted && this.subsystems.engines >= 25;
    if (wantsToBoost && this.currentBoost > 0) {
      this.isBoosting = true;
      this.currentBoost -= dt * 35; 
    } else {
      this.isBoosting = false;
      this.currentBoost += dt * 15; 
    }
    this.currentBoost = Math.max(0, Math.min(this.maxBoost, this.currentBoost));

    // Shield Regeneration
    if (this.shieldRegenDelay > 0) {
      this.shieldRegenDelay -= dt;
    } else if (this.currentShield < this.maxShield && !this.isDead) {
      const shieldGenCondition = this.subsystems.shieldGenerator / 100;
      const regenModifier = shieldGenCondition < 0.5 ? 0.2 + shieldGenCondition * 1.6 : 1.0;
      this.currentShield = Math.min(this.maxShield, this.currentShield + dt * 15 * regenModifier);
    }

    // ═══════════════════════════════════════════════════
    //   2. 6DOF TRANSLATIONAL PHYSICAL MOVEMENT
    // ═══════════════════════════════════════════════════
    const engineCondition = this.subsystems.engines / 100;
    const engineModifier = engineCondition < 0.5 ? 0.4 + engineCondition * 1.2 : 1.0;

    const accel = (this.isBoosting ? this.acceleration * 1.8 : this.acceleration) * engineModifier;
    const limit = (this.isBoosting ? this.maxSpeed * 3.2 : this.maxSpeed) * engineModifier;

    const localThrust = new THREE.Vector3();

    // W/S: Forward / Backward thrust
    if (this.keys['KeyW'] || this.touchMoveY > 0.2 || this.touchFlight.thrust) {
      const val = this.touchFlight.thrust || (this.touchMoveY > 0.2 ? this.touchMoveY : 1.0);
      localThrust.z -= accel * val; // -Z is forward
    }
    if (this.keys['KeyS'] || this.touchMoveY < -0.2) {
      const val = this.touchMoveY < -0.2 ? Math.abs(this.touchMoveY) : 1.0;
      localThrust.z += accel * val;
    }

    // A/D: Horizontal Strafe (Slide sideways)
    if (this.keys['KeyA'] || this.touchMoveX < -0.2) {
      const val = this.touchMoveX < -0.2 ? Math.abs(this.touchMoveX) : 1.0;
      localThrust.x -= this.strafeAcceleration * val;
    }
    if (this.keys['KeyD'] || this.touchMoveX > 0.2) {
      const val = this.touchMoveX > 0.2 ? this.touchMoveX : 1.0;
      localThrust.x += this.strafeAcceleration * val;
    }

    // Space/KeyX/ControlLeft: Vertical Strafe (Slide up/down)
    if (this.keys['Space']) {
      localThrust.y += this.strafeAcceleration;
    }
    if (this.keys['KeyX'] || this.keys['ControlLeft']) {
      localThrust.y -= this.strafeAcceleration;
    }

    // Convert local thrust vector to global space coordinates
    const globalThrust = localThrust.clone().applyQuaternion(this.shipGroup.quaternion);
    this.velocity.addScaledVector(globalThrust, dt);

    // Clamp absolute velocity to limits
    if (this.velocity.length() > limit) {
      this.velocity.setLength(limit);
    }

    // Apply friction to create space drift / momentum loss (simulate flight assist)
    this.velocity.multiplyScalar(Math.pow(this.friction, dt * 60));

    // Move Ship
    this.shipGroup.position.addScaledVector(this.velocity, dt);

    // 3. Update Camera position and direction
    this.updateCamera(dt);
  }

  private updateCamera(dt: number) {
    if (!this.shipGroup) return;
    const cruiseTarget = this.cruiseSpeed > 0 ? Math.min(1, Math.log2(1 + this.cruiseSpeed / 2000) / 12) : 0;
    this.cruiseIntensity = THREE.MathUtils.damp(this.cruiseIntensity, cruiseTarget, cruiseTarget > this.cruiseIntensity ? 3 : 5, dt);
    let flightFov = 75;

    if (this.viewMode === 'third') {
      // Dynamic camera offset (pulls back based on velocity)
      const speed = Math.max(this.velocity.length(), this.cruiseSpeed);
      const speedRatio = Math.min(1.0, speed / this.maxSpeed);
      const motionRatio = this.cruiseSpeed > 0 ? .35 + this.cruiseIntensity * .65 : speedRatio;
      const dynamicDistance = 360 + motionRatio * 80 + this.cruiseIntensity * 45 + this.warpIntensity * 80;
      const offset = new THREE.Vector3(0, 125, dynamicDistance);
      
      // Decay free look if released
      if (!this.isFreeLooking) {
        this.freeLookYaw = THREE.MathUtils.lerp(this.freeLookYaw, 0, 0.15);
        this.freeLookPitch = THREE.MathUtils.lerp(this.freeLookPitch, 0, 0.15);
      }
      
      // Apply Free Look (Orbits logic)
      offset.applyAxisAngle(new THREE.Vector3(1,0,0), this.freeLookPitch);
      offset.applyAxisAngle(new THREE.Vector3(0,1,0), this.freeLookYaw);
      
      offset.applyQuaternion(this.shipGroup.quaternion);
      const targetPos = this.shipGroup.position.clone().add(offset);
      
      // Frame-rate independent spring-like interpolation (lerp)
      const cameraFollowSpeed = 6.5; 
      this.camera.position.lerp(targetPos, Math.min(1.0, dt * cameraFollowSpeed)); 
      
      const isCompletelyFront = (!this.isFreeLooking && Math.abs(this.freeLookYaw) < 0.05 && Math.abs(this.freeLookPitch) < 0.05);

      const lookTarget = this.shipGroup.position.clone();
      if (isCompletelyFront) {
         lookTarget.add(new THREE.Vector3(0, 120, -680).applyQuaternion(this.shipGroup.quaternion));
      }

      const currentLookAt = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion).add(this.camera.position);
      currentLookAt.lerp(lookTarget, Math.min(1.0, dt * 10.0));
      this.camera.lookAt(currentLookAt);

      // Smooth Dynamic Space stretching FOV
      flightFov = this.isBoosting ? 100 : 75 + motionRatio * 15 + this.cruiseIntensity * 4;

    } else {
      // First person: At the nose of the ship
      const offset = new THREE.Vector3(0, 3, -60); 
      offset.applyQuaternion(this.shipGroup.quaternion);
      this.camera.position.copy(this.shipGroup.position.clone().add(offset));
      
      const lookTarget = this.camera.position.clone().add(
        new THREE.Vector3(0, 0, -100).applyQuaternion(this.shipGroup.quaternion)
      );
      this.camera.lookAt(lookTarget);
    }

    const targetFov = THREE.MathUtils.lerp(flightFov, 103, this.warpIntensity);
    if (Math.abs(this.camera.fov - targetFov) > .05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt); this.camera.updateProjectionMatrix();
    }

    // Stage 4: Kinetic Camera Shake proportional to speed and active boost
    let shakeIntensity = 0;
    if (this.isBoosting) {
      shakeIntensity = 2.4; 
    } else {
      const speed = this.velocity.length();
      const speedRatio = Math.min(1.0, speed / this.maxSpeed);
      if (speedRatio > 0.6) {
        shakeIntensity = (speedRatio - 0.6) * 1.5; 
      }
    }
    
    if (shakeIntensity > 0) {
      this.shakeTime += dt * 45.0; // High-frequency vibration
      const shakeX = Math.sin(this.shakeTime) * Math.cos(this.shakeTime * 0.7) * shakeIntensity * 0.45;
      const shakeY = Math.cos(this.shakeTime * 1.1) * Math.sin(this.shakeTime * 1.3) * shakeIntensity * 0.45;
      const shakeZ = Math.sin(this.shakeTime * 0.9) * Math.cos(this.shakeTime * 1.5) * shakeIntensity * 0.2;
      
      const shakeVec = new THREE.Vector3(shakeX, shakeY, shakeZ);
      shakeVec.applyQuaternion(this.camera.quaternion);
      this.camera.position.add(shakeVec);
    }
  }
}
