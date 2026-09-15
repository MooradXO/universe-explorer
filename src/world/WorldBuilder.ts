import * as THREE from 'three';
import gsap from 'gsap';
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
import { PlanetBuilder, SpacePlanet } from './PlanetBuilder';
import { CombatSystem } from './CombatSystem';
import { CosmosGenerator } from './CosmosGenerator';
import { EffectsManager } from './EffectsManager';
import { BlackHole } from './BlackHole';
import { CockpitHUD } from './CockpitHUD';
import { BotAI } from './BotAI';
import { Settings } from '../core/Settings';
import type { VoiceChatManager } from '../network/VoiceChatManager';
import { loadModelClone } from './ModelLoader';
import { ShipEngineVFX } from './ShipEngineVFX';
import { AtmosphereMode } from '../planet/AtmosphereMode';
import {
  BASE_STATION_VISUAL,
  BOT_BOMBER_VISUAL,
  BOT_INTERCEPTOR_VISUAL,
  PLAYER_SHIP_VISUAL,
  ShipVisualConfig
} from './ShipVisualConfig';

// World size — Minecraft-map scale
const WORLD_SIZE = 50000;

export class WorldBuilder {
  private engine: Engine;
  private ui: UIManager;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredObject: THREE.Object3D | null = null;
  private mouseDownPos = { x: 0, y: 0 };
  private isClick = false;
  
  private starMeshes: THREE.Mesh[] = [];
  private starGlow: THREE.Texture;
  private elapsed = 0;
  
  private planetBuilder!: PlanetBuilder;
  private combatSystem!: CombatSystem;
  private cosmos!: CosmosGenerator;
  private effects!: EffectsManager;
  private blackHole!: BlackHole;
  private cockpitHUD!: CockpitHUD;
  private botAI!: BotAI;
  private atmosphereMode!: AtmosphereMode;
  private nearestAtmospherePlanet: SpacePlanet | null = null;
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
  private lastRaycastTime = 0;
  private isPrimaryFireHeld = false;
  private hudUpdateAccumulator = 0;
  private spatialUpdateAccumulator = 0;

  constructor(engine: Engine, ui: UIManager) {
    this.engine = engine;
    this.ui = ui;
    this.raycaster.params.Points!.threshold = 20;

    this.engine.scene.add(new THREE.AmbientLight(0x556677, 4.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight.position.set(1, 1, 1).normalize();
    this.engine.scene.add(dirLight);
    
    this.starGlow = this.makeCleanGlow();

    // 1. Cosmos Generation (Stars, Constellations, Nebulae, Asteroids, etc.)
    this.cosmos = new CosmosGenerator(
      this.engine,
      this.starGlow,
      this.starMeshes,
      WORLD_SIZE
    );
    this.cosmos.generateAll();

    // 2. Planets & Combat systems
    this.planetBuilder = new PlanetBuilder(this.engine, this.starGlow);
    this.planetBuilder.buildPlanetsWithSatellites(this.starMeshes, WORLD_SIZE);
    this.atmosphereMode = new AtmosphereMode(this.engine, this.ui);
    
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
    this.effects.init(this.combatSystem.laserColor);

    // NASA ISS
    this.iss = new ISSSatellite(this.engine.scene, 2500);
    this.starMeshes.push(this.iss.mesh.children[3] as THREE.Mesh);

    // Voyager 1
    this.voyager = new VoyagerProbe(this.engine.scene);
    this.starMeshes.push(this.voyager.mesh.children[11] as THREE.Mesh);

    // Gargantua Black Hole Singularity at (0, 0, 0)
    this.blackHole = new BlackHole(this.engine);
    this.starMeshes.push(this.blackHole.eventHorizon);

    this.setupInteractionEvents();
    this.setupGameplayEvents();

    this.cinematicSystem = new CinematicSystem(this.engine, this.soundManager);
    this.cinematicSystem.initCinematicObjects();

    this.cockpitHUD = new CockpitHUD(this.engine.camera, this.engine.shipController);
    this.botAI = new BotAI(this.engine.scene, this.multiplayer, this.combatSystem);

    if (import.meta.env.DEV) {
      this.installPlanetSmokeHooks();
    }
  }

  private setupInteractionEvents() {
    window.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.hud-panel') || target.closest('#auth-ui') || target.closest('#settings-menu') || target.closest('button') || target.closest('input')) {
         this.isClick = false;
         return;
      }
      this.mouseDownPos.x = e.clientX;
      this.mouseDownPos.y = e.clientY;
      this.isClick = true;
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const dx = e.clientX - this.mouseDownPos.x;
      const dy = e.clientY - this.mouseDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) this.isClick = false;
    });

    window.addEventListener('mouseup', (e) => { 
      const target = e.target as HTMLElement;
      if (target.closest('.hud-panel') || target.closest('#auth-ui') || target.closest('#settings-menu') || target.closest('button') || target.closest('input')) return;
      if (this.isClick) this.onClick(); 
    });
  }

  private firePrimaryWeapon() {
    this.combatSystem.shootLaser(
      this.userShipGroup,
      this.authManager?.profile?.id,
      this.engine.shipController.velocity
    );
  }

  private setupGameplayEvents() {
    window.addEventListener('ReturnToOrbit', () => {
      if (this.atmosphereMode.isActive) {
        this.atmosphereMode.exit();
        return;
      }
      this.ui.hideHUD();
    });

    window.addEventListener('EnterAtmosphereRequested', () => {
      this.enterNearestAtmosphere();
    });

    window.addEventListener('keydown', (event) => {
      if (this.engine.shipController.isTyping) return;
      this.soundManager.startAmbient();
      if ((event as KeyboardEvent).code === 'KeyF') {
        this.enterNearestAtmosphere();
      }
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
      this.isPrimaryFireHeld = true;
      this.firePrimaryWeapon();
    });

    window.addEventListener('PrimaryFireEnd', () => {
      this.isPrimaryFireHeld = false;
    });

    window.addEventListener('mousedown', () => {
      this.soundManager.startAmbient();
    });

    window.addEventListener('SpawnBots', () => {
      if (this.userShipGroup) {
        this.botAI.spawnBots(100);
        this.ui.addKillFeed("System", "Spawned 100 Fighters!!");
      }
    });

    window.addEventListener('ReturnToBase', () => {
      if (this.userShipGroup && this.authManager?.profile?.id) {
        const basePos = this.getBasePosition(this.authManager.profile.id);
        const spawnPos = basePos.clone().add(new THREE.Vector3(0, 100, 300));
        this.userShipGroup.position.copy(spawnPos);
        this.engine.shipController.velocity.set(0,0,0);
        this.ui.showHUD("Orbiting Base", "Safe Zone");
        setTimeout(() => this.ui.hideHUD(), 3000);
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
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = Math.imul(31, hash) + id.charCodeAt(i) | 0;
    const rnd = () => ((hash = Math.imul(741103597, hash)) >>> 0) / 4294967296;
    return new THREE.Vector3((rnd() - 0.5) * 20000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 20000);
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
    let tGeo: THREE.BufferGeometry | undefined;
    let tMat: THREE.Material | THREE.Material[] | undefined;
    model.traverse((child: any) => {
      if (child.isMesh && !tGeo) {
        tGeo = child.geometry;
        tMat = child.material;
      }
    });

    if (!tGeo || !tMat) return null;

    const mesh = new THREE.InstancedMesh(tGeo, tMat, this.maxInstances);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.engine.scene.add(mesh);
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

  private onClick() {
    if (this.atmosphereMode.isActive) return;
    if (this.hoveredObject) {
      const obj = this.hoveredObject;
      if (!this.userShipGroup) return;

      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);

      const dist = this.userShipGroup.position.distanceTo(worldPos);
      const radius = obj.userData.radius || 150;
      const maxInteractionDist = radius + 3000;

      if (dist > maxInteractionDist) {
        return; // Too far away, ignore click!
      }

      if (obj.userData.isMerchant) {
         this.ui.marketUI.show();
         return;
      }
      
      if (!obj.userData.visited && obj.userData.isStar) { 
        obj.userData.visited = true; 
      }
      this.ui.showHUD(
        obj.userData.name || 'Unknown',
        obj.userData.type || 'Object'
      );
    }
  }

  public update(dt: number) {
    this.elapsed += dt;
    this.hudUpdateAccumulator += dt;
    this.spatialUpdateAccumulator += dt;

    const shouldRefreshHud = this.hudUpdateAccumulator >= 0.1;
    if (shouldRefreshHud) this.hudUpdateAccumulator %= 0.1;

    const shouldUpdateSpatial = this.spatialUpdateAccumulator >= 1 / 30;
    const spatialDelta = this.spatialUpdateAccumulator;
    if (shouldUpdateSpatial) this.spatialUpdateAccumulator = 0;

    if (this.atmosphereMode.isActive) {
      this.updateAtmosphereFrame(dt, shouldRefreshHud, shouldUpdateSpatial, spatialDelta);
      return;
    }

    // Cosmos and Cinematic updates
    this.cosmos.update(dt, this.elapsed);
    this.cinematicSystem.update(dt, this.elapsed);

    if (this.engine.shipController && this.userShipGroup) {
        if (shouldRefreshHud) {
          const subs = this.engine.shipController.subsystems || { engines: 100, weapons: 100, shieldGenerator: 100 };
          this.ui.updateSubsystems(subs.engines, subs.weapons, subs.shieldGenerator);

          // Distance to player's base station
          if (this.authManager && this.authManager.profile) {
            const fixedBasePos = this.getBasePosition(this.authManager.profile.id);
            const dist = this.userShipGroup.position.distanceTo(fixedBasePos);
            if (dist < 1500) {
              this.ui.hangarBtn.style.display = 'block';
            } else {
              this.ui.hangarBtn.style.display = 'none';
              if (this.ui.hangarPanel.style.display === 'flex') {
                this.ui.toggleHangar();
              }
            }
          }

          this.ui.updateBoost(this.engine.shipController.currentBoost, this.engine.shipController.maxBoost);
        }

        // Boost FX
        const isBoosting = this.engine.shipController.isBoosting;

        const speed = this.engine.shipController.velocity.length();
        const targetColor = PLAYER_SHIP_VISUAL.engineColor;
        this.userEngineVFX?.update(dt, this.elapsed, speed, isBoosting, targetColor);
        if (this.isPrimaryFireHeld) {
          this.firePrimaryWeapon();
        }

        // Particle systems update
        const shipVelocity = this.engine.shipController.velocity;
        this.effects.update(
          dt,
          this.userShipGroup.position,
          shipVelocity,
          isBoosting,
          this.combatSystem.laserColor,
          PLAYER_SHIP_VISUAL.engineColor
        );

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

    if (shouldUpdateSpatial && this.iss) this.iss.update(this.engine.camera.position);
    if (this.voyager) this.voyager.update(dt, this.engine.camera.position);
    if (this.blackHole) this.blackHole.update(this.elapsed, dt, this.engine.camera.position);

    // Throttle leaderboard updates to 1Hz
    if (Math.floor(this.elapsed) > Math.floor(this.elapsed - dt)) {
      this.ui.updateLeaderboard(this.multiplayer.players);
    }

    if (shouldUpdateSpatial) {
      // LOD, orbital motion and bot decisions do not need a 60 Hz tick.
      this.updateLOD();
      const drawDistSq = this.multiplayer.drawDistance * this.multiplayer.drawDistance;
      this.planetBuilder.update(this.elapsed, this.userShipGroup, drawDistSq);
      this.botAI.update(spatialDelta, this.userShipGroup, this.starMeshes);
    }

    // Update Combat System
    this.combatSystem.update(
      dt,
      this.authManager?.profile?.id,
      this.starMeshes,
      this.planetBuilder.orbitObjects,
      this.userShipGroup
    );

    // Distance checks for base labels
    if (shouldUpdateSpatial && this.userShipGroup) {
      for (const b of this.baseLabels) {
        const dist = this.userShipGroup.position.distanceTo(b.group.position);
        if (dist > 4000) {
          b.dom.style.display = 'none';
          b.dom.style.opacity = '0';
        } else {
          b.dom.style.display = 'block';
          b.dom.style.opacity = Math.max(0, 1 - (dist - 1000) / 3000).toString();
        }
      }
    }

    if (this.userShipGroup) {
      const isFirstPerson = this.engine.shipController.viewMode === 'first';
      if (this.cockpitHUD.group.visible !== isFirstPerson) {
        this.cockpitHUD.setVisible(isFirstPerson);
      }
      const activeNebula = this.cosmos.getNebulaAtPosition(this.userShipGroup.position);
      if (shouldUpdateSpatial) this.cockpitHUD.update(spatialDelta, activeNebula !== null);
    } else {
      if (this.cockpitHUD.group.visible) {
        this.cockpitHUD.setVisible(false);
      }
    }

    if (shouldRefreshHud) this.updateAtmosphereApproach();

    // Raycasting Throttled
    this.handleRaycasting();
  }

  private updateAtmosphereFrame(
    dt: number,
    shouldRefreshHud: boolean,
    shouldUpdateSpatial: boolean,
    spatialDelta: number,
  ) {
    if (!this.userShipGroup) return;

    if (shouldRefreshHud) {
      const subs = this.engine.shipController.subsystems || { engines: 100, weapons: 100, shieldGenerator: 100 };
      this.ui.updateSubsystems(subs.engines, subs.weapons, subs.shieldGenerator);
      this.ui.updateBoost(this.engine.shipController.currentBoost, this.engine.shipController.maxBoost);
      this.ui.updateHP(this.engine.shipController.currentHP, this.engine.shipController.maxHP);
      this.ui.updateShield(this.engine.shipController.currentShield, this.engine.shipController.maxShield);
    }

    const speed = this.engine.shipController.velocity.length();
    this.userEngineVFX?.update(
      dt,
      this.elapsed,
      speed,
      this.engine.shipController.isBoosting,
      PLAYER_SHIP_VISUAL.engineColor
    );

    this.atmosphereMode.update(dt);
    this.ui.hideAtmospherePrompt();

    if (this.engine.shipController.viewMode === 'first') {
      if (!this.cockpitHUD.group.visible) this.cockpitHUD.setVisible(true);
      if (shouldUpdateSpatial) this.cockpitHUD.update(spatialDelta, false);
    } else if (this.cockpitHUD.group.visible) {
      this.cockpitHUD.setVisible(false);
    }
  }

  private updateAtmosphereApproach() {
    if (!this.userShipGroup) {
      this.nearestAtmospherePlanet = null;
      this.ui.hideAtmospherePrompt();
      return;
    }

    let nearest: SpacePlanet | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const planet of this.planetBuilder.spacePlanets) {
      const dist = this.userShipGroup.position.distanceTo(planet.position);
      const enterDist = planet.radius + 3000;
      if (dist < enterDist && dist < nearestDist) {
        nearest = planet;
        nearestDist = dist;
      }
    }

    this.nearestAtmospherePlanet = nearest;
    if (nearest) {
      this.ui.showAtmospherePrompt(nearest.name, '[F] ENTER ATMOSPHERE');
    } else {
      this.ui.hideAtmospherePrompt();
    }
  }

  private enterNearestAtmosphere() {
    if (!this.userShipGroup || this.atmosphereMode.isActive || !this.nearestAtmospherePlanet) return;

    this.ui.hideAtmospherePrompt();
    this.atmosphereMode.enter(
      this.nearestAtmospherePlanet.manifest,
      this.userShipGroup,
      {
        position: this.userShipGroup.position.clone(),
        quaternion: this.userShipGroup.quaternion.clone(),
      }
    );
  }

  private installPlanetSmokeHooks() {
    (window as unknown as {
      __universePlanetSmoke?: {
        enterFirstAtmosphere: () => boolean;
        enterAtmosphereAt: (index: number) => boolean;
        dropToSurface: () => boolean;
        exitAtmosphere: () => boolean;
        getState: () => { active: boolean; activeScene: string; css2dVisible: boolean; nearest: string | null; planetCount: number; level: ReturnType<AtmosphereMode['getLevelDebugSummary']> };
        getManifestSummary: () => {
          worldSeed: number;
          planets: { planetId: string; name: string; biome: string; archetype: string; landform: string; vegetationShape: string; propSets: string[]; landmarkSets: string[]; seed: number }[];
        };
      };
    }).__universePlanetSmoke = {
      enterFirstAtmosphere: () => {
        return (window as any).__universePlanetSmoke.enterAtmosphereAt(0);
      },
      enterAtmosphereAt: (index: number) => {
        if (!this.userShipGroup || this.atmosphereMode.isActive) return false;
        const planet = this.planetBuilder.spacePlanets[index];
        if (!planet) return false;
        this.userShipGroup.position.copy(planet.position).add(new THREE.Vector3(0, 0, planet.radius + 1800));
        this.userShipGroup.quaternion.identity();
        this.engine.shipController.velocity.set(0, 0, 0);
        this.nearestAtmospherePlanet = planet;
        this.enterNearestAtmosphere();
        return this.atmosphereMode.isActive;
      },
      dropToSurface: () => {
        if (!this.userShipGroup || !this.atmosphereMode.isActive) return false;
        this.userShipGroup.position.y -= 3000;
        return true;
      },
      exitAtmosphere: () => {
        if (this.atmosphereMode.isActive) this.atmosphereMode.exit();
        return !this.atmosphereMode.isActive;
      },
      getState: () => ({
        active: this.atmosphereMode.isActive,
        activeScene: this.engine.activeScene.name || 'Scene',
        css2dVisible: this.engine.css2dRenderer.domElement.style.display !== 'none',
        nearest: this.nearestAtmospherePlanet?.name || null,
        planetCount: this.planetBuilder.spacePlanets.length,
        level: this.atmosphereMode.getLevelDebugSummary(),
      }),
      getManifestSummary: () => ({
        worldSeed: this.planetBuilder.worldSeed,
        planets: this.planetBuilder.spacePlanets.slice(0, 12).map((planet) => ({
          planetId: planet.planetId,
          name: planet.name,
          biome: planet.manifest.biome,
          archetype: planet.manifest.levelDesign.archetype,
          landform: planet.manifest.terrainProfile.landform,
          vegetationShape: planet.manifest.assetProfile.vegetationShape,
          propSets: planet.manifest.levelDesign.propSets.map((set) => set.id),
          landmarkSets: planet.manifest.levelDesign.landmarkSets.map((set) => set.id),
          seed: planet.manifest.seed,
        })),
      }),
    };
  }

  private updateLOD() {
    if (!this.lod0Mesh || !this.lod1Mesh) return;

    this.cameraFrustum.setFromProjectionMatrix(
      this.projScreenMatrix.multiplyMatrices(this.engine.camera.projectionMatrix, this.engine.camera.matrixWorldInverse)
    );

    let isJamming = false;
    let nebulaColorHex: string | null = null;
    if (this.userShipGroup) {
      const activeNebula = this.cosmos.getNebulaAtPosition(this.userShipGroup.position);
      if (activeNebula) {
        isJamming = true;
        nebulaColorHex = '#' + activeNebula.color.getHexString();
      }
    }
    this.ui.updateNebulaEffect(nebulaColorHex);

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

  private handleRaycasting() {
    const now = Date.now();
    if (now - this.lastRaycastTime > 100) {
      this.lastRaycastTime = now;
      this.raycaster.setFromCamera(this.mouse, this.engine.camera);
      const hits = this.raycaster.intersectObjects(this.starMeshes, false);

      if (hits.length > 0) {
        const hit = hits[0].object;
        
        if (!hit.userData.isBaseShip) {
          if (this.hoveredObject !== hit) {
            if (this.hoveredObject && !this.hoveredObject.userData.isBaseShip) {
              gsap.to(this.hoveredObject.scale, { x: 1, y: 1, z: 1, duration: 0.15 });
            }
            this.hoveredObject = hit;
            gsap.to(hit.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.15 });
            document.body.style.cursor = 'pointer';
          }
        }
      } else {
        if (this.hoveredObject && !this.hoveredObject.userData.isBaseShip) {
          gsap.to(this.hoveredObject.scale, { x: 1, y: 1, z: 1, duration: 0.15 });
          this.hoveredObject = null;
          document.body.style.cursor = 'default';
        }
        this.hoveredObject = null;
        document.body.style.cursor = 'default';
      }
    }
  }

  public spawnUserShip(auth: AuthManager) {
    this.authManager = auth;
    this.removeUserShip();
    this.cinematicSystem.cleanup();

    if (!auth.profile || !auth.user) return;
    
    this.engine.shipController.laserColor = this.combatSystem.laserColor;

    this.multiplayer.init(auth.profile.id, auth.profile.username || 'Pilot');

    // Bind Combat Callbacks
    this.multiplayer.onShootCallback = (data) => {
      const dir = new THREE.Vector3(data.dirx, data.diry, data.dirz).normalize();
      const startPos = new THREE.Vector3();
      const p = this.multiplayer.players.get(data.id);
      if (p) startPos.copy(p.position);
      
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
          this.combatSystem.createMuzzleFlashAt(muzzlePosition, laserColorHex);

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
        this.combatSystem.createMuzzleFlashAt(muzzlePosition, 0xffaa00);

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
        this.combatSystem.createMuzzleFlashAt(muzzlePosition, laserColorHex);
        
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

        if (data.killerId === auth.profile?.id) {
           window.localPlayerBounty += Math.floor(p.bounty * 0.5);
           this.engine.shipController.healShield(100);
           this.ui.updateShield(this.engine.shipController.currentShield, this.engine.shipController.maxShield);
        }
      } else if (data.killedId === auth.profile?.id) {
        // Handled locally
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

    if (p.position_x !== 0 || p.position_y !== 0 || p.position_z !== 0) {
      group.position.set(p.position_x, p.position_y, p.position_z);
    } else {
      group.position.copy(spawnPos);
    }

    this.userShipGroup = group;
    this.engine.scene.add(group);
    this.engine.shipController.setShip(group);
    this.loadVoiceChat();
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
    this.voiceChatLoadVersion += 1;
    if (this.atmosphereMode.isActive) {
      this.atmosphereMode.exit();
    }
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
    this.cinematicSystem.playStartCinematic();
  }

  public resetStartCinematic() {
    this.cinematicSystem.resetStartCinematic();
  }
}
