import * as THREE from 'three';

export class CockpitHUD {
  public group: THREE.Group;
  
  // Canvases and contexts for 3D HUD holographic screens
  private leftCtx!: CanvasRenderingContext2D;
  private leftTexture!: THREE.CanvasTexture;
  private leftMesh!: THREE.Mesh;

  private rightCtx!: CanvasRenderingContext2D;
  private rightTexture!: THREE.CanvasTexture;
  private rightMesh!: THREE.Mesh;

  private centerCtx!: CanvasRenderingContext2D;
  private centerTexture!: THREE.CanvasTexture;
  private centerMesh!: THREE.Mesh;

  // Glitch effects
  private glitchTimer = 0;
  private glitchIntensity = 0;

  // Log messages scrolling inside center screen
  private systemLogs: string[] = [
    "SYS INIT COMPLETE",
    "FIGHTER MODULE: ACTIVE",
    "HYPERDRIVE CORRELATION: 100%",
    "SECTOR: DEEP SPACE TRANSIT"
  ];
  private logTimer = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private shipController: any
  ) {
    this.group = new THREE.Group();
    
    // Add group directly to camera so it moves/rotates as a screen-space FPV attachment
    this.camera.add(this.group);

    this.createCockpitGeometry();
    this.createHolographicScreens();

    this.group.visible = false;

    // Listen to damage events to trigger HUD glitches
    window.addEventListener('ShipDamaged', (e: any) => {
      this.glitchTimer = 0.5; // 0.5 seconds of visual static noise
      this.glitchIntensity = Math.min(1.0, (e.detail?.amount || 20) / 100 + 0.2);
      
      // Add battle damage log message
      this.addSystemLog(`CRITICAL IMPACT DETECTED: -${Math.ceil(e.detail?.amount || 20)}HP`);
    });

    window.addEventListener('SubsystemDamaged', (e: any) => {
      this.glitchTimer = 0.4;
      this.glitchIntensity = 0.7;
      const sys = e.detail?.system ? e.detail.system.toUpperCase() : 'SYSTEM';
      this.addSystemLog(`subsystem damage: ${sys} at ${Math.round(e.detail?.health || 0)}%`);
    });

    window.addEventListener('WeaponMisfire', () => {
      this.glitchTimer = 0.3;
      this.glitchIntensity = 0.5;
      this.addSystemLog(`CRITICAL WARNING: LASER CORE MISFIRE!`);
    });
  }

  private addSystemLog(msg: string) {
    this.systemLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (this.systemLogs.length > 5) {
      this.systemLogs.shift();
    }
  }

  private createCockpitGeometry() {
    // 1. Metal cockpit frame struts for a robust Sci-Fi fighter feel
    const strutMat = new THREE.MeshStandardMaterial({
      color: 0x121217,
      metalness: 0.9,
      roughness: 0.15,
      toneMapped: false
    });

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    // We build the geometry relative to the camera (Z goes negative forward)
    // Left A-pillar strut
    const leftStrut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), strutMat);
    leftStrut.position.set(-6.5, 1, -11);
    leftStrut.rotation.set(0.1, 0, -0.4);
    this.group.add(leftStrut);

    // Left neon visual accent strip
    const leftNeon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 9.8, 0.04), glowMat);
    leftNeon.position.set(-6.4, 1.05, -10.9);
    leftNeon.rotation.copy(leftStrut.rotation);
    this.group.add(leftNeon);

    // Right A-pillar strut
    const rightStrut = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), strutMat);
    rightStrut.position.set(6.5, 1, -11);
    rightStrut.rotation.set(0.1, 0, 0.4);
    this.group.add(rightStrut);

    // Right neon visual accent strip
    const rightNeon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 9.8, 0.04), glowMat);
    rightNeon.position.set(6.4, 1.05, -10.9);
    rightNeon.rotation.copy(rightStrut.rotation);
    this.group.add(rightNeon);

    // Diagonal ceiling crossbars
    const leftCeiling = new THREE.Mesh(new THREE.BoxGeometry(0.2, 8, 0.2), strutMat);
    leftCeiling.position.set(-3.5, 4.5, -9);
    leftCeiling.rotation.set(0.6, 0.5, 0.8);
    this.group.add(leftCeiling);

    const rightCeiling = new THREE.Mesh(new THREE.BoxGeometry(0.2, 8, 0.2), strutMat);
    rightCeiling.position.set(3.5, 4.5, -9);
    rightCeiling.rotation.set(0.6, -0.5, -0.8);
    this.group.add(rightCeiling);

    // Physical Lower Dashboard Base console
    const dashBase = new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 2.5), strutMat);
    dashBase.position.set(0, -4.5, -10);
    dashBase.rotation.set(-0.25, 0, 0);
    this.group.add(dashBase);

    // Additional glowing console lines
    const dashNeon = new THREE.Mesh(new THREE.BoxGeometry(15, 0.05, 0.05), glowMat);
    dashNeon.position.set(0, -3.7, -9.8);
    this.group.add(dashNeon);
  }

  private createHolographicScreens() {
    // 512x512 canvases for crisp textures in FPV
    const createScreenCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });
      
      return { canvas, ctx, texture, mat };
    };

    // 1. LEFT SCREEN (Hull & Shields diagnostics)
    const left = createScreenCanvas();
    this.leftCtx = left.ctx;
    this.leftTexture = left.texture;
    
    this.leftMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), left.mat);
    this.leftMesh.position.set(-5.0, -2.4, -9.0);
    this.leftMesh.rotation.set(0.12, 0.5, -0.05);
    this.group.add(this.leftMesh);

    // 2. RIGHT SCREEN (Engine & Weapon stats)
    const right = createScreenCanvas();
    this.rightCtx = right.ctx;
    this.rightTexture = right.texture;
    
    this.rightMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), right.mat);
    this.rightMesh.position.set(5.0, -2.4, -9.0);
    this.rightMesh.rotation.set(0.12, -0.5, 0.05);
    this.group.add(this.rightMesh);

    // 3. CENTER SCREEN (Artificial horizon, flight logging, critical indicators)
    const center = createScreenCanvas();
    this.centerCtx = center.ctx;
    this.centerTexture = center.texture;
    
    this.centerMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), center.mat);
    this.centerMesh.position.set(0.0, -3.2, -8.2);
    this.centerMesh.rotation.set(0.25, 0, 0);
    this.group.add(this.centerMesh);
  }

  public update(dt: number, isJamming: boolean = false) {
    if (!this.group.visible) return;

    // Handle Log Timings
    this.logTimer += dt;
    if (this.logTimer > 8.0) {
      this.logTimer = 0;
      const logs = [
        "SYSTEM ENVELOPE: OPTIMAL",
        "STABILIZER INERTIA: DAMPED",
        "COSMOS RADIANCE INDEX: G4",
        "THRUSTER DISCHARGE: CLEAN",
        "AUTO-HORIZON TRACKING..."
      ];
      this.addSystemLog(logs[Math.floor(Math.random() * logs.length)]);
    }

    // Handle glitch timer decay
    if (this.glitchTimer > 0) {
      this.glitchTimer -= dt;
      if (this.glitchTimer < 0) this.glitchTimer = 0;
    }

    // Get live telemetry values
    const currentHP = this.shipController.currentHP;
    const maxHP = this.shipController.maxHP;
    const currentShield = this.shipController.currentShield;
    const maxShield = this.shipController.maxShield;
    const currentBoost = this.shipController.currentBoost;
    const maxBoost = this.shipController.maxBoost;
    const velocity = this.shipController.velocity.length();
    const isBoosting = this.shipController.isBoosting;
    
    let activeColor = '#00ffcc';
    if (this.shipController.currentHP / this.shipController.maxHP < 0.3) {
      activeColor = '#ff3333';
    }

    // Render left, right and center holographic HUD canvases
    this.renderLeftScreen(currentHP, maxHP, currentShield, maxShield, activeColor);
    this.renderRightScreen(velocity, currentBoost, maxBoost, isBoosting);
    this.renderCenterScreen(isJamming);
  }

  private applyGlitchEffect(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.glitchTimer <= 0) return;

    const intensity = this.glitchIntensity * (this.glitchTimer / 0.5);
    
    // Horizontal shifting glitch offsets
    const numOffsets = Math.floor(5 + Math.random() * 8);
    for (let i = 0; i < numOffsets; i++) {
      const sliceY = Math.random() * height;
      const sliceH = 10 + Math.random() * 40;
      const offsetX = (Math.random() - 0.5) * 50 * intensity;
      
      ctx.drawImage(
        ctx.canvas,
        0, sliceY, width, sliceH,
        offsetX, sliceY, width, sliceH
      );
    }

    // Render random digital static noise strips (glitched lines)
    if (Math.random() < 0.4) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,51,51,0.3)' : 'rgba(0,255,204,0.3)';
      ctx.fillRect(0, Math.random() * height, width, 2 + Math.random() * 10);
    }
  }

  private renderLeftScreen(currentHP: number, maxHP: number, currentShield: number, maxShield: number, baseColor: string) {
    const ctx = this.leftCtx;
    const w = 512;
    const h = 512;

    ctx.clearRect(0, 0, w, h);

    // Holographic background grids
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    // Holographic Border outline with brackets
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);

    ctx.fillStyle = 'rgba(0, 204, 255, 0.02)';
    ctx.fillRect(16, 16, w - 32, h - 32);

    // Screen title
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.95)';
    ctx.fillText("HULL & DEFLECTORS", 35, 60);
    ctx.fillText("DIAGNOSTIC CORE", 35, 90);

    // Divider line
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)';
    ctx.beginPath(); ctx.moveTo(35, 110); ctx.lineTo(w - 35, 110); ctx.stroke();

    // 1. DEFLECTOR SHIELD STATS (Circular progress arc)
    const shldPct = Math.max(0, currentShield / maxShield);
    const circleX = 150;
    const circleY = 280;
    const radius = 90;

    // Background circle
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.08)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Foreground shield arc
    ctx.strokeStyle = shldPct < 0.3 ? '#ff3333' : '#00ccff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(circleX, circleY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shldPct);
    ctx.stroke();

    // Shield % text inside circular arc
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = shldPct < 0.3 ? '#ff3333' : '#00ccff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(shldPct * 100)}%`, circleX, circleY + 12);
    
    ctx.font = '16px monospace';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.7)';
    ctx.fillText("SHIELD CORE", circleX, circleY + 130);

    // 2. HULL INTEGRITY (Horizontal bar meter)
    const hullPct = Math.max(0, currentHP / maxHP);
    const barX = 290;
    const barY = 220;
    const barW = 180;
    const barH = 24;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.8)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText("HULL INTEGRITY", barX, barY - 12);

    // Background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.3)';
    ctx.strokeRect(barX, barY, barW, barH);

    // Foreground filled hull bar
    ctx.fillStyle = baseColor; // Changes to red when critical
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * hullPct, barH - 4);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.ceil(currentHP)} / ${maxHP} HP`, barX, barY + 54);

    // 3. SUBSYSTEM METERING
    const subs = this.shipController.subsystems || { engines: 100, weapons: 100, shieldGenerator: 100 };
    
    // Subsystem 1: ENGINES (y: 310)
    const engY = 310;
    ctx.fillStyle = 'rgba(0, 204, 255, 0.7)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`ENGINES: ${Math.round(subs.engines)}%`, barX, engY - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX, engY, barW, 6);
    ctx.fillStyle = subs.engines < 50 ? '#ff3333' : '#00ffcc';
    ctx.fillRect(barX, engY, barW * (subs.engines / 100), 6);

    // Subsystem 2: WEAPONS (y: 350)
    const wepY_sub = 350;
    ctx.fillStyle = 'rgba(0, 204, 255, 0.7)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`WEAPONS: ${Math.round(subs.weapons)}%`, barX, wepY_sub - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX, wepY_sub, barW, 6);
    ctx.fillStyle = subs.weapons < 50 ? '#ff3333' : '#00ffcc';
    ctx.fillRect(barX, wepY_sub, barW * (subs.weapons / 100), 6);

    // Subsystem 3: SHIELD GEN (y: 390)
    const genY = 390;
    ctx.fillStyle = 'rgba(0, 204, 255, 0.7)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`SHIELD GEN: ${Math.round(subs.shieldGenerator)}%`, barX, genY - 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX, genY, barW, 6);
    ctx.fillStyle = subs.shieldGenerator < 50 ? '#ff3333' : '#00ffcc';
    ctx.fillRect(barX, genY, barW * (subs.shieldGenerator / 100), 6);

    // Tech logs diagnostics at bottom shifted down
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(0, 255, 204, 0.75)';
    ctx.fillText(`SYS VOLTAGE: 24.8V // REGEN RATE: ${shldPct < 1 ? '15.0/S' : 'STABLE'}`, 35, 465);
    ctx.fillText(`ARMOR DENSITY: STANDARD COATING`, 35, 485);

    // Apply hit damage glitch overlay if applicable
    this.applyGlitchEffect(ctx, w, h);
    
    this.leftTexture.needsUpdate = true;
  }

  private renderRightScreen(velocity: number, currentBoost: number, maxBoost: number, isBoosting: boolean) {
    const ctx = this.rightCtx;
    const w = 512;
    const h = 512;

    ctx.clearRect(0, 0, w, h);

    // Holographic background grids
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    // Outer border brackets
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);

    ctx.fillStyle = 'rgba(0, 204, 255, 0.02)';
    ctx.fillRect(16, 16, w - 32, h - 32);

    // Screen title
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.95)';
    ctx.fillText("ENGINES & WEAPONS", 35, 60);
    ctx.fillText("PROPULSION METER", 35, 90);

    // Divider line
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)';
    ctx.beginPath(); ctx.moveTo(35, 110); ctx.lineTo(w - 35, 110); ctx.stroke();

    // 1. SPEED INDICATOR
    ctx.fillStyle = 'rgba(0, 204, 255, 0.8)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText("VELOCITY DIAL", 35, 160);

    // Draw circular speedometer
    const dialX = 120;
    const dialY = 280;
    const dialR = 75;
    const speedRatio = Math.min(1.0, velocity / 550); // limit baseline speed 550

    ctx.strokeStyle = 'rgba(0, 204, 255, 0.08)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR, Math.PI * 0.8, Math.PI * 0.8 + (Math.PI * 1.4 * speedRatio));
    ctx.stroke();

    // Speed text in center
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.round(velocity * 1.8)}`, dialX, dialY + 4);
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.7)';
    ctx.fillText("KM/H", dialX, dialY + 22);

    // 2. ENGINE BOOST METER
    const boostPct = Math.max(0, currentBoost / maxBoost);
    const meterX = 230;
    const meterY = 200;
    const meterW = 240;
    const meterH = 14;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0, 204, 255, 0.8)';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`ENGINE BOOST [ ${isBoosting ? 'WARP BOOST' : 'READY'} ]`, meterX, meterY - 8);

    // Background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(meterX, meterY, meterW, meterH);
    ctx.strokeStyle = 'rgba(0, 204, 255, 0.25)';
    ctx.strokeRect(meterX, meterY, meterW, meterH);

    // Foreground filled bar
    ctx.fillStyle = isBoosting ? '#00ffcc' : boostPct < 0.2 ? '#ff3333' : '#ffaa00';
    ctx.fillRect(meterX + 1, meterY + 1, (meterW - 2) * boostPct, meterH - 2);

    // 3. WEAPON INDICATOR
    const wepY = 310;
    ctx.fillStyle = 'rgba(0, 204, 255, 0.8)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText("TACTICAL ARMAMENT", meterX, wepY);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText("LASER PLASMA CORES", meterX, wepY + 30);

    const laserTypeStr = this.shipController.laserColor === 'red' ? 'CRIMSON PLASMA (FAST)' : 'BLUE HYDRO-PULSE (STABLE)';
    ctx.fillStyle = this.shipController.laserColor === 'red' ? '#ff3333' : '#00ccff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`TYPE: ${laserTypeStr}`, meterX, wepY + 54);

    // Technical status specs
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(0, 255, 204, 0.75)';
    ctx.fillText(`PROPULSION DISCHARGE COIL: ACTIVE`, 35, 450);
    ctx.fillText(`COOLING FLUID LEVEL: 100% // PUMP: ON`, 35, 475);

    // Apply damage glitch overlay
    this.applyGlitchEffect(ctx, w, h);

    this.rightTexture.needsUpdate = true;
  }

  private renderCenterScreen(isJamming: boolean) {
    const ctx = this.centerCtx;
    const w = 512;
    const h = 512;

    ctx.clearRect(0, 0, w, h);

    // Holographic background grids
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    // Tactical HUD crosshairs overlay
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w/2, h/2, 100, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w/2, h/2, 140, 0, Math.PI * 2); ctx.stroke();

    // Tech crosshair ticks
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
    // Left tick
    ctx.beginPath(); ctx.moveTo(w/2 - 160, h/2); ctx.lineTo(w/2 - 120, h/2); ctx.stroke();
    // Right tick
    ctx.beginPath(); ctx.moveTo(w/2 + 120, h/2); ctx.lineTo(w/2 + 160, h/2); ctx.stroke();
    // Top tick
    ctx.beginPath(); ctx.moveTo(w/2, h/2 - 160); ctx.lineTo(w/2, h/2 - 120); ctx.stroke();
    // Bottom tick
    ctx.beginPath(); ctx.moveTo(w/2, h/2 + 120); ctx.lineTo(w/2, h/2 + 160); ctx.stroke();

    // 1. DYNAMIC ARTIFICIAL HORIZON / FLIGHT LADDER
    // Use ship angular velocity to draw beautiful rolling/pitching ladder lines
    const pitchVal = this.shipController.angularVelocity.x * 20;
    const rollAngle = this.shipController.angularVelocity.z * 0.15;

    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(rollAngle);
    
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.6)';
    ctx.lineWidth = 3;

    // Pitch ladder line 1
    const pY1 = -50 + pitchVal;
    ctx.beginPath();
    ctx.moveTo(-60, pY1); ctx.lineTo(-20, pY1);
    ctx.lineTo(-20, pY1 + 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(20, pY1); ctx.lineTo(60, pY1);
    ctx.lineTo(60, pY1 + 10);
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(0, 255, 204, 0.8)';
    ctx.textAlign = 'right';
    ctx.fillText("+10", -65, pY1 + 5);
    ctx.textAlign = 'left';
    ctx.fillText("+10", 65, pY1 + 5);

    // Pitch ladder line 2
    const pY2 = 50 + pitchVal;
    ctx.beginPath();
    ctx.moveTo(-60, pY2); ctx.lineTo(-20, pY2);
    ctx.lineTo(-20, pY2 - 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(20, pY2); ctx.lineTo(60, pY2);
    ctx.lineTo(60, pY2 - 10);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillText("-10", -65, pY2 - 2);
    ctx.textAlign = 'left';
    ctx.fillText("-10", 65, pY2 - 2);

    ctx.restore();

    // 2. RADAR JAMMING WARNING
    if (isJamming) {
      ctx.fillStyle = 'rgba(255, 51, 51, 0.12)';
      ctx.fillRect(50, 40, w - 100, 50);
      
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.strokeRect(50, 40, w - 100, 50);

      // Blinking text
      if (Math.floor(Date.now() / 300) % 2 === 0) {
        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("⚠️ WARNING: RADAR JAMMED // SYS: JAMM", w/2, 72);
      }
    } else {
      // Normal flight tracking status
      ctx.fillStyle = 'rgba(0, 255, 204, 0.8)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText("TACTICAL FLIGHT COORDINATOR", w/2, 65);
    }

    // 3. FLIGHT DIAGNOSTICS LOG WINDOW (Scrolling logs)
    const logBoxY = 380;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(30, logBoxY, w - 60, 110);
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, logBoxY, w - 60, 110);

    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = 'rgba(0, 255, 204, 0.9)';
    ctx.fillText("LOGS // FLIGHT CO-PROCESSOR:", 45, logBoxY + 20);

    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(0, 255, 204, 0.7)';
    this.systemLogs.forEach((log, idx) => {
      ctx.fillText(log, 45, logBoxY + 40 + idx * 13);
    });

    // Apply hit damage glitch overlay
    this.applyGlitchEffect(ctx, w, h);

    this.centerTexture.needsUpdate = true;
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
    
    // Toggle standard flat HTML indicators to avoid cluttering in First Person FPV mode
    const statsContainer = document.getElementById('hud-stats-container') || document.querySelector('.stats-container');
    const crosshair2D = document.getElementById('hud-crosshair');
    
    if (visible) {
      if (statsContainer) (statsContainer as HTMLElement).style.display = 'none';
      if (crosshair2D) (crosshair2D as HTMLElement).style.display = 'none';
    } else {
      if (statsContainer) (statsContainer as HTMLElement).style.display = 'flex';
      if (crosshair2D) (crosshair2D as HTMLElement).style.display = 'block';
    }
  }

  public dispose() {
    this.camera.remove(this.group);
    
    // Dispose resources to prevent GPU memory leaks
    this.leftTexture.dispose();
    this.leftMesh.geometry.dispose();
    if (Array.isArray(this.leftMesh.material)) {
      this.leftMesh.material.forEach(m => m.dispose());
    } else {
      this.leftMesh.material.dispose();
    }

    this.rightTexture.dispose();
    this.rightMesh.geometry.dispose();
    if (Array.isArray(this.rightMesh.material)) {
      this.rightMesh.material.forEach(m => m.dispose());
    } else {
      this.rightMesh.material.dispose();
    }

    this.centerTexture.dispose();
    this.centerMesh.geometry.dispose();
    if (Array.isArray(this.centerMesh.material)) {
      this.centerMesh.material.forEach(m => m.dispose());
    } else {
      this.centerMesh.material.dispose();
    }
  }
}
