import { hudIcon } from './HudArt';
import './styles/flight-status.css';

type StatusTone = 'hull' | 'shield' | 'boost';
type SubsystemTone = 'engine' | 'weapon' | 'generator';

interface StatusBarElements {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  value: HTMLSpanElement;
}

interface SubsystemElements {
  fill: HTMLDivElement;
  value: HTMLSpanElement;
}

export class FlightStatusUI {
  private readonly bars: Record<StatusTone, StatusBarElements>;
  private readonly subsystems: Record<SubsystemTone, SubsystemElements>;
  private readonly killFeed: HTMLUListElement;
  private readonly fpsValue: HTMLSpanElement;

  constructor(layer: HTMLElement) {
    const root = document.createElement('section');
    root.id = 'hud-stats-container';
    root.className = 'flight-status';
    root.setAttribute('aria-label', 'Ship status');

    const primary = document.createElement('div');
    primary.className = 'flight-status__primary';

    const hull = this.createStatusBar('HULL', 'hull', true);
    const shield = this.createStatusBar('SHIELD', 'shield', true);
    const boost = this.createStatusBar('BOOST', 'boost', false);
    primary.append(hull.root, shield.root, boost.root);

    const systemsPanel = document.createElement('div');
    systemsPanel.className = 'flight-status__systems';
    systemsPanel.innerHTML = `
      <div class="flight-status__systems-heading">
        <span class="flight-status__systems-mark" aria-hidden="true"></span>
        SUBSYSTEMS
      </div>
    `;

    const engine = this.createSubsystem('ENG', 'engine');
    const weapon = this.createSubsystem('WPN', 'weapon');
    const generator = this.createSubsystem('GEN', 'generator');
    systemsPanel.append(engine.row, weapon.row, generator.row);

    root.append(primary, systemsPanel);
    layer.appendChild(root);

    this.bars = { hull, shield, boost };
    this.subsystems = {
      engine: engine.elements,
      weapon: weapon.elements,
      generator: generator.elements,
    };

    this.killFeed = document.createElement('ul');
    this.killFeed.className = 'flight-kill-feed';
    this.killFeed.setAttribute('aria-live', 'polite');
    layer.appendChild(this.killFeed);

    const fpsCounter = document.createElement('div');
    fpsCounter.id = 'hud-fps-counter';
    fpsCounter.className = 'flight-fps';
    fpsCounter.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 20v-6M6 20V10M18 20V4"></path>
      </svg>
    `;
    this.fpsValue = document.createElement('span');
    this.fpsValue.textContent = '60';
    fpsCounter.appendChild(this.fpsValue);
    layer.appendChild(fpsCounter);
  }

  public updateHP(current: number, max: number): void {
    this.updateStatusBar(this.bars.hull, current, max, 30);
  }

  public updateShield(current: number, max: number): void {
    this.updateStatusBar(this.bars.shield, current, max, 30);
  }

  public updateBoost(current: number, max: number): void {
    this.updateStatusBar(this.bars.boost, current, max, 20);
  }

  public updateSubsystems(engines: number, weapons: number, shieldGenerator: number): void {
    this.subsystems.engine.value.closest('.flight-status__systems')?.classList.toggle('has-damage', Math.min(engines, weapons, shieldGenerator) < 100);
    this.updateSubsystem(this.subsystems.engine, engines);
    this.updateSubsystem(this.subsystems.weapon, weapons);
    this.updateSubsystem(this.subsystems.generator, shieldGenerator);
  }

  public addKillFeed(killer: string, killed: string): void {
    const item = document.createElement('li');
    item.className = 'flight-kill-feed__item';

    const killerName = document.createElement('span');
    killerName.className = 'flight-kill-feed__killer';
    killerName.textContent = killer;

    const divider = document.createElement('span');
    divider.className = 'flight-kill-feed__divider';
    divider.textContent = '›';

    const killedName = document.createElement('span');
    killedName.className = 'flight-kill-feed__killed';
    killedName.textContent = killed;

    item.append(killerName, divider, killedName);
    this.killFeed.appendChild(item);

    window.setTimeout(() => {
      item.classList.add('flight-kill-feed__item--leaving');
      window.setTimeout(() => item.remove(), 300);
    }, 4000);
  }

  public updateFPS(fps: number): void {
    this.fpsValue.textContent = `${Math.max(0, Math.round(fps))}`;
  }

  private createStatusBar(label: string, tone: StatusTone, showValue: boolean): StatusBarElements {
    const root = document.createElement('div');
    root.className = `flight-status__bar flight-status__bar--${tone}`;

    const header = document.createElement('div');
    header.className = 'flight-status__bar-header';

    const title = document.createElement('span');
    title.textContent = label;

    const value = document.createElement('span');
    value.className = 'flight-status__bar-value';
    value.textContent = showValue ? '100' : 'READY';
    value.dataset.mobileValue = '100%';
    header.append(title, value);

    const track = document.createElement('div');
    track.className = 'flight-status__bar-track';
    const fill = document.createElement('div');
    fill.className = 'flight-status__bar-fill';
    track.appendChild(fill);

    root.insertAdjacentHTML('afterbegin', hudIcon(tone));
    root.setAttribute('role', 'meter'); root.setAttribute('aria-label', label);
    root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
    root.append(header, track);
    return { root, fill, value };
  }

  private createSubsystem(label: string, tone: SubsystemTone): {
    row: HTMLDivElement;
    elements: SubsystemElements;
  } {
    const row = document.createElement('div');
    row.className = `flight-status__system flight-status__system--${tone}`;

    const title = document.createElement('span');
    title.className = 'flight-status__system-label';
    title.textContent = label;

    const track = document.createElement('div');
    track.className = 'flight-status__system-track';
    const fill = document.createElement('div');
    fill.className = 'flight-status__system-fill';
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'flight-status__system-value';
    value.textContent = '100%';
    row.append(title, track, value);

    return { row, elements: { fill, value } };
  }

  private updateStatusBar(
    bar: StatusBarElements,
    current: number,
    max: number,
    criticalThreshold: number,
  ): void {
    const percent = this.clampPercent(max > 0 ? (current / max) * 100 : 0);
    bar.root.setAttribute('aria-valuenow', String(Math.round(percent)));
    bar.fill.style.width = `${percent}%`;
    bar.value.textContent = bar.root.classList.contains('flight-status__bar--boost')
      ? (percent < criticalThreshold ? 'LOW' : 'READY')
      : `${Math.max(0, Math.ceil(current))}`;
    bar.value.dataset.mobileValue = `${Math.round(percent)}%`;
    bar.root.classList.toggle('is-critical', percent < criticalThreshold);
  }

  private updateSubsystem(subsystem: SubsystemElements, amount: number): void {
    const percent = this.clampPercent(amount);
    subsystem.fill.style.width = `${percent}%`;
    subsystem.value.textContent = `${Math.round(percent)}%`;
    subsystem.value.closest('.flight-status__system')?.classList.toggle('is-critical', percent < 30);
  }

  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }
}
