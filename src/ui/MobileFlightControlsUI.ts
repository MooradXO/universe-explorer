import { usesMobileLayout } from './uiPlatform';
import './styles/mobile-flight-controls.css';

type WeaponType = 'laser' | 'shotgun' | 'missile';
type LaserColor = 'red' | 'blue';

const MOBILE_WEAPONS: Array<{ type: WeaponType; label: string; key: string }> = [
  { type: 'laser', label: 'LASER', key: '1' },
  { type: 'shotgun', label: 'SHOTGUN', key: '2' },
  { type: 'missile', label: 'MISSILE', key: '3' },
];

const ACTION_ICONS = {
  camera: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle>',
  roll: '<path d="M20 12a8 8 0 1 1-8-8v4"></path><path d="m16 8-4-4 4-4"></path>',
  voice: '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M18 10v1a6 6 0 0 1-12 0v-1M12 17v4"></path>',
  fire: '<circle cx="12" cy="12" r="8"></circle><path d="M12 1v6M12 17v6M1 12h6M17 12h6"></path>',
  boost: '<path d="m12 3 7 8h-4v10H9V11H5Z"></path>',
};

export class MobileControlsUI {
  public portraitBlocker!: HTMLDivElement;
  private mobileLayer!: HTMLDivElement;
  private readonly weaponButtons = new Map<WeaponType, HTMLButtonElement>();
  private colorButton: HTMLButtonElement | null = null;
  private voiceButton: HTMLButtonElement | null = null;

  constructor() {
    if (!usesMobileLayout()) return;
    this.initPortraitBlocker();
    this.initMobileControls();
  }

  public setVisible(visible: boolean): void {
    if (this.mobileLayer) this.mobileLayer.style.display = visible ? 'block' : 'none';
  }

  private initPortraitBlocker(): void {
    this.portraitBlocker = document.createElement('div');
    this.portraitBlocker.className = 'mobile-portrait-blocker';
    this.portraitBlocker.innerHTML = `
      <div class="mobile-portrait-panel hud-metal-panel">
        <div class="mobile-portrait-panel__eyebrow">FLIGHT ORIENTATION</div>
        <svg class="mobile-portrait-panel__phone rotating-phone-svg" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2"></rect><circle cx="12" cy="18" r="1"></circle>
        </svg>
        <strong>ROTATE DEVICE</strong>
        <span>Landscape view is required for the flight controls.</span>
      </div>
    `;
    document.body.appendChild(this.portraitBlocker);

    const checkOrientation = () => {
      this.portraitBlocker.style.display = window.innerHeight > window.innerWidth ? 'flex' : 'none';
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
  }

  private initMobileControls(): void {
    this.mobileLayer = document.createElement('div');
    this.mobileLayer.className = 'mobile-flight-controls';
    this.mobileLayer.style.display = 'none';
    document.body.appendChild(this.mobileLayer);

    const leftZone = document.createElement('div');
    leftZone.className = 'mobile-joystick';
    leftZone.setAttribute('aria-label', 'Flight joystick');
    leftZone.innerHTML = '<span class="mobile-joystick__north">▲</span><span class="mobile-joystick__east">▶</span><span class="mobile-joystick__south">▼</span><span class="mobile-joystick__west">◀</span>';
    const leftKnob = document.createElement('div');
    leftKnob.className = 'mobile-joystick__knob';
    leftZone.appendChild(leftKnob);
    this.mobileLayer.appendChild(leftZone);
    this.bindJoystick(leftZone, leftKnob);

    const lookZone = document.createElement('div');
    lookZone.className = 'mobile-look-zone';
    this.mobileLayer.appendChild(lookZone);
    this.bindLookZone(lookZone);

    const weaponRail = document.createElement('section');
    weaponRail.className = 'mobile-weapon-rail hud-metal-panel';
    weaponRail.setAttribute('aria-label', 'Weapons');
    for (const weapon of MOBILE_WEAPONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mobile-weapon mobile-weapon--${weapon.type}`;
      button.innerHTML = `<kbd>${weapon.key}</kbd><span>${weapon.label}</span>`;
      this.bindTap(button, () => window.dispatchEvent(new CustomEvent<WeaponType>('SelectWeaponType', { detail: weapon.type })));
      this.weaponButtons.set(weapon.type, button);
      weaponRail.appendChild(button);
    }

    this.colorButton = document.createElement('button');
    this.colorButton.type = 'button';
    this.colorButton.className = 'mobile-color-button';
    this.colorButton.innerHTML = '<i></i><span>RED</span>';
    this.bindTap(this.colorButton, () => window.dispatchEvent(new CustomEvent('ToggleLaserColor')));
    weaponRail.appendChild(this.colorButton);
    this.mobileLayer.appendChild(weaponRail);

    const actions = document.createElement('section');
    actions.className = 'mobile-action-cluster';
    actions.setAttribute('aria-label', 'Flight actions');
    actions.append(
      this.createActionButton('CAM', 'camera', () => window.dispatchEvent(new CustomEvent('ToggleCameraView'))),
      this.createActionButton('ROLL', 'roll', () => window.dispatchEvent(new CustomEvent('TouchStunt'))),
    );
    this.voiceButton = this.createActionButton('VOICE', 'voice', () => window.dispatchEvent(new CustomEvent('ToggleVoiceMute')));
    actions.appendChild(this.voiceButton);
    actions.appendChild(this.createActionButton('FIRE', 'fire', () => window.dispatchEvent(new CustomEvent('LeftClickShoot')), true));

    const boost = this.createActionButton('BOOST', 'boost', null, true);
    boost.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      boost.setPointerCapture(event.pointerId);
      boost.classList.add('is-pressed');
      window.dispatchEvent(new CustomEvent('TouchBoostOn'));
    });
    const stopBoost = (event: PointerEvent) => {
      event.preventDefault();
      boost.classList.remove('is-pressed');
      window.dispatchEvent(new CustomEvent('TouchBoostOff'));
    };
    boost.addEventListener('pointerup', stopBoost);
    boost.addEventListener('pointercancel', stopBoost);
    actions.appendChild(boost);
    this.mobileLayer.appendChild(actions);

    window.addEventListener('WeaponChanged', (event) => this.setWeapon((event as CustomEvent<WeaponType>).detail));
    window.addEventListener('LaserColorChanged', (event) => this.setLaserColor((event as CustomEvent<LaserColor>).detail));
    window.addEventListener('VoiceMuteChanged', (event) => this.setVoiceMuted((event as CustomEvent<boolean>).detail));
    this.setWeapon('laser');
    this.setLaserColor('red');
    this.setVoiceMuted(true);
  }

  private bindJoystick(zone: HTMLDivElement, knob: HTMLDivElement): void {
    let touchId: number | null = null;
    const radius = 48;
    const update = (touch: Touch) => {
      const rect = zone.getBoundingClientRect();
      let x = touch.clientX - rect.left - rect.width / 2;
      let y = touch.clientY - rect.top - rect.height / 2;
      const distance = Math.hypot(x, y);
      if (distance > radius) {
        x = (x / distance) * radius;
        y = (y / distance) * radius;
      }
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      window.dispatchEvent(new CustomEvent('DualJoystickMove', { detail: { x: x / radius, y: -y / radius } }));
    };

    zone.addEventListener('touchstart', (event) => {
      event.preventDefault();
      touchId = event.changedTouches[0].identifier;
      update(event.changedTouches[0]);
    }, { passive: false });
    zone.addEventListener('touchmove', (event) => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) if (touch.identifier === touchId) update(touch);
    }, { passive: false });
    const release = (event: TouchEvent) => {
      event.preventDefault();
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier !== touchId) continue;
        touchId = null;
        knob.style.transform = 'translate(-50%, -50%)';
        window.dispatchEvent(new CustomEvent('DualJoystickMove', { detail: { x: 0, y: 0 } }));
      }
    };
    zone.addEventListener('touchend', release, { passive: false });
    zone.addEventListener('touchcancel', release, { passive: false });
  }

  private bindLookZone(zone: HTMLDivElement): void {
    let touchId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    zone.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      touchId = touch.identifier;
      lastX = touch.clientX;
      lastY = touch.clientY;
    });
    zone.addEventListener('touchmove', (event) => {
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier !== touchId) continue;
        window.dispatchEvent(new CustomEvent('DualJoystickLook', { detail: { dx: (touch.clientX - lastX) * 2.5, dy: (touch.clientY - lastY) * 2.5 } }));
        lastX = touch.clientX;
        lastY = touch.clientY;
      }
    });
    const release = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) if (touch.identifier === touchId) touchId = null;
    };
    zone.addEventListener('touchend', release);
    zone.addEventListener('touchcancel', release);
  }

  private createActionButton(label: string, tone: string, action: (() => void) | null, large = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mobile-action mobile-action--${tone}${large ? ' mobile-action--large' : ''}`;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ACTION_ICONS[tone as keyof typeof ACTION_ICONS]}</svg><span>${label}</span>`;
    if (action) this.bindTap(button, action);
    return button;
  }

  private bindTap(button: HTMLButtonElement, action: () => void): void {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      action();
    });
  }

  private setWeapon(weapon: WeaponType): void {
    for (const [type, button] of this.weaponButtons) {
      const isSelected = type === weapon;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
  }

  private setLaserColor(color: LaserColor): void {
    if (!this.colorButton) return;
    this.colorButton.dataset.color = color;
    this.colorButton.setAttribute('aria-label', `Laser color: ${color}`);
    const label = this.colorButton.querySelector('span');
    if (label) label.textContent = color.toUpperCase();
  }

  private setVoiceMuted(isMuted: boolean): void {
    this.voiceButton?.classList.toggle('is-active', !isMuted);
    this.voiceButton?.setAttribute('aria-pressed', String(!isMuted));
  }
}
