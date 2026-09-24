import { RadarUI } from './RadarUI';
import { MobileControlsUI } from './MobileFlightControlsUI';
import { ChatUI } from './ChatUI';
import { FlightStatusUI } from './FlightStatusUI';
import { hudPanels } from './HudPanels';
import { hudIcon, windowHeader } from './HudArt';
import { TopCommandBarUI } from './TopCommandBarUI';
import { CockpitFrameUI } from './CockpitFrameUI';
import { DeathScreenUI } from './DeathScreenUI';
import './styles/hud-theme.css';
import './styles/crosshair.css';


export class UIManager {
  private layer: HTMLElement;
  
  private nebulaOverlay!: HTMLDivElement;
  private flightStatusUI!: FlightStatusUI;
  private topCommandBarUI!: TopCommandBarUI;
  private deathScreenUI!: DeathScreenUI;

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
    
    document.body.classList.add('titan-ui');
    window.addEventListener('HudPanelState', event => {
      this.shipController?.setInputBlocked('hud-panel', (event as CustomEvent).detail.blocking);
    });

    new CockpitFrameUI(layer);
    this.initUI();
    this.deathScreenUI = new DeathScreenUI();
    this.flightStatusUI = new FlightStatusUI(layer);
    this.initHangarUI();
    this.radarUI = new RadarUI(layer);
    this.mobileControlsUI = new MobileControlsUI();
    this.chatUI = new ChatUI(layer);
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
    // Crosshair - Premium Reticle
    const crosshair = document.createElement('div');
    crosshair.id = 'hud-crosshair';
    
    crosshair.setAttribute('aria-hidden', 'true');
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

  public showDeathScreen(seconds: number) {
    hudPanels.closeAll();
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
    this.hangarPanel.id = 'hangar-panel';
    this.hangarPanel.className = 'hud-window hud-window--center hangar-panel';
    this.hangarPanel.setAttribute('aria-label', 'Hangar');
    this.layer.appendChild(this.hangarPanel);
    hudPanels.register('hangar', { element: this.hangarPanel, onOpen: () => this.renderHangarPanel() });
  }

  public toggleHangar() {
    if (!this.hangarBtn.disabled) hudPanels.toggle('hangar', this.hangarBtn);
  }

  public setHangarAvailable(available: boolean) {
    this.hangarBtn.disabled = !available;
    this.hangarBtn.title = available ? 'Open hangar' : 'Available near Earth Base';
    if (!available) hudPanels.close('hangar');
  }

  private renderHangarPanel() {
    if (!this.shipController) return;

    const sc = this.shipController;
    const bounty = (window as any).localPlayerBounty || 0;

    const subs = sc.subsystems;
    const needsSysRepair = subs.engines < 100 || subs.weapons < 100 || subs.shieldGenerator < 100;
    const needsHullRepair = sc.currentHP < sc.maxHP;

    const card = (icon: Parameters<typeof hudIcon>[0], title: string, description: string, id: string, label: string, disabled: boolean) =>
      `<article class="hangar-card">${hudIcon(icon)}<h3>${title}</h3><p>${description}</p><button type="button" id="${id}" ${disabled ? 'disabled' : ''}>${label}</button></article>`;
    this.hangarPanel.innerHTML = windowHeader('HANGAR', 'hangar') +
      `<div class="hangar-content"><div class="hangar-balance"><span>EARTH BASE · MAINTENANCE BAY</span><strong>${bounty.toLocaleString('en-US')} BNTY</strong></div>
      <h3 class="hangar-section-title">MAINTENANCE</h3><div class="hangar-maintenance">
      ${card('hull', 'HULL INTEGRITY', `Restore hull plating. ${Math.ceil(sc.currentHP)} / ${sc.maxHP} HP`, 'btn-repair-hull', 'REPAIR · 80 BNTY', !needsHullRepair || bounty < 80)}
      ${card('systems', 'SUBSYSTEMS', `ENG ${Math.round(subs.engines)}% · WPN ${Math.round(subs.weapons)}% · GEN ${Math.round(subs.shieldGenerator)}%`, 'btn-repair-systems', 'REPAIR · 50 BNTY', !needsSysRepair || bounty < 50)}
      </div><h3 class="hangar-section-title">WEAPON ARSENAL</h3><div class="hangar-weapons">
      ${card('laser', 'PULSE LASER', 'Rapid fire. Energy-efficient pulses.', 'btn-equip-laser', sc.activeWeapon === 'laser' ? 'EQUIPPED' : 'EQUIP', sc.activeWeapon === 'laser')}
      ${card('shotgun', 'PLASMA SHOTGUN', 'Three short-range plasma bolts.', 'btn-buy-shotgun', sc.hasShotgun ? (sc.activeWeapon === 'shotgun' ? 'EQUIPPED' : 'EQUIP') : 'BUY · 150 BNTY', sc.activeWeapon === 'shotgun' || (!sc.hasShotgun && bounty < 150))}
      ${card('missile', 'HOMING MISSILES', 'Auto-targeting explosive rockets.', 'btn-buy-missile', sc.hasMissile ? (sc.activeWeapon === 'missile' ? 'EQUIPPED' : 'EQUIP') : 'BUY · 250 BNTY', sc.activeWeapon === 'missile' || (!sc.hasMissile && bounty < 250))}
      </div></div>`;
    this.hangarPanel.querySelector('.hud-close')!.id = 'btn-hangar-close';

    // Bind event listeners
    const btnRepairHull = this.hangarPanel.querySelector('#btn-repair-hull') as HTMLButtonElement;
    if (btnRepairHull && needsHullRepair && bounty >= 80) {
      btnRepairHull.onclick = () => {
        if (sc.networkAction) { sc.networkAction('repair', { item: 'hull' }); setTimeout(() => this.renderHangarPanel(), 250); return; }
        (window as any).localPlayerBounty -= 80;
        sc.currentHP = sc.maxHP;
        this.updateHP(sc.currentHP, sc.maxHP);
        this.renderHangarPanel();
      };
    }

    const btnRepairSystems = this.hangarPanel.querySelector('#btn-repair-systems') as HTMLButtonElement;
    if (btnRepairSystems && needsSysRepair && bounty >= 50) {
      btnRepairSystems.onclick = () => {
        if (sc.networkAction) { sc.networkAction('repair', { item: 'systems' }); setTimeout(() => this.renderHangarPanel(), 250); return; }
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
        window.dispatchEvent(new CustomEvent('WeaponChanged', { detail: sc.activeWeapon }));
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
        window.dispatchEvent(new CustomEvent('WeaponChanged', { detail: sc.activeWeapon }));
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
        window.dispatchEvent(new CustomEvent('WeaponChanged', { detail: sc.activeWeapon }));
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
    sc?.setInputBlocked('hud-panel', hudPanels.blocking);
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
