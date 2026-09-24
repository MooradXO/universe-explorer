import { explorationSites } from '../world/generation/ExplorationSites';
import type { SystemDescriptor } from '../world/systems/SystemDescriptor';
import { SYSTEM_CONFIG } from '../world/systems/SystemConfig';
import { SystemObjectPicker } from './SystemObjectPicker';
import { hudPanels } from './HudPanels';
import { hudIcon, windowHeader } from './HudArt';
import './system-navigation.css';

export class SystemNavigationUI {
  readonly element = document.createElement('section');
  private title = document.createElement('strong');
  private picker: SystemObjectPicker;
  private details = document.createElement('section');
  private detail = document.createElement('p');
  private distance = document.createElement('output');
  private progress = document.createElement('output');
  private status = document.createElement('p');
  private cruise = document.createElement('button');
  private survey = document.createElement('button');
  private warp = document.createElement('div');
  constructor(onSelect: (id: string) => void, onCruise: () => void, onSurvey: () => void) {
    this.element.className = 'system-navigation';
    this.element.setAttribute('aria-label', 'System navigation');
    this.picker = new SystemObjectPicker(id => { this.setDestinationIcon(id); onSelect(id); });
    const heading = document.createElement('div'); heading.className = 'system-navigation__heading';
    const info = document.createElement('button'); info.type = 'button'; info.className = 'navigation-info';
    info.textContent = '···'; info.setAttribute('aria-label', 'Flight details'); info.dataset.hudCommand = 'navigation';
    heading.append(this.title, info);
    const symbol = document.createElement('span'); symbol.className = 'navigation-symbol'; symbol.innerHTML = hudIcon('system');
    const content = document.createElement('div'); content.className = 'navigation-destination'; content.append(heading, this.picker.element);
    this.progress.className = 'navigation-progress'; this.progress.setAttribute('aria-label', 'Flight progress'); content.append(this.progress);
    this.cruise.type = this.survey.type = 'button';
    this.cruise.className = 'navigation-cruise'; this.cruise.onclick = onCruise; this.survey.onclick = onSurvey;
    this.cruise.textContent = 'CRUISE'; this.survey.textContent = 'ORBITAL SURVEY';
    this.element.append(symbol, content, this.cruise);
    this.details.className = 'hud-window hud-window--right navigation-details'; this.details.setAttribute('aria-label', 'Flight details');
    this.details.innerHTML = windowHeader('FLIGHT DETAILS', 'map');
    this.detail.className = 'system-navigation__note'; this.status.setAttribute('role', 'status');
    const body = document.createElement('div'); body.className = 'navigation-details__body';
    body.append(this.distance, this.survey, this.status, this.detail);
    const credits = document.createElement('a'); credits.href = '/THIRD_PARTY_NOTICES.md'; credits.target = '_blank'; credits.rel = 'noopener noreferrer';
    credits.textContent = 'Sources: AT-HYG · JPL · IAU · Solar System Scope'; credits.className = 'system-navigation__credits'; body.append(credits);
    this.details.append(body);
    hudPanels.register('navigation', { element: this.details, trigger: info });
    info.onclick = () => hudPanels.toggle('navigation', info);
    this.details.querySelector('.hud-close')!.addEventListener('click', () => hudPanels.close('navigation'));
    const layer = document.getElementById('ui-layer')!; layer.append(this.element, this.details);
    this.warp.className = 'stellar-warp'; this.warp.hidden = true; this.warp.setAttribute('aria-live', 'polite'); layer.append(this.warp);
    for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'touchstart', 'touchmove', 'touchend', 'wheel']) this.element.addEventListener(event, e => e.stopPropagation());
  }
  setSystem(system: SystemDescriptor, selected: string) {
    const home = system.anchor.catalogId === SYSTEM_CONFIG.homeSystemId;
    this.title.textContent = home ? 'SOLAR SYSTEM' : `${system.anchor.title.toUpperCase()} SYSTEM`;
    this.setDestinationIcon(selected);
    const options = [...system.bodies.map(body => [body.id, body.name]), ['star', `${system.anchor.title} · STAR`]];
    const site=explorationSites(system).find(s=>s.id===selected);if(site)options.push([site.id,site.name]);
    if (home) options.unshift(['base', 'EARTH BASE']);
    this.picker.setOptions(options, selected);
  }
  private setDestinationIcon(selected: string) {
    const planet = selected === 'base' ? 'earth' : selected.startsWith('sol/') ? selected.slice(4) : null;
    const symbol = this.element.querySelector<HTMLElement>('.navigation-symbol')!;
    this.element.classList.toggle('is-home-system', !!planet);
    symbol.style.backgroundImage = planet ? `radial-gradient(circle at 30% 30%,transparent 25%,#02070bc9 76%),url('/assets/environments/low/${planet}.webp')` : '';
  }
  update(data: { distance: number; cruising: boolean; stopping?: boolean; warping: string | null; status: string; note: string; survey: boolean; siteSurvey?:boolean; visited: boolean; speed: number; dead: boolean }) {
    this.distance.textContent = data.distance > SYSTEM_CONFIG.unitsPerAu * 0.01
      ? `${(data.distance / SYSTEM_CONFIG.unitsPerAu).toLocaleString('en-US', { maximumFractionDigits: 3 })} AU to arrival`
      : `${Math.round(data.distance * SYSTEM_CONFIG.kilometersPerUnit).toLocaleString('en-US')} km to arrival`;
    const phase = data.warping ? 'WARP' : data.stopping ? 'STOPPING' : data.cruising ? (data.status.startsWith('Aligning') ? 'ALIGNING' : data.status.includes('around an obstacle') ? 'DETOUR' : 'CRUISE')
      : data.status.startsWith('Obstacle') ? 'BLOCKED — move clear' : data.status.startsWith('Combat') ? 'COMBAT — manual flight'
      : data.status.startsWith('Under fire') ? 'UNDER FIRE — manual flight' : data.status.startsWith('Destination reached') && data.distance < 100 ? 'ARRIVED'
      : 'READY';
    this.progress.textContent = `${phase} · ${this.distance.textContent!.replace(' to arrival', '')}`;
    this.progress.title = data.status;
    this.progress.dataset.state = phase.startsWith('BLOCKED') ? 'blocked' : data.cruising ? 'cruising' : 'idle';
    this.cruise.textContent = data.stopping ? 'STOPPING' : data.cruising ? 'STOP' : 'CRUISE';
    this.cruise.title = data.cruising ? `Cruising at ${(data.speed / SYSTEM_CONFIG.unitsPerAu).toFixed(3)} AU/s` : 'Cruise to selected destination';
    this.cruise.disabled = !!data.warping || !!data.stopping || data.dead; this.picker.setDisabled(!!data.warping || data.dead);
    this.survey.disabled = !data.survey || !!data.warping || data.cruising || data.dead;
    this.survey.textContent = data.siteSurvey ? data.visited?'SITE RECORDED':'SURVEY SITE' : data.visited ? 'ORBIT SURVEYED' : 'ORBITAL SURVEY';
    this.detail.textContent = data.note; this.status.textContent = data.status;
    this.warp.hidden = !data.warping; this.warp.textContent = data.warping ? `WARP → ${data.warping}` : '';
  }
  dispose() { hudPanels.unregister('navigation'); this.picker.dispose(); this.element.remove(); this.details.remove(); this.warp.remove(); }
}
