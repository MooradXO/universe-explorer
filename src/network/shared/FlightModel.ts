import * as THREE from 'three';
import type { FlightSnapshot, PilotInput, Stunt } from './Protocol';

/** Flight rules shared by server and local prediction. No DOM, rendering or network. */
export class FlightModel {
  readonly transform = new THREE.Object3D();
  readonly velocity = new THREE.Vector3();
  private angularVelocity = new THREE.Vector3();
  private targetAngularVelocity = new THREE.Vector3();
  private targetQuaternion = new THREE.Quaternion();
  private mouseInput = new THREE.Vector2();
  private keys: Record<string, boolean> = {};
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchBoost = false;
  private maxSpeed = 550;
  private acceleration = 1800;
  private strafeAcceleration = 1500;
  private friction = .96;
  private rotationSpeed = 2;
  private rotationAcceleration = 6.5;
  private isStunting = false;
  private stuntType: Stunt = null;
  private stuntTime = 0;
  private boostExhausted = false;
  maxBoost = 100;
  currentBoost = 100;
  isBoosting = false;
  subsystems = { engines: 100 };
  get position() { return this.transform.position; }
  get quaternion() { return this.transform.quaternion; }
  resetMotion() { this.velocity.set(0,0,0); this.angularVelocity.set(0,0,0); this.isStunting=false; this.stuntType=null; this.stuntTime=0; }
  snapshot(): FlightSnapshot { return { p:this.position.toArray(), q:this.quaternion.toArray(), v:this.velocity.toArray(),
    a:this.angularVelocity.toArray(), boost:this.currentBoost, exhausted:this.boostExhausted, boosting:this.isBoosting,
    stunt:this.isStunting?this.stuntType:null, stuntTime:this.stuntTime, engines:this.subsystems.engines }; }
  restore(s: FlightSnapshot) { this.position.fromArray(s.p); this.quaternion.fromArray(s.q); this.velocity.fromArray(s.v);
    this.angularVelocity.fromArray(s.a); this.currentBoost=s.boost; this.boostExhausted=s.exhausted; this.isBoosting=s.boosting;
    this.stuntType=s.stunt; this.isStunting=s.stunt!==null; this.stuntTime=s.stuntTime; this.subsystems.engines=s.engines; }
  step(input: PilotInput, dt: number) {
    dt = Math.max(0,Math.min(.05,dt));
    this.keys={KeyW:input.z>=1,KeyS:input.z<=-1,KeyA:input.x<=-1,KeyD:input.x>=1,Space:input.y>0,KeyX:input.y<0,
      KeyQ:input.roll>0,KeyE:input.roll<0,ShiftLeft:input.boost};
    this.touchMoveX=input.x; this.touchMoveY=input.z; this.mouseInput.set(input.yaw,input.pitch);
    if(input.stunt&&!this.isStunting) { this.isStunting=true;this.stuntType=input.stunt;this.stuntTime=0; }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.transform.quaternion);

    // Stunt Animations (Keep intact but align with physics)
    if (this.isStunting) {
      this.stuntTime += dt;

      const endStunt = () => {
         this.isStunting = false;
         const e = new THREE.Euler().setFromQuaternion(this.transform.quaternion, 'YXZ');
         e.z = 0;
         this.transform.quaternion.setFromEuler(e);
         this.angularVelocity.set(0, 0, 0);
      };

      if (this.stuntType === 'uturn' || !this.stuntType) {
        if (this.stuntTime < 0.75) {
           this.transform.rotateX(Math.PI * dt / 0.75); // Pitch UP 180
        } else if (this.stuntTime < 1.5) {
           this.transform.rotateZ(Math.PI * dt / 0.75); // Roll 180
        } else {
           endStunt();
        }
      } else if (this.stuntType === 'rollLeft') {
        if (this.stuntTime < 0.6) {
           this.transform.rotateZ(Math.PI * 2 * dt / 0.6); // Full 360 roll left
        } else {
           endStunt();
        }
      } else if (this.stuntType === 'rollRight') {
        if (this.stuntTime < 0.6) {
           this.transform.rotateZ(-Math.PI * 2 * dt / 0.6); // Full 360 roll right
        } else {
           endStunt();
        }
      }

      this.targetQuaternion.copy(this.transform.quaternion);

      // Preserve momentum + boost
      const thrustAccel = this.stuntType === 'uturn' ? this.acceleration * 4 : this.acceleration * 1.5;
      this.velocity.add(forward.clone().multiplyScalar(thrustAccel * dt));
      this.velocity.multiplyScalar(Math.pow(this.friction, dt * 60));
      this.transform.position.addScaledVector(this.velocity, dt);

      return;
    }

    // ═══════════════════════════════════════════════════
    //   1. ROTATION DYNAMICS (Inertia + Damping)
    // ═══════════════════════════════════════════════════

    // Convert accumulated mouse input into target angular rates (yaw and pitch)
    this.targetAngularVelocity.x = this.mouseInput.y * this.rotationSpeed;
    this.targetAngularVelocity.y = this.mouseInput.x * this.rotationSpeed;

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
    this.transform.rotateX(this.angularVelocity.x * dt);
    this.transform.rotateY(this.angularVelocity.y * dt);
    this.transform.rotateZ(this.angularVelocity.z * dt);

    // Auto-horizon banking: lean ship into turning and lateral movements if not rolling manually
    const euler = new THREE.Euler().setFromQuaternion(this.transform.quaternion, 'YXZ');
    let targetLean = 0;

    if (this.keys['KeyA'] || this.touchMoveX < -0.2) {
      targetLean += Math.PI / 5.0; // Dip left wing on lateral strafe
    }
    if (this.keys['KeyD'] || this.touchMoveX > 0.2) {
      targetLean -= Math.PI / 5.0; // Dip right wing on lateral strafe
    }

    // Add yaw-induced banking (leaning into the turn)
    targetLean += this.angularVelocity.y * 0.16;

    if (!this.keys['KeyQ'] && !this.keys['KeyE']) {
      euler.z = THREE.MathUtils.lerp(euler.z, targetLean, dt * 5.0);
      this.transform.quaternion.setFromEuler(euler);
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

    const engineCondition = this.subsystems.engines / 100;
    const engineModifier = engineCondition < 0.5 ? 0.4 + engineCondition * 1.2 : 1.0;

    const accel = (this.isBoosting ? this.acceleration * 1.8 : this.acceleration) * engineModifier;
    const limit = (this.isBoosting ? this.maxSpeed * 3.2 : this.maxSpeed) * engineModifier;

    const localThrust = new THREE.Vector3();

    // W/S: Forward / Backward thrust
    if (this.keys['KeyW'] || this.touchMoveY > 0.2) {
      const val = this.touchMoveY > 0.2 ? this.touchMoveY : 1.0;
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
    const globalThrust = localThrust.clone().applyQuaternion(this.transform.quaternion);
    this.velocity.addScaledVector(globalThrust, dt);

    // Clamp absolute velocity to limits
    if (this.velocity.length() > limit) {
      this.velocity.setLength(limit);
    }

    // Apply friction to create space drift / momentum loss (simulate flight assist)
    this.velocity.multiplyScalar(Math.pow(this.friction, dt * 60));

    // Move Ship
    this.transform.position.addScaledVector(this.velocity, dt);

    // 3. Update Camera position and direction

  }
}
