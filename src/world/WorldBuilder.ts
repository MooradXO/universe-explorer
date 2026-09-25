import * as THREE from 'three';
// @ts-ignore
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SoundManager } from '../core/SoundManager';
import { Engine } from '../core/Engine';
import { UIManager } from '../ui/UIManager';
import { createBaseShipLabel } from '../ui/BaseShipLabel';
import { AuthManager } from '../auth/AuthManager';
import { MultiplayerManager } from '../network/MultiplayerManager';
import { ISSSatellite } from './ISSSatellite';
import { VoyagerProbe } from './VoyagerProbe';
import { CinematicSystem } from './CinematicSystem';
import { SpaceWorld } from './space/SpaceWorld';
import { StellarTravel } from './systems/StellarTravel';
import { SOLAR_SYSTEM, systemArrival, type SystemDescriptor } from './systems/SystemDescriptor';
import type { MapObject } from '../catalog/StarMapData';
import { shiftSceneOrigin } from './space/shiftSceneOrigin';
import { worldPosition, type WorldPosition } from './space/WorldPosition';
import { createPlanetCatalog } from './celestial/PlanetCatalog';
import { SpaceSmokeTour } from '../debug/SpaceSmokeTour';
import { CombatSystem } from './CombatSystem';
import { EffectsManager } from './EffectsManager';
import { ApprovedFlightFX } from './visuals/ApprovedFlightFX';
import { BlackHole } from './BlackHole';
import { BotAI } from './BotAI';
import { Settings } from '../core/Settings';
import type { VoiceChatManager } from '../network/VoiceChatManager';
import { faceFlightDirection, steerFlightDirection } from './systems/FlightOrientation';
import { loadModelClone } from './ModelLoader';
import { createModelInstances } from './ModelInstances';
import { ShipEngineVFX } from './ShipEngineVFX';
import { getSpaceSmokeState, SPACE_SMOKE_BASE } from '../debug/SpaceSmokeState';
import {
  BASE_STATION_VISUAL,
  BOT_BOMBER_VISUAL,
  BOT_INTERCEPTOR_VISUAL,
  PLAYER_SHIP_VISUAL,
  ShipVisualConfig
} from './ShipVisualConfig';

// Legacy landmarks occupy the home sector; procedural space has no finite cube.
const WORLD_SIZE = 50000;

export class WorldBuilder {
  private engine: Engine;
  private ui: UIManager;
  
  private starMeshes: THREE.Mesh[] = [];
  private starGlow: THREE.Texture;
  private elapsed = 0;
  
  private space!: SpaceWorld;
  private travel: StellarTravel | null = null;
  private stellarLight: THREE.DirectionalLight | null = null;
  private stellarAmbient=new THREE.AmbientLight(0x556677,4.0);
  private coreLandmarks = new THREE.Group();
  private readonly smokeTour = new SpaceSmokeTour();
  private originShifted = false;
  private combatSystem!: CombatSystem;
  private effects!: EffectsManager;
  private flightFX: ApprovedFlightFX | null = null;
  private blackHole!: BlackHole;
  private botAI!: BotAI;
  public voiceChat: VoiceChatManager | null = null;
  private voiceChatLoadVersion = 0;
  
  private userShipGroup: THREE.Group | null = null;
  private soundManager = new SoundManager();
  private baseLabels: { group: THREE.Object3D; dom: HTMLElement }[] = [];
  private userEngineVFX: ShipEngineVFX | null = null;
  private iss: ISSSatellite | null = null;
  private voyager: VoyagerProbe | null = null;
  
  // Wormhole Portal & Boss System (Sprint 6) - Removed
  private bossGroup: THREE.Group | null = null;
  public bossShieldMesh: THREE.Mesh | null = null;
  
  // Multiplayer
  public multiplayer = new MultiplayerManager();
  private lod0Mesh: THREE.InstancedMesh | null = null;
  private lod1Mesh: THREE.InstancedMesh | null = null;
  private botInterceptorMesh: THREE.InstancedMesh | null = null;
  private botBomberMesh: THREE.InstancedMesh | null = null;
  private lod2Sprites: Map<string, THREE.Sprite> = new Map();
  private botLabels: Map<string, any> = new Map();
  private maxInstances = 2000;
  
  private cameraFrustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();

  private dummyObj = new THREE.Object3D();
  private fixQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    PLAYER_SHIP_VISUAL.rotation[0],
    PLAYER_SHIP_VISUAL.rotation[1],
    PLAYER_SHIP_VISUAL.rotation[2]
  ));
  private authManager: any = null;
  private baseShipGroup: THREE.Group | null = null;
  private cinematicSystem!: CinematicSystem;
  private isPrimaryFireHeld = false;
  private hudUpdateAccumulator = 0;
  private spatialUpdateAccumulator = 0;
  private readonly smokeState = getSpaceSmokeState(window.location.search);

  constructor(engine: Engine, ui: UIManager) {
    this.engine = engine;
    this.ui = ui;

    this.engine.scene.add(this.stellarAmbient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight.position.set(1, 1, 1).normalize();
    this.stellarLight = dirLight;
    this.engine.scene.add(dirLight);
    
    this.starGlow = this.makeCleanGlow();

    // 2. Planets & Combat systems
    this.space = new SpaceWorld(this.engine, this.starMeshes);
    this.multiplayer.setCoordinateFrame(this.space.origin);
    
    this.combatSystem = new CombatSystem(
      this.engine,
      this.soundManager,
      this.ui,
      this.multiplayer,
      this.makeBgDot()
    );
    (this.combatSystem as any).worldBuilder = this;

    // 3. Volumetric Particle Effects (Space dust, Thruster trails)
    this.effects = new EffectsManager(this.engine, this.makeBgDot());
    this.effects.init();

    // NASA ISS
    this.iss = new ISSSatellite(this.engine.scene, 2500);
    this.starMeshes.push(this.iss.mesh.children[3] as THREE.Mesh);

    // Voyager 1
    this.voyager = new VoyagerProbe(this.engine.scene);
    this.starMeshes.push(this.voyager.mesh.children[11] as THREE.Mesh);

    // Gargantua Black Hole Singularity at (0, 0, 0)
    this.blackHole = new BlackHole(this.engine);
    this.starMeshes.push(this.blackHole.eventHorizon);
    this.coreLandmarks.name = "home-landmarks";
    this.coreLandmarks.add(this.iss.mesh, this.voyager.mesh, this.blackHole.group);
    this.engine.scene.add(this.coreLandmarks);

    this.setupGameplayEvents();

    this.cinematicSystem = new CinematicSystem(this.engine, this.soundManager);
    this.cinematicSystem.initCinematicObjects();

    this.botAI = new BotAI(this.engine.scene, this.multiplayer, this.combatSystem);
    this.engine.shipController.onRespawn = () => {
      if (this.travel) { this.travel.returnToBase(true); return; }
      if (this.userShipGroup) this.relocateShip(this.space.origin.toWorld(this.userShipGroup.position.toArray() as [number, number, number]));
    };

  }

  private firePrimaryWeapon() {
    if (!this.engine.shipController.combatEnabled) return;
    this.travel?.stopCruise('Обычный полёт.');
    if (this.engine.shipController.inputBlocked) return;
    this.combatSystem.shootLaser(
      this.userShipGroup,
      this.authManager?.profile?.id,
      this.engine.shipController.velocity
    );
  }

  private setupGameplayEvents() {
    window.addEventListener('StartAmbient', () => this.soundManager.startAmbient());
    window.addEventListener('keydown', () => {
      if (!this.engine.shipController.isTyping) this.soundManager.startAmbient();
    });

    window.addEventListener('ChatFocus', () => {
      this.engine.shipController.isTyping = true;
    });

    window.addEventListener('ChatBlur', () => {
      this.engine.shipController.isTyping = false;
    });

    window.addEventListener('SendChatMessage', (e: Event) => {
      const msg = (e as CustomEvent).detail;
      this.multiplayer.broadcastChat(msg);
      this.ui.addChatMessage(this.authManager?.profile?.username || 'Pilot', msg);
    });

    window.addEventListener('LeftClickShoot', () => {
      this.firePrimaryWeapon();
    });

    window.addEventListener('PrimaryFireStart', () => {
      if (this.engine.shipController.inputBlocked) return;
      this.isPrimaryFireHeld = true;
      this.firePrimaryWeapon();
    });

    window.addEventListener('PrimaryFireEnd', () => {
      this.isPrimaryFireHeld = false;
    });

    window.addEventListener('pointerdown', () => {
      this.soundManager.startAmbient();
    });

    window.addEventListener('SpawnBots', () => {
      if (!this.engine.shipController.combatEnabled) return;
      if (this.userShipGroup) {
        if (this.multiplayer.authoritative) { this.multiplayer.action('bots'); return; }
        this.botAI.spawnBots(100, this.userShipGroup.position);
        this.ui.addKillFeed("System", "Spawned 100 Fighters!!");
      }
    });

    window.addEventListener('ReturnToBase', () => {
      if (this.travel) { this.travel.returnToBase(); return; }
      if (this.userShipGroup && this.authManager?.profile?.id) {
        const basePos = this.getBasePosition(this.authManager.profile.id);
        const spawnPos = basePos.clone().add(new THREE.Vector3(0, 100, 300));
        this.relocateShip(this.space.origin.toWorld(spawnPos.toArray() as [number, number, number]));
      }
    });

    window.addEventListener('StartScreenEngage', () => {
      this.playStartCinematic();
    });

    window.addEventListener('StartScreenReset', () => {
      this.resetStartCinematic();
    });

    window.addEventListener('ToggleVoiceMute', async () => {
      if (this.voiceChat) {
        const isMuted = await this.voiceChat.toggleMute();
        (window as any).isVoiceMuted = isMuted;
        window.dispatchEvent(new CustomEvent('VoiceMuteChanged', { detail: isMuted }));
      }
    });

    // Wormhole / Boss trigger removed as requested
  }

  // Generate a deterministic fixed coordinate for a player's base based on their UUID
  private getBasePosition(id: string): THREE.Vector3 {
    if (this.smokeState && id.startsWith('guest_')) return new THREE.Vector3(...this.space.origin.fromAbsolute(SPACE_SMOKE_BASE));
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = Math.imul(31, hash) + id.charCodeAt(i) | 0;
    const rnd = () => ((hash = Math.imul(741103597, hash)) >>> 0) / 4294967296;
    if (!this.smokeState) {
      const base = systemArrival(SOLAR_SYSTEM);
      // Keep personal stations distinct; guest saves use the stable shared guest location.
      const offset = id.startsWith('guest_') ? [0, 0, 0] : [(rnd() - 0.5) * 16000, (rnd() - 0.5) * 2000, (rnd() - 0.5) * 2000];
      return new THREE.Vector3(...this.space.origin.fromAbsolute([base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]]));
    }
    return new THREE.Vector3(...this.space.origin.fromAbsolute([(rnd() - 0.5) * 20000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 20000]));
  }

  private makeCleanGlow(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.06, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.15, 'rgba(220,235,255,0.4)');
    g.addColorStop(0.35, 'rgba(120,160,255,0.08)');
    g.addColorStop(0.6, 'rgba(60,80,200,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
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

  private createInstancedMeshFromModel(model: THREE.Object3D): THREE.InstancedMesh | null {
    const mesh = createModelInstances(model, this.maxInstances);
    if (mesh) this.engine.scene.add(mesh);
    return mesh;
  }

  private loadBotInstancedMesh(config: ShipVisualConfig, assign: (mesh: THREE.InstancedMesh | null) => void) {
    loadModelClone(config.modelPath).then((model) => {
      model.scale.setScalar(config.scale);
      model.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
      assign(this.createInstancedMeshFromModel(model));
    }).catch((err: any) => {
      console.error(`Error loading bot visual ${config.modelPath}:`, err);
      assign(null);
    });
  }

  public update(dt: number) {
    if (!this.userShipGroup) return;
    this.elapsed += dt;
    if (this.multiplayer.authoritative && !this.multiplayer.connected) this.travel?.connectionLost();
    this.travel?.update(dt);
    if (this.userShipGroup) {
      if (this.smokeState === 'sector-tour' && this.authManager?.profile?.id.startsWith('guest_')) {
        this.smokeTour.update(dt, (position) => this.relocateShip(position));
      }
      const delta = this.space.origin.recenter(this.userShipGroup.position.toArray() as [number, number, number]);
      if (delta) this.applyOriginShift(new THREE.Vector3(...delta));
    }
    const focus = this.userShipGroup?.position ?? this.engine.camera.position;
    this.space.update(dt, this.elapsed, focus, this.originShifted);
    if (this.travel && this.stellarLight) {
      const absolute = this.space.origin.toAbsolute(focus.toArray());
      this.stellarLight.position.set(-absolute[0], -absolute[1], -absolute[2]).normalize();
    }
    this.coreLandmarks.visible = !this.travel && focus.distanceToSquared(this.coreLandmarks.position) < 100_000 ** 2;
    this.originShifted = false;
    this.hudUpdateAccumulator += dt;
    this.spatialUpdateAccumulator += dt;

    const shouldRefreshHud = this.hudUpdateAccumulator >= 0.1;
    if (shouldRefreshHud) this.hudUpdateAccumulator %= 0.1;

    const shouldUpdateSpatial = this.spatialUpdateAccumulator >= 1 / 30;
    if (shouldUpdateSpatial) this.soundManager.updateListener(this.engine.camera);
    const spatialDelta = this.spatialUpdateAccumulator;
    if (shouldUpdateSpatial) this.spatialUpdateAccumulator = 0;

    // Cosmos and Cinematic updates
    // Engine updates the launch scene while it owns the overlay view.

    if (this.engine.shipController && this.userShipGroup) {
        if (shouldRefreshHud) {
          const subs = this.engine.shipController.subsystems || { engines: 100, weapons: 100, shieldGenerator: 100 };
          this.ui.updateSubsystems(subs.engines, subs.weapons, subs.shieldGenerator);

          // Distance to player's base station
          if (this.authManager && this.authManager.profile) {
            const fixedBasePos = this.getBasePosition(this.authManager.profile.id);
            const dist = this.userShipGroup.position.distanceTo(fixedBasePos);
            this.ui.setHangarAvailable(dist < 1500 && (!this.travel || this.travel.atHome));
          }

          this.ui.updateBoost(this.engine.shipController.currentBoost, this.engine.shipController.maxBoost);
        }

        // Boost FX
        const isBoosting = this.engine.shipController.isBoosting;

        const speed = Math.max(this.engine.shipController.velocity.length(), this.engine.shipController.cruiseSpeed);
        const targetColor = PLAYER_SHIP_VISUAL.engineColor;
        this.userEngineVFX?.update(dt, this.elapsed, speed, isBoosting, targetColor, Math.max(this.engine.shipController.cruiseEffectIntensity, this.engine.shipController.warpIntensity));
        if (this.isPrimaryFireHeld) {
          this.firePrimaryWeapon();
        }

        // Particle systems update
        const shipVelocity = this.engine.shipController.velocity;
        this.effects.update(
          dt,
          shipVelocity,
          isBoosting,
          this.combatSystem.laserColor,
          PLAYER_SHIP_VISUAL.engineColor
        );
        this.flightFX?.update(dt, this.engine.camera, this.userShipGroup.position, this.userShipGroup.quaternion,
          this.isWarping, this.space.systemScene?.anomalyPosition ?? null, this.space.systemScene?.environmentZone ?? null);
        this.engine.shipController.warpIntensity = this.flightFX?.warpIntensity ?? 0;
        // Nearby home scenery must not appear to accompany the player through hyperspace.
        if (this.baseShipGroup && this.travel) this.baseShipGroup.visible = this.travel.atHome && this.engine.shipController.warpIntensity < .8;
        this.effects.motion.update(dt, this.userShipGroup.position, this.isWarping || !!this.flightFX?.transitVisible, this.engine.renderer.domElement.height);

        this.effects.handleEngineParticles(
          this.elapsed,
          this.userShipGroup,
          shipVelocity,
          isBoosting,
          PLAYER_SHIP_VISUAL.nozzles
        );

        // Wormhole transit check removed
    }

    // Multiplayer telemetry
    if (this.userShipGroup) {
      this.multiplayer.localPlayerPosition = this.userShipGroup.position;
      this.multiplayer.broadcastPosition(this.userShipGroup.position, this.userShipGroup.quaternion);
    }
    this.multiplayer.update(dt);
    
    if (shouldRefreshHud && this.userShipGroup && this.voiceChat) {
      this.voiceChat.updateConnections(this.multiplayer.players, this.userShipGroup.position);
    }
    
    if (this.bossGroup) {
      const bossP = this.multiplayer.players.get('bot_boss_flagship');
      if (bossP) {
        this.bossGroup.position.copy(bossP.position);
        this.bossGroup.quaternion.copy(bossP.quaternion);
      }
      if (this.bossShieldMesh) {
        const pulse = 1.0 + Math.sin(this.elapsed * 5) * 0.04;
        this.bossShieldMesh.scale.set(pulse, pulse, pulse);
        const mat = this.bossShieldMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.2, dt * 3.5);
      }
    }

    if (shouldUpdateSpatial && this.coreLandmarks.visible && this.iss) this.iss.update(this.engine.camera.position);
    if (this.coreLandmarks.visible && this.voyager) this.voyager.update(dt, this.engine.camera.position);
    if (this.coreLandmarks.visible && this.blackHole) this.blackHole.update(this.elapsed, dt, this.engine.camera.position);

    // Throttle leaderboard updates to 1Hz
    if (Math.floor(this.elapsed) > Math.floor(this.elapsed - dt)) {
      this.ui.updateLeaderboard(this.multiplayer.players);
    }

    if (shouldUpdateSpatial) {
      // LOD, orbital motion and bot decisions do not need a 60 Hz tick.
      this.updateLOD();
      if (!this.multiplayer.authoritative) this.botAI.update(spatialDelta, this.userShipGroup, this.activeColliders());
    }

    // Update Combat System
    this.combatSystem.update(
      dt,
      this.authManager?.profile?.id,
      this.activeColliders(),
      this.space.planets.orbitObjects,
      this.userShipGroup
    );

    // Distance checks for base labels
    if (shouldUpdateSpatial && this.userShipGroup) {
      for (const b of this.baseLabels) {
        const dist = this.userShipGroup.position.distanceTo(b.group.position);
        if (dist > 4000 || (this.travel && !this.travel.atHome) || this.flightFX?.transitVisible) {
          b.dom.style.display = 'none';
          b.dom.style.opacity = '0';
        } else {
          b.dom.style.display = 'block';
          b.dom.style.opacity = Math.max(0, 1 - (dist - 1000) / 3000).toString();
        }
      }
    }

    // Both camera views use the regular flight HUD; no separate 3D cockpit.

    // Raycasting Throttled
  }


  private updateLOD() {
    if (!this.lod0Mesh || !this.lod1Mesh) return;

    this.cameraFrustum.setFromProjectionMatrix(
      this.projScreenMatrix.multiplyMatrices(this.engine.camera.projectionMatrix, this.engine.camera.matrixWorldInverse)
    );

    const isJamming = false;
    this.ui.updateNebulaEffect(null);

    let playerCount0 = 0;
    let botInterceptorCount0 = 0;
    let botBomberCount0 = 0;
    let count1 = 0;
    const drawDistSq = this.multiplayer.drawDistance * this.multiplayer.drawDistance;
    const minimapDots: {id: string, x: number, z: number, isBot: boolean}[] = [];

    for (const [id, p] of this.multiplayer.players.entries()) {
      if (id === 'bot_boss_flagship') continue; // Skip boss instance mesh

      const distSq = this.userShipGroup ? this.userShipGroup.position.distanceToSquared(p.position) : 0;
      const inFrustum = this.cameraFrustum.containsPoint(p.position);
      
      minimapDots.push({ id, x: p.position.x, z: p.position.z, isBot: id.startsWith('bot') });
      
      const isBot = id.startsWith('bot_');
      const isBomber = isBot && p.username?.toLowerCase().includes('bomber');

      if (distSq < 3000 * 3000) {
          // LOD 0: Detailed ship
          if (inFrustum) {
            const botVisual = isBomber ? BOT_BOMBER_VISUAL : BOT_INTERCEPTOR_VISUAL;
            const botMesh = isBomber ? this.botBomberMesh : this.botInterceptorMesh;
            const targetMesh = isBot ? (botMesh || this.lod0Mesh) : this.lod0Mesh;
            const visualScale = isBot ? botVisual.scale : PLAYER_SHIP_VISUAL.scale;

            this.dummyObj.position.copy(p.position);
            this.dummyObj.quaternion.copy(p.quaternion);
            this.dummyObj.scale.setScalar(visualScale);
            this.dummyObj.quaternion.multiply(this.fixQuat);
            this.dummyObj.updateMatrix();

            if (targetMesh === this.botBomberMesh) {
              targetMesh.setMatrixAt(botBomberCount0++, this.dummyObj.matrix);
            } else if (targetMesh === this.botInterceptorMesh) {
              targetMesh.setMatrixAt(botInterceptorCount0++, this.dummyObj.matrix);
            } else {
              this.lod0Mesh.setMatrixAt(playerCount0++, this.dummyObj.matrix);
            }
          }
          this.handleLOD2Sprite(id, p, false);
          
          // Bots names visible up to 2000 units, players always visible in LOD 0
          const showLabel = inFrustum && (isBot ? distSq < 4000000 : true); // 2000^2 = 4000000
          this.handleBotLabel(id, p, showLabel, p.username);
      } else if (distSq < 8000 * 8000) {
          // LOD 1: Potato cone
          if (inFrustum) {
            this.dummyObj.position.copy(p.position);
            this.dummyObj.quaternion.copy(p.quaternion);
            this.dummyObj.scale.set(1, 1, 1);
            this.dummyObj.quaternion.multiply(this.fixQuat);
            this.dummyObj.updateMatrix();
            this.lod1Mesh.setMatrixAt(count1++, this.dummyObj.matrix);
          }
          this.handleLOD2Sprite(id, p, false);
          
          // Bots names not visible in LOD 1, players visible up to 5000 units
          const showLabel = inFrustum && (!isBot && distSq < 25000000); // 5000^2 = 25000000
          this.handleBotLabel(id, p, showLabel, p.username);
      } else if (distSq <= drawDistSq) {
          // LOD 2: Glowing sprite on the horizon
          this.handleLOD2Sprite(id, p, inFrustum);
          this.handleBotLabel(id, p, false, p.username);
      }
    }
    this.lod0Mesh.count = playerCount0;
    this.lod0Mesh.instanceMatrix.needsUpdate = true;
    if (this.botInterceptorMesh) {
      this.botInterceptorMesh.count = botInterceptorCount0;
      this.botInterceptorMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.botBomberMesh) {
      this.botBomberMesh.count = botBomberCount0;
      this.botBomberMesh.instanceMatrix.needsUpdate = true;
    }
    this.lod1Mesh.count = count1;
    this.lod1Mesh.instanceMatrix.needsUpdate = true;
    
    this.cleanupLOD2Sprites();
    this.cleanupBotLabels();
    
    if (this.userShipGroup) {
      this.ui.updateMinimap(this.userShipGroup.position.x, this.userShipGroup.position.z, minimapDots, isJamming);
    }
  }

  public spawnUserShip(auth: AuthManager) {
    this.authManager = auth;
    this.removeUserShip();
    this.cinematicSystem.cleanup();

    if (!auth.profile || !auth.user) return;
    
    this.engine.shipController.laserColor = this.combatSystem.laserColor;

    this.engine.shipController.combatEnabled = auth.mode === 'pvp';
    document.body.dataset.gameMode = auth.mode;
    window.dispatchEvent(new CustomEvent('GameModeChanged', { detail: auth.mode }));
    this.multiplayer.init(auth.profile.id, auth.profile.username || 'Pilot', auth.mode);
    this.multiplayer.onIdentity = id => { if (auth.profile) auth.profile.id = id; };
    this.multiplayer.onArrival = data => this.travel?.applyArrival(data);
    this.multiplayer.onWorld = data => {
      this.engine.shipController.applyServerVitals(data.self); this.travel?.applyNetwork(data.self);
      this.combatSystem.applyNetworkProjectiles(data);
      this.ui.updateHP(data.self.hp, data.self.maxHP); this.ui.updateShield(data.self.shield, data.self.maxHP);
    };
    this.multiplayer.onNotice = message => this.travel?.notice(message);

    // Bind Combat Callbacks
    this.multiplayer.onShootCallback = (data) => {
      const dir = new THREE.Vector3(data.dirx, data.diry, data.dirz).normalize();
      const startPos = new THREE.Vector3();
      const p = this.multiplayer.players.get(data.id);
      if (!p) return;
      startPos.copy(p.position);
      
      const laserColor = data.color || 'red';
      const weaponType = data.weaponType || 'laser';
      const laserColorHex = laserColor === 'red' ? 0xff2222 : 0x2288ff;

      if (weaponType === 'shotgun') {
        const angles = [0, -0.15, 0.15];
        for (const angle of angles) {
          const lDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          const laser = this.combatSystem.createVolumetricLaser(laserColorHex, 150, false);
          const muzzlePosition = this.combatSystem.placeProjectile(laser, startPos, lDir, 150, 78);

          this.engine.scene.add(laser);

          const laserSpeed = 3800;
          const velocity = lDir.clone().multiplyScalar(laserSpeed);

          this.combatSystem.lasers.push({
            mesh: laser,
            velocity,
            life: 1.5,
            ownerId: data.id,
            lastPosition: muzzlePosition
          });
        }
      } else if (weaponType === 'missile') {
        const group = new THREE.Group();
        const coreGeo = new THREE.CylinderGeometry(8, 8, 80, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, toneMapped: false });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        group.add(coreMesh);

        const glowGeo = new THREE.CylinderGeometry(15, 15, 80, 8);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0xff5500, transparent: true, opacity: 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        group.add(glowMesh);

        const muzzlePosition = this.combatSystem.placeProjectile(group, startPos, dir, 80, 120);

        this.engine.scene.add(group);

        const missileSpeed = 2800;
        const velocity = dir.clone().multiplyScalar(missileSpeed);

        this.combatSystem.lasers.push({
          mesh: group,
          velocity,
          life: 4.0,
          ownerId: data.id,
          lastPosition: muzzlePosition,
          isHoming: true
        });
      } else {
        const laser = this.combatSystem.createVolumetricLaser(laserColorHex, 100, false);
        const muzzlePosition = this.combatSystem.placeProjectile(laser, startPos, dir, 100, 86);
        
        this.engine.scene.add(laser);
        
        const velocity = dir.clone().multiplyScalar(4000);
        this.combatSystem.lasers.push({
          mesh: laser,
          velocity,
          life: 2.0,
          ownerId: data.id,
          lastPosition: muzzlePosition
        });
      }
    };

    this.multiplayer.onHitCallback = (data) => {
      if (this.multiplayer.authoritative) {
        const local = data.targetId === auth.profile?.id, position = local ? this.userShipGroup?.position : this.multiplayer.players.get(data.targetId)?.position;
        if (position) this.combatSystem.createShieldFlare(position, local);
        if (local) window.dispatchEvent(new CustomEvent('ShipDamaged', { detail: { amount: data.damage } }));
        return;
      }
      if (data.targetId === auth.profile?.id) {
        const dead = this.engine.shipController.takeDamage(data.damage);
        this.ui.updateHP(this.engine.shipController.currentHP, this.engine.shipController.maxHP);
        this.ui.updateShield(this.engine.shipController.currentShield, this.engine.shipController.maxShield);
        
        if (dead) {
          this.ui.showDeathScreen(5);
          this.multiplayer.broadcastDie(data.shooterId, "Enemy");
          if (this.userShipGroup) this.combatSystem.createExplosionAt(this.userShipGroup.position, 0xff0000, 10);
        } else {
          if (this.userShipGroup) {
             if (this.engine.shipController.currentShield > 0) {
                 this.combatSystem.createShieldFlare(this.userShipGroup.position, true);
             } else {
                 this.combatSystem.createExplosionAt(this.userShipGroup.position, 0xffff00, 2);
             }
          }
        }
      } else {
        const p = this.multiplayer.players.get(data.targetId);
        if (p) {
           this.combatSystem.createShieldFlare(p.position, false);
        }
      }
    };

    this.multiplayer.onDieCallback = (data) => {
      const p = this.multiplayer.players.get(data.killedId);
      if (p) {
        this.combatSystem.createExplosionAt(p.position, 0xff0000, 10);
        this.ui.addKillFeed(data.killerName || "Pilot", p.username);

        if (data.killerId === auth.profile?.id && !this.multiplayer.authoritative) {
           window.localPlayerBounty += Math.floor(p.bounty * 0.5);
           this.engine.shipController.healShield(100);
           this.ui.updateShield(this.engine.shipController.currentShield, this.engine.shipController.maxShield);
        }
      } else if (data.killedId === auth.profile?.id) {
        if (this.multiplayer.authoritative) {
          this.ui.showDeathScreen(5);
          if (this.userShipGroup) this.combatSystem.createExplosionAt(this.userShipGroup.position, 0xff0000, 10);
        }
      } else {
          this.ui.addKillFeed(data.killerName || "Pilot", "Enemy");
      }
    };

    this.multiplayer.onChatCallback = (data) => {
       this.ui.addChatMessage(data.username, data.message);
    };

    this.spawnBaseShip(auth);

    const p = auth.profile;
    const shipColor = auth.getShipColor();
    const group = new THREE.Group();

    // Temporary placeholder
    const placeholder = new THREE.Mesh(
      new THREE.OctahedronGeometry(5, 1),
      new THREE.MeshStandardMaterial({ color: shipColor, wireframe: true })
    );
    group.add(placeholder);

    this.userEngineVFX?.dispose();
    this.userEngineVFX = new ShipEngineVFX(
      group,
      PLAYER_SHIP_VISUAL.nozzles,
      PLAYER_SHIP_VISUAL.engineColor,
      PLAYER_SHIP_VISUAL.nozzleSizes
    );

    loadModelClone(PLAYER_SHIP_VISUAL.modelPath).then((model) => {
      model.scale.setScalar(PLAYER_SHIP_VISUAL.scale);
      model.rotation.set(
        PLAYER_SHIP_VISUAL.rotation[0],
        PLAYER_SHIP_VISUAL.rotation[1],
        PLAYER_SHIP_VISUAL.rotation[2]
      );

      group.remove(placeholder);
      group.add(model);

      // Initialize instanced meshes
      if (!this.lod0Mesh) {
        this.lod0Mesh = this.createInstancedMeshFromModel(model);

        const coneGeo = new THREE.ConeGeometry(5, 20, 5);
        coneGeo.rotateX(Math.PI / 2);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0x00ccff, wireframe: true, transparent: true, opacity: 0.8 });

        this.lod1Mesh = new THREE.InstancedMesh(coneGeo, coneMat, this.maxInstances);
        this.lod1Mesh.count = 0;
        this.lod1Mesh.frustumCulled = false;
        this.engine.scene.add(this.lod1Mesh);

        this.loadBotInstancedMesh(BOT_INTERCEPTOR_VISUAL, (mesh) => { this.botInterceptorMesh = mesh; });
        this.loadBotInstancedMesh(BOT_BOMBER_VISUAL, (mesh) => { this.botBomberMesh = mesh; });
      }
    }).catch((err: any) => {
      console.error('Error loading player ship:', err);
    });

    const basePos = this.getBasePosition(auth.profile.id);
    const spawnPos = basePos.clone().add(new THREE.Vector3(0, 100, 300));
    const baseHP = 1000;
    this.engine.shipController.setSpawn(spawnPos, baseHP);
    this.ui.setShipController(this.engine.shipController);

    if (this.smokeState && (p.position_x !== 0 || p.position_y !== 0 || p.position_z !== 0)) {
      group.position.set(...this.space.origin.fromAbsolute([p.position_x, p.position_y, p.position_z]));
    } else {
      group.position.copy(spawnPos);
    }

    this.userShipGroup = group;
    this.engine.scene.add(group);
    this.engine.shipController.setShip(group);
    if (this.multiplayer.authoritative) {
      this.engine.shipController.setInputBlocked('network', true);
      this.engine.shipController.networkDrive = dt => this.multiplayer.drive(dt, this.engine.shipController, group);
      this.engine.shipController.networkAction = (type, data) => { this.multiplayer.action(type, data); };
    }
    if (!this.smokeState) {
      this.flightFX?.dispose(); this.flightFX = new ApprovedFlightFX(this.engine.scene, Settings.graphicsMode === 'LOW');
      this.travel = new StellarTravel(this.engine, {
        position: () => this.space.origin.toWorld(group.position.toArray()),
        move: delta => { group.position.add(new THREE.Vector3(...delta)); this.engine.camera.position.add(new THREE.Vector3(...delta)); },
        enter: (system, position) => this.enterSystem(system, position),
        base: () => this.space.origin.toAbsolute(this.getBasePosition(auth.profile!.id).toArray()), rotation: () => group.quaternion.toArray(),
        skyUnavailable: () => this.space.systemScene?.sky.status === 'unavailable',
        localObstacles: () => this.space.systemScene?.openSpace.obstacles??[],
        scan: () => this.flightFX?.scan(group.position),
        restoreRotation: rotation => { group.quaternion.fromArray(rotation); this.engine.shipController.resetTransitMotion(); },
        face: position => {
          const direction = new THREE.Vector3(...this.space.origin.fromAbsolute(position)).sub(group.position);
          if (direction.lengthSq() < 1) return;
          faceFlightDirection(group.quaternion, direction);
          this.engine.shipController.resetTransitMotion();
          this.engine.camera.position.copy(group.position).add(new THREE.Vector3(0, 125, 360).applyQuaternion(group.quaternion));
        },
        steer: (position, dt) => {
          const direction = new THREE.Vector3(...this.space.origin.fromAbsolute(position)).sub(group.position);
          return direction.lengthSq() > 1 ? steerFlightDirection(group.quaternion, direction, dt) : 0;
        },
        combatNearby: () => [...this.multiplayer.players.values()].some(player => player.id.startsWith('bot_') && player.position.distanceToSquared(group.position) < 6000 ** 2) ||
          this.combatSystem.lasers.some(laser => laser.mesh.position.distanceToSquared(group.position) < 3000 ** 2),
      }, auth.profile.id, this.multiplayer.authoritative ? (type, data) => this.multiplayer.action(type, data) : undefined, auth.mode);
      this.travel.start();
    }
    if (this.smokeState && auth.profile.id.startsWith('guest_')) {
      const planet = createPlanetCatalog(WORLD_SIZE)[0];
      const position = this.smokeState === 'planet-showcase'
        ? worldPosition(undefined, [planet.position[0], planet.position[1], planet.position[2] + planet.radius + 1600])
        : this.smokeState === 'sector-boundary'
          ? worldPosition(undefined, [0, 0, -24950])
          : worldPosition(undefined, [0, 100, 9800]);
      group.quaternion.identity();
      this.engine.shipController.setShip(group);
      this.relocateShip(position);
    } else {
      this.engine.camera.position.copy(group.position).add(new THREE.Vector3(0, 125, 360));
    }
    this.loadVoiceChat();
  }

  public getDebugState() {
    let remote = 0;
    let bots = 0;
    for (const id of this.multiplayer.players.keys()) {
      if (id.startsWith('bot_')) bots += 1;
      else remote += 1;
    }
    const matrix = new THREE.Matrix4().multiplyMatrices(this.engine.camera.projectionMatrix, this.engine.camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
    const visibleFullPlanets = this.space.systemScene?.visiblePlanetCount(frustum) ?? this.space.planets.spacePlanets.filter((planet) => planet.mesh.visible && frustum.intersectsObject(planet.mesh)).length;
    return {
      scene: this.smokeState ?? 'free-flight',
      worldSeed: this.space.planets.worldSeed,
      space: this.space.snapshot(),
      travel: this.travel?.snapshot() ?? null,
      flightDust: this.effects.motion.snapshot(),
      flightFX: this.flightFX?.snapshot() ?? null,
      tour: this.smokeState === "sector-tour" ? this.smokeTour.snapshot() : null,
      projectiles: this.combatSystem.lasers.length,
      weaponVisuals: this.combatSystem.snapshot(),
      audio: this.soundManager.snapshot(),
      planetCount: this.space.descriptors().length,
      visibleFullPlanets,
      visiblePlanets: visibleFullPlanets + this.space.navigation.visiblePlanetCount(frustum, this.space.planets.activeIds),
      players: { local: this.userShipGroup ? 1 : 0, remote, bots },
      remoteVisuals: {
        detailedPlayers: this.lod0Mesh?.count ?? 0,
        detailedBots: (this.botInterceptorMesh?.count ?? 0) + (this.botBomberMesh?.count ?? 0),
        distantShips: this.lod1Mesh?.count ?? 0,
        playerModelSize: this.lod0Mesh ? new THREE.Box3().setFromBufferAttribute(this.lod0Mesh.geometry.getAttribute('position') as THREE.BufferAttribute)
          .getSize(new THREE.Vector3()).multiplyScalar(PLAYER_SHIP_VISUAL.scale).toArray() : null,
      },
      voice: this.voiceChat?.getDebugState() ?? null,
      ship: this.userShipGroup ? {
        position: this.userShipGroup.position.toArray(),
        rotation: this.userShipGroup.quaternion.toArray(),
        worldPosition: this.space.origin.toWorld(this.userShipGroup.position.toArray() as [number, number, number]),
        cameraOffset: this.engine.camera.position.clone().sub(this.userShipGroup.position).toArray(),
        cameraFov: this.engine.camera.fov,
        cruiseIntensity: this.engine.shipController.cruiseEffectIntensity,
        engine: this.userEngineVFX?.snapshot() ?? null,
        speed: this.engine.shipController.velocity.length(),
        viewMode: this.engine.shipController.viewMode,
        mobileInput: this.engine.shipController.mobileInput,
        hp: this.engine.shipController.currentHP,
      } : null,
    };
  }

  public getPlanetDebugDescriptors() {
    return this.space.descriptors().map((planet) => ({
      id: planet.planetId, name: planet.name, radius: planet.radius,
      position: [...planet.position], seed: planet.seed, biome: planet.biome,
      visual: { ...planet.visual },
    }));
  }

  public getPlayerAbsolutePosition(): [number, number, number] | null {
    // Legacy cloud XYZ cannot represent a catalogue system; keep its data untouched.
    if (this.travel) { this.travel.save(); return null; }
    return this.userShipGroup ? [...this.space.origin.toAbsolute(this.userShipGroup.position.toArray() as [number, number, number])] : null;
  }

  public get currentSystemId() { return this.travel?.system.anchor.catalogId ?? null; }
  public get isWarping() { return this.travel?.warping ?? false; }
  public warpTo(object: MapObject) { return this.travel?.warp(object) ?? false; }
  public selectDestination(id: string) { return this.travel?.selectDestination(id) ?? false; }

  private activeColliders() {
    return this.starMeshes.filter(mesh => {
      if (mesh.userData.collisionEnabled === false) return false;
      let parent: THREE.Object3D | null = mesh;
      while (parent) { if (!parent.visible) return false; parent = parent.parent; }
      return true;
    });
  }

  private enterSystem(system: SystemDescriptor, position: WorldPosition) {
    this.flightFX?.systemArrival();
    this.stellarAmbient.color.setHex(0x91abc3);this.stellarAmbient.intensity=.55;
    if(this.stellarLight){this.stellarLight.color.setHex(system.starColor).lerp(new THREE.Color(0xffffff),.75);this.stellarLight.intensity=2.8;}
    this.space.setSystem(system);
    this.coreLandmarks.visible = false;
    this.combatSystem.clearProjectiles(); this.isPrimaryFireHeld = false;
    this.soundManager.stopWeapons();
    this.botAI.spawnBots(0, new THREE.Vector3());
    this.multiplayer.setSystemId(system.anchor.catalogId);
    this.engine.shipController.resetTransitMotion();
    this.relocateShip(position);
    if (this.baseShipGroup) {
      this.baseShipGroup.visible = system.anchor.catalogId === SOLAR_SYSTEM.anchor.catalogId;
      this.baseShipGroup.position.copy(this.getBasePosition(this.authManager.profile.id));
    }
    this.space.systemScene?.update(0, this.elapsed, this.space.origin, this.userShipGroup!.position);
    this.engine.scene.updateMatrixWorld(true);
    this.updateLOD();
  }

  private relocateShip(position: WorldPosition) {
    if (!this.userShipGroup) return;
    const delta = this.space.origin.moveTo(position);
    this.applyOriginShift(new THREE.Vector3(...delta));
    this.userShipGroup.position.set(0, 0, 0);
    this.effects.motion.reset(this.userShipGroup.position);
    this.engine.shipController.velocity.set(0, 0, 0);
    const offset = new THREE.Vector3(0, 125, 360).applyQuaternion(this.userShipGroup.quaternion);
    this.engine.camera.position.copy(offset);
    this.engine.camera.updateMatrixWorld(true);
  }

  private applyOriginShift(delta: THREE.Vector3) {
    shiftSceneOrigin(this.engine.scene, this.engine.camera, delta, [
      this.space.background.group, this.space.navigation.group,
      this.space.systemScene?.group ?? null,
      this.effects.motion.group, this.effects.ionTrailPoints,
      this.flightFX?.group ?? null,
      this.lod0Mesh, this.lod1Mesh, this.botInterceptorMesh, this.botBomberMesh,
    ]);
    this.engine.shipController.shiftOrigin(delta);
    this.effects.shiftOrigin(delta);
    this.flightFX?.shiftOrigin(delta);
    this.combatSystem.shiftOrigin(delta);
    this.soundManager.shiftOrigin(delta);
    this.soundManager.updateListener(this.engine.camera);
    this.multiplayer.shiftOrigin(delta);
    this.botAI.shiftOrigin(delta);
    this.hudUpdateAccumulator = 0.1;
    this.spatialUpdateAccumulator = 1 / 30;
    this.originShifted = true;
  }

  private loadVoiceChat() {
    const loadVersion = ++this.voiceChatLoadVersion;

    void import('../network/VoiceChatManager').then(({ VoiceChatManager }) => {
      if (loadVersion !== this.voiceChatLoadVersion || !this.userShipGroup) return;

      this.voiceChat = new VoiceChatManager(
        this.engine.camera,
        this.engine.scene,
        this.multiplayer
      );
    }).catch((error) => {
      console.warn('Voice chat module could not be loaded:', error);
    });
  }

  public spawnBaseShip(auth: AuthManager) {
    if (!auth.profile || this.baseShipGroup) return;
    
    const group = new THREE.Group();
    this.baseShipGroup = group;
    
    const fixedBasePos = this.getBasePosition(auth.profile.id);
    group.position.copy(fixedBasePos);
    
    const interactionBox = new THREE.Mesh(
      new THREE.BoxGeometry(400, 200, 400),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    interactionBox.userData = {
      isBaseShip: true,
      name: `${auth.profile!.username}'s Base`,
      type: 'Repository Hub',
      radius: 250
    };
    group.add(interactionBox);
    this.starMeshes.push(interactionBox);

    loadModelClone(BASE_STATION_VISUAL.modelPath).then((model) => {
      model.scale.setScalar(BASE_STATION_VISUAL.scale);
      model.rotation.set(
        BASE_STATION_VISUAL.rotation[0],
        BASE_STATION_VISUAL.rotation[1],
        BASE_STATION_VISUAL.rotation[2]
      );
      group.add(model);
    }).catch((err: any) => {
      console.error('Error loading base ship:', err);
    });

    const div = createBaseShipLabel({
      username: auth.profile.username,
      totalStars: auth.profile.total_stars,
      repositories: auth.repos,
    });
    const lbl = new CSS2DObject(div);
    lbl.position.set(0, 300, 0);
    group.add(lbl);

    this.baseLabels.push({ group, dom: div });
    this.engine.scene.add(group);
  }

  public removeUserShip() {
    this.soundManager.stopWeapons();
    this.travel?.dispose(); this.travel = null;
    const leaving = this.multiplayer.disconnect(); this.engine.shipController.networkDrive = undefined; this.engine.shipController.networkAction = undefined;
    this.engine.shipController.setInputBlocked('network', false);
    this.flightFX?.dispose(); this.flightFX = null;
    this.engine.shipController.clearShip();
    this.isPrimaryFireHeld = false;
    this.voiceChatLoadVersion += 1;
    if (this.voiceChat) {
      this.voiceChat.destroy();
      this.voiceChat = null;
    }
    if (this.userEngineVFX) {
      this.userEngineVFX.dispose();
      this.userEngineVFX = null;
    }
    if (this.userShipGroup) {
      this.engine.scene.remove(this.userShipGroup);
      this.userShipGroup = null;
    }
    return leaving;
  }

  private handleLOD2Sprite(id: string, p: any, show: boolean) {
    let sprite = this.lod2Sprites.get(id);
    if (!show) {
      if (sprite) { sprite.visible = false; }
      return;
    }
    
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.starGlow, color: 0xff0044, transparent: true, blending: THREE.AdditiveBlending
      }));
      sprite.scale.set(100, 100, 1);
      this.engine.scene.add(sprite);
      this.lod2Sprites.set(id, sprite);
    }
    sprite.visible = true;
    sprite.position.copy(p.position);
  }

  private cleanupLOD2Sprites() {
    for (const [id, sprite] of this.lod2Sprites.entries()) {
      if (!this.multiplayer.players.has(id)) {
        this.engine.scene.remove(sprite);
        this.lod2Sprites.delete(id);
      }
    }
  }

  private handleBotLabel(id: string, p: any, show: boolean, username: string) {
    const isBot = id.startsWith('bot_');
    const isLow = Settings.graphicsMode === 'LOW';

    // Fully disable bots name tags on LOW graphics to maximize performance
    if (isBot && isLow) {
      show = false;
    }

    let lbl = this.botLabels.get(id);
    if (!show) {
      if (lbl) { lbl.visible = false; }
      return;
    }
    
    if (!lbl) {
      const div = document.createElement('div');
      div.textContent = username;
      div.style.cssText = isBot
        ? 'color:#ff3366;font-family:monospace;font-size:12px;text-shadow:0 0 5px rgba(255,0,50,1);pointer-events:none;background:rgba(0,0,0,0.5);padding:2px 4px;border-radius:4px;white-space:nowrap;'
        : 'color:#00ffff;font-family:monospace;font-size:12px;text-shadow:0 0 5px rgba(0,255,255,1);pointer-events:none;background:rgba(0,0,0,0.5);padding:2px 4px;border-radius:4px;white-space:nowrap;';
      lbl = new CSS2DObject(div);
      this.engine.scene.add(lbl);
      this.botLabels.set(id, lbl);
    }
    lbl.visible = true;
    lbl.position.copy(p.position);
    lbl.position.y += 20;
  }

  private cleanupBotLabels() {
    for (const [id, lbl] of this.botLabels.entries()) {
      if (!this.multiplayer.players.has(id)) {
        if (lbl.element) lbl.element.remove();
        this.engine.scene.remove(lbl);
        this.botLabels.delete(id);
      }
    }
  }



  public playStartCinematic() {
    return this.cinematicSystem.playStartCinematic();
  }

  public resetStartCinematic() {
    this.cinematicSystem.resetStartCinematic();
  }
}
