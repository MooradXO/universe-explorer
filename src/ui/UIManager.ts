import { MarketUI } from './MarketUI';
import { RadarUI } from './RadarUI';
import { MobileControlsUI } from './MobileFlightControlsUI';
import { ChatUI } from './ChatUI';
import { FlightStatusUI } from './FlightStatusUI';
import { CombatControlsUI } from './CombatControlsUI';
import { TopCommandBarUI } from './TopCommandBarUI';
import { AtmospherePromptUI } from './AtmospherePromptUI';
import { CockpitFrameUI } from './CockpitFrameUI';
import { DeathScreenUI } from './DeathScreenUI';
import './styles/hud-theme.css';
import './styles/crosshair.css';
import './styles/hangar.css';
import './styles/object-panel.css';

export class UIManager {
  private layer: HTMLElement;
  private hudPanel!: HTMLDivElement;
  
  private nebulaOverlay!: HTMLDivElement;
  private flightStatusUI!: FlightStatusUI;
  private topCommandBarUI!: TopCommandBarUI;
  private atmosphereUI!: AtmospherePromptUI;
  private deathScreenUI!: DeathScreenUI;

  public marketUI!: MarketUI;
  private radarUI!: RadarUI;
  private mobileControlsUI!: MobileControlsUI;
  private chatUI!: ChatUI;

  public timeMultiplier: number = 1;

  // Hangar Elements
  public hangarBtn!: HTMLButtonElement;
  public hangarPanel!: HTMLDivElement;
  private shipController: any = null;

  public get portraitBlocker(): HTMLDivElement {
    return this.mobileControlsUI?.portraitBlocker;
  }

  public get chatIconBtn(): HTMLButtonElement {
    return this.chatUI?.chatIconBtn;
  }

  constructor(layer: HTMLElement) {
    this.layer = layer;
    
    // Global UI panels controller (only one panel open at a time)
    (window as any).closeAllPanelsExcept = (exceptId: string) => {
      const actionsPanel = document.querySelector('.actions-panel') as HTMLElement;
      const leaderboard = document.getElementById('leaderboard-container') as HTMLElement;
      const authPanel = document.getElementById('auth-panel-wrapper') as HTMLElement;
      const chatContainer = this.chatUI ? (this.chatUI as any).chatContainer : null;
      const hangar = this.hangarPanel;

      if (actionsPanel && exceptId !== 'actions-panel') {
        actionsPanel.style.display = 'none';
        const hint = document.querySelector('.controls-hint') as HTMLElement;
        if (hint) hint.classList.remove('active');
      }
      if (leaderboard && exceptId !== 'leaderboard-container') {
        leaderboard.style.display = 'none';
      }
      if (authPanel && exceptId !== 'auth-panel-wrapper') {
        authPanel.style.display = 'none';
      }
      if (chatContainer && exceptId !== 'chat-container') {
        chatContainer.style.display = 'none';
      }
      if (hangar && exceptId !== 'hangar-panel') {
        hangar.style.display = 'none';
      }
    };

    this.marketUI = new MarketUI(layer);
    new CockpitFrameUI(layer);
    this.initUI();
    this.deathScreenUI = new DeathScreenUI();
    this.atmosphereUI = new AtmospherePromptUI(layer);
    this.flightStatusUI = new FlightStatusUI(layer);
    new CombatControlsUI(layer);
    this.initHangarUI();
    this.radarUI = new RadarUI(layer);
    this.mobileControlsUI = new MobileControlsUI();
    this.chatUI = new ChatUI(layer, (window as any).closeAllPanelsExcept);
    this.topCommandBarUI = new TopCommandBarUI(layer, {
      onWarpToBase: () => window.dispatchEvent(new CustomEvent('ReturnToBase')),
      onToggleHangar: () => this.toggleHangar(),
      onToggleComms: () => this.chatUI.chatIconBtn.click(),
    });
    this.hangarBtn = this.topCommandBarUI.hangarButton;

    // Initialize Nebula Overlay for visual dust effects
    this.nebulaOverlay = document.createElement('div');
    this.nebulaOverlay.id = 'nebula-overlay';
    this.nebulaOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 5;
      opacity: 0;
      transition: opacity 1.8s ease, background 1.8s ease;
      mix-blend-mode: screen;
    `;
    this.layer.appendChild(this.nebulaOverlay);
  }

  private initUI() {
    // HUD Panel (shown when clicking a star)
    this.hudPanel = document.createElement('div');
    this.hudPanel.className = 'hud-panel';

    const title = document.createElement('h2');
    title.id = 'hud-title';
    title.textContent = 'Object Name';

    const type = document.createElement('p');
    type.id = 'hud-type';
    type.textContent = 'Object Type';

    const returnBtn = document.createElement('button');
    returnBtn.className = 'btn-primary';
    returnBtn.textContent = '[ RETURN TO ORBIT ]';
    returnBtn.onclick = () => {
      this.hideHUD();
      window.dispatchEvent(new CustomEvent('ReturnToOrbit'));
    };

    this.hudPanel.appendChild(title);
    this.hudPanel.appendChild(type);
    this.hudPanel.appendChild(returnBtn);
    this.layer.appendChild(this.hudPanel);

    // Crosshair - Premium Reticle
    const crosshair = document.createElement('div');
    crosshair.id = 'hud-crosshair';
    
    const dot = document.createElement('div');
    dot.className = 'dot';
    crosshair.appendChild(dot);

    const ring = document.createElement('div');
    ring.className = 'ring';
    crosshair.appendChild(ring);

    const brackets = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const bClass of brackets) {
      const b = document.createElement('div');
      b.className = `bracket ${bClass}`;
      crosshair.appendChild(b);
    }

    const ticks = ['left', 'right', 'top', 'bottom'];
    for (const tClass of ticks) {
      const t = document.createElement('div');
      t.className = `tick ${tClass}`;
      crosshair.appendChild(t);
    }

    this.layer.appendChild(crosshair);

  }

  public updateHP(current: number, max: number) {
    this.flightStatusUI.updateHP(current, max);
  }

  public updateShield(current: number, max: number) {
    this.flightStatusUI.updateShield(current, max);
  }

  public updateBoost(current: number, max: number) {
    this.flightStatusUI.updateBoost(current, max);
  }

  public addKillFeed(killer: string, killed: string) {
    this.flightStatusUI.addKillFeed(killer, killed);
  }

  public showHUD(name: string, type: string) {
    const title = this.hudPanel.querySelector('#hud-title');
    const typeEl = this.hudPanel.querySelector('#hud-type');
    if (title) title.textContent = name;
    if (typeEl) typeEl.textContent = 'Type: ' + type;
    this.hudPanel.classList.add('active');
  }

  public hideHUD() {
    this.hudPanel.classList.remove('active');
  }

  public showAtmospherePrompt(planetName: string, actionLabel: string) {
    this.atmosphereUI.showPrompt(planetName, actionLabel);
  }

  public hideAtmospherePrompt() {
    this.atmosphereUI.hidePrompt();
  }

  public showAtmosphereLoading(label: string) {
    this.atmosphereUI.showLoading(label);
  }

  public hideAtmosphereLoading() {
    this.atmosphereUI.hideLoading();
  }

  public showAtmosphereStatus(planetName: string) {
    this.atmosphereUI.showStatus(planetName);
  }

  public hideAtmosphereStatus() {
    this.atmosphereUI.hideStatus();
  }

  public showDeathScreen(seconds: number) {
    this.deathScreenUI.show(seconds);
  }

  public updateFPS(fps: number) {
    this.flightStatusUI.updateFPS(fps);
  }

  public updateMinimap(playerX: number, playerZ: number, dots: {id: string, x: number, z: number, isBot: boolean}[], isJamming: boolean = false) {
    this.radarUI.update(playerX, playerZ, dots, isJamming);
  }

  public updateNebulaEffect(colorHexStr: string | null) {
    if (colorHexStr) {
      this.nebulaOverlay.style.background = `radial-gradient(circle, ${colorHexStr}45 0%, ${colorHexStr}18 65%, rgba(0,0,0,0) 100%)`;
      this.nebulaOverlay.style.opacity = '1';
    } else {
      this.nebulaOverlay.style.opacity = '0';
    }
  }

  public updateLeaderboard(players: Map<string, any>) {
    this.topCommandBarUI.updateLeaderboard(players);
  }

  public addChatMessage(username: string, message: string) {
    this.chatUI.addChatMessage(username, message);
  }

  // ── Hangar Subsystem Methods ──
  private initHangarUI() {
    this.hangarPanel = document.createElement('div');
    this.hangarPanel.className = 'hangar-panel';
    this.layer.appendChild(this.hangarPanel);
  }

  public toggleHangar() {
    const isShowing = this.hangarPanel.style.display === 'flex';
    if (!isShowing) {
      (window as any).closeAllPanelsExcept('hangar-panel');
      this.hangarPanel.style.display = 'flex';
      if (document.pointerLockElement) document.exitPointerLock();
      this.renderHangarPanel();
    } else {
      this.hangarPanel.style.display = 'none';
    }
  }

  private renderHangarPanel() {
    if (!this.shipController) return;

    const sc = this.shipController;
    const bounty = (window as any).localPlayerBounty || 0;

    const subs = sc.subsystems;
    const needsSysRepair = subs.engines < 100 || subs.weapons < 100 || subs.shieldGenerator < 100;
    const needsHullRepair = sc.currentHP < sc.maxHP;

    this.hangarPanel.innerHTML = `
      <div class="hangar-header">Base Hangar Facility</div>
      <div class="hangar-bounty">Bounty Balance: ${bounty} BNTY</div>

      <div class="hangar-section-title">Maintenance & Repairs</div>
      <div class="hangar-grid">
        <div class="hangar-item">
          <div style="display:flex;align-items:center;gap:12px;flex-grow:1;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ff3333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:24px;filter:drop-shadow(0 0 5px rgba(255,51,51,0.5));"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <div class="hangar-item-info">
              <span class="hangar-item-name">Hull Integrity Repair</span>
              <span class="hangar-item-desc">Restore main hull plating to 100%. HP: ${Math.ceil(sc.currentHP)}/${sc.maxHP}</span>
            </div>
          </div>
          <button class="bf-btn hangar-btn-action ${(!needsHullRepair || bounty < 80) ? 'disabled' : ''}" id="btn-repair-hull">
            REPAIR (80 BNTY)
          </button>
        </div>

        <div class="hangar-item">
          <div style="display:flex;align-items:center;gap:12px;flex-grow:1;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#00ffcc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:24px;filter:drop-shadow(0 0 5px rgba(0,255,204,0.5));"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>
            <div class="hangar-item-info">
              <span class="hangar-item-name">Subsystem Diagnostics</span>
              <span class="hangar-item-desc">ENG: ${Math.round(subs.engines)}% | WPN: ${Math.round(subs.weapons)}% | GEN: ${Math.round(subs.shieldGenerator)}%</span>
            </div>
          </div>
          <button class="bf-btn hangar-btn-action ${(!needsSysRepair || bounty < 50) ? 'disabled' : ''}" id="btn-repair-systems">
            REPAIR (50 BNTY)
          </button>
        </div>
      </div>

      <div class="hangar-section-title">Weapon Arsenal</div>
      <div class="hangar-grid">
        <div class="hangar-item">
          <div style="display:flex;align-items:center;gap:12px;flex-grow:1;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ff3366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:24px;filter:drop-shadow(0 0 5px rgba(255,51,102,0.5));"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <div class="hangar-item-info">
              <span class="hangar-item-name">Standard Pulse Laser</span>
              <span class="hangar-item-desc">Rapid fire, energy-efficient pulse lasers.</span>
            </div>
          </div>
          <button class="bf-btn hangar-btn-action ${sc.activeWeapon === 'laser' ? 'disabled' : ''}" id="btn-equip-laser">
            ${sc.activeWeapon === 'laser' ? 'EQUIPPED' : 'EQUIP'}
          </button>
        </div>

        <div class="hangar-item">
          <div style="display:flex;align-items:center;gap:12px;flex-grow:1;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:24px;filter:drop-shadow(0 0 5px rgba(255,215,0,0.5));"><circle cx="12" cy="12" r="3"></circle><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="18" cy="18" r="2"></circle><circle cx="6" cy="6" r="2"></circle><line x1="12" y1="2" x2="12" y2="7"></line><line x1="12" y1="17" x2="12" y2="22"></line><line x1="2" y1="12" x2="7" y2="12"></line><line x1="17" y1="12" x2="22" y2="12"></line></svg>
            <div class="hangar-item-info">
              <span class="hangar-item-name">Plasma Shotgun</span>
              <span class="hangar-item-desc">Spreads 3 short-range plasma bolts. Cost: 150 Bounty.</span>
            </div>
          </div>
          <button class="bf-btn hangar-btn-action ${(sc.activeWeapon === 'shotgun') ? 'disabled' : ''}" id="btn-buy-shotgun">
            ${sc.hasShotgun ? (sc.activeWeapon === 'shotgun' ? 'EQUIPPED' : 'EQUIP') : 'BUY (150 BNTY)'}
          </button>
        </div>

        <div class="hangar-item">
          <div style="display:flex;align-items:center;gap:12px;flex-grow:1;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ff8c00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;min-width:24px;filter:drop-shadow(0 0 5px rgba(255,140,0,0.5));"><path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5L18 5l-3-3L4.5 16.5z"></path><path d="M12 9l6 6"></path><path d="M9 6l9 9"></path></svg>
            <div class="hangar-item-info">
              <span class="hangar-item-name">Homing Missiles</span>
              <span class="hangar-item-desc">Auto-targeting high-explosive rockets. Cost: 250 Bounty.</span>
            </div>
          </div>
          <button class="bf-btn hangar-btn-action ${(sc.activeWeapon === 'missile') ? 'disabled' : ''}" id="btn-buy-missile">
            ${sc.hasMissile ? (sc.activeWeapon === 'missile' ? 'EQUIPPED' : 'EQUIP') : 'BUY (250 BNTY)'}
          </button>
        </div>
      </div>

      <button class="bf-btn" style="margin-top: 15px; border-color: #ff3333; color: #ff3333; text-shadow: 0 0 5px #ff3333; box-shadow: 0 0 10px rgba(255,51,51,0.2);" id="btn-hangar-close">[ CLOSE BAY ]</button>
    `;

    // Bind event listeners
    const btnRepairHull = this.hangarPanel.querySelector('#btn-repair-hull') as HTMLButtonElement;
    if (btnRepairHull && needsHullRepair && bounty >= 80) {
      btnRepairHull.onclick = () => {
        (window as any).localPlayerBounty -= 80;
        sc.currentHP = sc.maxHP;
        this.updateHP(sc.currentHP, sc.maxHP);
        this.renderHangarPanel();
      };
    }

    const btnRepairSystems = this.hangarPanel.querySelector('#btn-repair-systems') as HTMLButtonElement;
    if (btnRepairSystems && needsSysRepair && bounty >= 50) {
      btnRepairSystems.onclick = () => {
        (window as any).localPlayerBounty -= 50;
        sc.subsystems.engines = 100;
        sc.subsystems.weapons = 100;
        sc.subsystems.shieldGenerator = 100;
        this.updateSubsystems(100, 100, 100);
        this.renderHangarPanel();
      };
    }

    const btnEquipLaser = this.hangarPanel.querySelector('#btn-equip-laser') as HTMLButtonElement;
    if (btnEquipLaser && sc.activeWeapon !== 'laser') {
      btnEquipLaser.onclick = () => {
        sc.activeWeapon = 'laser';
        this.renderHangarPanel();
      };
    }

    const btnBuyShotgun = this.hangarPanel.querySelector('#btn-buy-shotgun') as HTMLButtonElement;
    if (btnBuyShotgun && sc.activeWeapon !== 'shotgun') {
      btnBuyShotgun.onclick = () => {
        if (sc.hasShotgun) {
          sc.activeWeapon = 'shotgun';
        } else if (bounty >= 150) {
          (window as any).localPlayerBounty -= 150;
          sc.hasShotgun = true;
          sc.activeWeapon = 'shotgun';
        }
        this.renderHangarPanel();
      };
    }

    const btnBuyMissile = this.hangarPanel.querySelector('#btn-buy-missile') as HTMLButtonElement;
    if (btnBuyMissile && sc.activeWeapon !== 'missile') {
      btnBuyMissile.onclick = () => {
        if (sc.hasMissile) {
          sc.activeWeapon = 'missile';
        } else if (bounty >= 250) {
          (window as any).localPlayerBounty -= 250;
          sc.hasMissile = true;
          sc.activeWeapon = 'missile';
        }
        this.renderHangarPanel();
      };
    }

    const btnHangarClose = this.hangarPanel.querySelector('#btn-hangar-close') as HTMLButtonElement;
    if (btnHangarClose) {
      btnHangarClose.onclick = () => {
        this.toggleHangar();
      };
    }
  }

  public setShipController(sc: any) {
    this.shipController = sc;
    if (sc) {
      window.dispatchEvent(new CustomEvent('WeaponChanged', { detail: sc.activeWeapon }));
      window.dispatchEvent(new CustomEvent('LaserColorChanged', { detail: sc.laserColor }));
    }
  }

  public setMobileControlsVisible(visible: boolean) {
    if (this.mobileControlsUI) {
      this.mobileControlsUI.setVisible(visible);
    }
  }

  public updateSubsystems(engines: number, weapons: number, shieldGen: number) {
    this.flightStatusUI.updateSubsystems(engines, weapons, shieldGen);
  }
}
