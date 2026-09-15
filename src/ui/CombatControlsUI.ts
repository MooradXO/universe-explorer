import { usesMobileLayout } from './uiPlatform';
import './styles/combat-controls.css';

type WeaponType = 'laser' | 'shotgun' | 'missile';
type LaserColor = 'red' | 'blue';

const WEAPONS: Array<{ type: WeaponType; key: string; label: string; code: string }> = [
  { type: 'laser', key: '1', label: 'Laser', code: 'LSR' },
  { type: 'shotgun', key: '2', label: 'Scatter', code: 'SCT' },
  { type: 'missile', key: '3', label: 'Missile', code: 'MSL' },
];

export class CombatControlsUI {
  private readonly weaponButtons = new Map<WeaponType, HTMLButtonElement>();
  private colorButton: HTMLButtonElement | null = null;
  private voiceButton: HTMLButtonElement | null = null;

  constructor(layer: HTMLElement) {
    if (usesMobileLayout()) return;

    const dock = document.createElement('section');
    dock.className = 'combat-dock';
    dock.setAttribute('aria-label', 'Combat controls');

    const weaponRail = document.createElement('div');
    weaponRail.className = 'combat-dock__weapons';

    const weaponHeading = document.createElement('div');
    weaponHeading.className = 'combat-dock__heading';
    weaponHeading.innerHTML = '<span>WEAPON BUS</span><small>ARMED</small>';
    weaponRail.appendChild(weaponHeading);

    const weaponSlots = document.createElement('div');
    weaponSlots.className = 'combat-dock__weapon-slots';
    for (const weapon of WEAPONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `combat-dock__weapon combat-dock__weapon--${weapon.type}`;
      button.dataset.weapon = weapon.type;
      button.title = `${weapon.label.toUpperCase()} [${weapon.key}]`;
      button.innerHTML = `
        <span class="combat-dock__key">${weapon.key}</span>
        <span class="combat-dock__weapon-code">${weapon.code}</span>
        <span class="combat-dock__weapon-name">${weapon.label}</span>
      `;
      button.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent<WeaponType>('SelectWeaponType', { detail: weapon.type }));
      });
      this.weaponButtons.set(weapon.type, button);
      weaponSlots.appendChild(button);
    }
    weaponRail.appendChild(weaponSlots);

    const colorStrip = document.createElement('div');
    colorStrip.className = 'combat-dock__color-strip';
    const colorLabel = document.createElement('span');
    colorLabel.textContent = 'LASER TUNE';
    this.colorButton = document.createElement('button');
    this.colorButton.type = 'button';
    this.colorButton.className = 'combat-dock__color';
    this.colorButton.title = 'TOGGLE LASER COLOR [C]';
    this.colorButton.innerHTML = `
      <span class="combat-dock__swatch combat-dock__swatch--red"></span>
      <span class="combat-dock__color-value">RED</span>
      <kbd>C</kbd>
    `;
    this.colorButton.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ToggleLaserColor'));
    });
    colorStrip.append(colorLabel, this.colorButton);
    weaponRail.appendChild(colorStrip);

    const actionRail = document.createElement('div');
    actionRail.className = 'combat-dock__actions';
    actionRail.append(
      this.createAction('VIEW', 'V', 'camera', 'ToggleCameraView'),
      this.createAction('ROLL', 'A/D', 'roll', 'TouchStunt'),
      this.createBoostAction(),
      this.createAction('FIRE', 'L-CLK', 'fire', 'LeftClickShoot'),
    );

    this.voiceButton = this.createAction('COMMS', 'T', 'voice', 'ToggleVoiceMute');
    actionRail.appendChild(this.voiceButton);

    dock.append(weaponRail, actionRail);
    layer.appendChild(dock);

    window.addEventListener('WeaponChanged', (event) => {
      this.setWeapon((event as CustomEvent<WeaponType>).detail);
    });
    window.addEventListener('LaserColorChanged', (event) => {
      this.setLaserColor((event as CustomEvent<LaserColor>).detail);
    });
    window.addEventListener('VoiceMuteChanged', (event) => {
      this.setVoiceMuted((event as CustomEvent<boolean>).detail);
    });

    this.setWeapon('laser');
    this.setLaserColor('red');
    this.setVoiceMuted(true);
  }

  private createAction(
    label: string,
    key: string,
    tone: string,
    eventName: string | null,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `combat-dock__action combat-dock__action--${tone}`;
    button.title = `${label} [${key}]`;
    button.innerHTML = `
      <span class="combat-dock__action-icon" aria-hidden="true"></span>
      <span class="combat-dock__action-copy"><strong>${label}</strong><kbd>${key}</kbd></span>
    `;
    if (eventName) {
      button.addEventListener('click', () => window.dispatchEvent(new CustomEvent(eventName)));
    }
    return button;
  }

  private createBoostAction(): HTMLButtonElement {
    const button = this.createAction('BOOST', 'SHIFT', 'boost', null);
    let boosting = false;

    const start = (event: PointerEvent) => {
      event.preventDefault();
      if (boosting) return;
      boosting = true;
      button.classList.add('is-pressed');
      button.setPointerCapture?.(event.pointerId);
      window.dispatchEvent(new CustomEvent('TouchBoostOn'));
    };
    const stop = () => {
      if (!boosting) return;
      boosting = false;
      button.classList.remove('is-pressed');
      window.dispatchEvent(new CustomEvent('TouchBoostOff'));
    };

    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    return button;
  }

  private setWeapon(weapon: WeaponType): void {
    if (!this.weaponButtons.has(weapon)) return;
    for (const [type, button] of this.weaponButtons) {
      const selected = type === weapon;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', `${selected}`);
    }
  }

  private setLaserColor(color: LaserColor): void {
    if (!this.colorButton || (color !== 'red' && color !== 'blue')) return;
    this.colorButton.dataset.color = color;
    const value = this.colorButton.querySelector('.combat-dock__color-value');
    if (value) value.textContent = color.toUpperCase();
    const swatch = this.colorButton.querySelector('.combat-dock__swatch');
    if (swatch) swatch.className = `combat-dock__swatch combat-dock__swatch--${color}`;
  }

  private setVoiceMuted(isMuted: boolean): void {
    if (!this.voiceButton) return;
    (window as Window & { isVoiceMuted?: boolean }).isVoiceMuted = isMuted;
    this.voiceButton.classList.toggle('is-active', !isMuted);
    this.voiceButton.title = isMuted ? 'COMMS [T] — MUTED' : 'COMMS [T] — ACTIVE';
  }
}
