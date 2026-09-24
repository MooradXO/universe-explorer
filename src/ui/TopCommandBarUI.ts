import { Settings } from '../core/Settings';
import { hudPanels, isTextEntry } from './HudPanels';
import { hudIcon, windowHeader, type HudIcon } from './HudArt';

interface CommandBarActions { onWarpToBase: () => void; onToggleHangar: () => void; onToggleComms: () => void; }
interface LeaderboardEntry { username?: string; bounty?: number; }

export class TopCommandBarUI {
  public readonly hangarButton: HTMLButtonElement;
  private lastPlayers = new Map<string, LeaderboardEntry>();
  private readonly leaderboardList: HTMLDivElement;

  constructor(layer: HTMLElement, actions: CommandBarActions) {
    const bar = document.createElement('nav');
    bar.className = 'top-command-bar'; bar.setAttribute('aria-label', 'Flight commands');
    const system = this.button('SYSTEM', 'system');
    const bounties = this.button('BOUNTIES', 'bounties');
    const warp = this.button('WARP', 'warp');
    this.hangarButton = this.button('HANGAR', 'hangar');
    this.hangarButton.id = 'btn-hangar'; this.hangarButton.disabled = true;
    this.hangarButton.title = 'Available near Earth Base';
    const comms = this.button('COMMS', 'comms');
    const map = this.button('MAP', 'map', 'star-map'); map.id = 'btn-star-map'; map.setAttribute('aria-label', 'Star map');
    bar.append(system, bounties, warp, this.hangarButton, comms, map); layer.append(bar);
    for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) bar.addEventListener(event, e => e.stopPropagation());

    for (const type of ['keydown', 'keyup']) bar.addEventListener(type, e => {
      if (hudPanels.active || ['Enter', ' ', 'Tab', 'ArrowLeft', 'ArrowRight'].includes((e as KeyboardEvent).key)) e.stopPropagation();
    });
    const systemPanel = document.createElement('section');
    systemPanel.id = 'actions-panel'; systemPanel.className = 'hud-window hud-window--system';
    systemPanel.setAttribute('aria-label', 'Flight system');
    systemPanel.innerHTML = windowHeader('FLIGHT SYSTEM', 'system') + `
      <div class="system-actions">
        <button type="button" data-action="manual"><strong>FLIGHT MANUAL</strong><small>Flight, weapons and navigation controls</small></button>
        <button type="button" data-action="graphics"><strong>GRAPHICS · ${Settings.graphicsMode}</strong><small>Change profile and restart</small></button>
      </div>`;
    layer.append(systemPanel); hudPanels.register('system', { element: systemPanel, trigger: system });
    systemPanel.querySelector('.hud-close')!.addEventListener('click', () => hudPanels.close('system'));

    const manual = document.createElement('section');
    manual.id = 'flight-manual'; manual.className = 'hud-window hud-window--center flight-manual';
    manual.setAttribute('aria-label', 'Flight manual');
    manual.innerHTML = windowHeader('FLIGHT MANUAL', 'system') + `<div class="manual-grid">
      <section><h3>FLIGHT</h3><dl>
        <dt>Mouse / touch</dt><dd>Steer</dd><dt>W / S</dt><dd>Forward / reverse</dd>
        <dt>A / D</dt><dd>Strafe left / right</dd><dt>Space / Ctrl, X</dt><dd>Rise / descend</dd>
        <dt>Q / E</dt><dd>Roll left / right</dd><dt>Shift</dt><dd>Boost</dd>
        <dt>Double A / D</dt><dd>Barrel roll</dd><dt>Double S</dt><dd>U-turn</dd>
      </dl></section>
      <section><h3>WEAPONS & CAMERA</h3><dl>
        <dt>Left mouse</dt><dd>Fire</dd><dt>1 / 2 / 3</dt><dd>Laser / shotgun / missiles</dd>
        <dt>C</dt><dd>Change laser colour</dd><dt>V</dt><dd>Change camera</dd><dt>Hold right mouse</dt><dd>Free look during flight</dd>
      </dl><h3>COMMS & WINDOWS</h3><dl>
        <dt>Enter</dt><dd>Open chat / send message</dd><dt>T</dt><dd>Toggle microphone</dd>
        <dt>Tab in flight</dt><dd>Wanted Board</dd><dt>Escape</dt><dd>Close current window</dd>
      </dl></section>
      <section class="manual-navigation"><h3>NAVIGATION</h3><p>Choose a destination at the upper right, then select CRUISE. MAP opens the star catalogue. WARP returns to Earth Base. HANGAR is available near the base.</p><p>Touch: hold the left stick to fly forward. Move it left/right or up/down to steer while holding FIRE with your other thumb. Centre the stick to fly straight; release it to slow down. Drag empty space to look without thrust. BOOST, camera and manoeuvre buttons sit beside FIRE. Only one menu opens at a time.</p></section>
    </div>`;
    layer.append(manual); hudPanels.register('manual', { element: manual, trigger: system });
    manual.querySelector('.hud-close')!.addEventListener('click', () => hudPanels.close('manual'));
    systemPanel.querySelector('[data-action="manual"]')!.addEventListener('click', () => hudPanels.open('manual', system));
    systemPanel.querySelector('[data-action="graphics"]')!.addEventListener('click', () => {
      Settings.graphicsMode = Settings.graphicsMode === 'HIGH' ? 'LOW' : 'HIGH'; window.location.reload();
    });

    const wanted = document.createElement('section');
    wanted.id = 'leaderboard-container'; wanted.className = 'hud-window hud-window--right wanted-board';
    wanted.setAttribute('aria-label', 'Wanted Board');
    wanted.innerHTML = windowHeader('WANTED BOARD', 'bounties') + '<div class="wanted-columns"><span>RANK / PILOT</span><span>BOUNTY</span></div>';
    this.leaderboardList = document.createElement('div'); this.leaderboardList.className = 'command-leaderboard';
    wanted.append(this.leaderboardList); layer.append(wanted);
    hudPanels.register('bounties', { element: wanted, trigger: bounties, onOpen: () => this.updateLeaderboard(this.lastPlayers) });
    wanted.querySelector('.hud-close')!.addEventListener('click', () => hudPanels.close('bounties'));
    system.onclick = () => hudPanels.toggle('system', system);
    bounties.onclick = () => hudPanels.toggle('bounties', bounties);
    warp.onclick = () => { hudPanels.closeAll(); actions.onWarpToBase(); };
    this.hangarButton.onclick = actions.onToggleHangar;
    comms.onclick = actions.onToggleComms;
    map.onclick = () => window.dispatchEvent(new CustomEvent('OpenStarMap'));
    window.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || hudPanels.active || isTextEntry(event.target) || (event.target instanceof HTMLElement && event.target.closest('button,[role="combobox"]')) || layer.style.display === 'none') return;
      event.preventDefault(); hudPanels.open('bounties', bounties);
    });
  }

  updateLeaderboard(players: Map<string, LeaderboardEntry>) {
    this.lastPlayers = players;
    if (!hudPanels.isOpen('bounties')) return;
    const entries = Array.from(players.values()).map(p => ({ name: p.username || 'Unknown pilot', bounty: p.bounty || 100 }));
    entries.push({ name: 'You', bounty: (window as Window & { localPlayerBounty?: number }).localPlayerBounty || 100 });
    entries.sort((a, b) => b.bounty - a.bounty);
    this.leaderboardList.replaceChildren();
    entries.slice(0, 5).forEach((entry, index) => {
      const row = document.createElement('div'); row.className = 'command-leaderboard__row';
      row.innerHTML = `<span class="wanted-rank">${String(index + 1).padStart(2, '0')}</span>${hudIcon('skull')}`;
      const name = document.createElement('span'); name.className = 'wanted-pilot'; name.textContent = entry.name;
      const bounty = document.createElement('strong'); bounty.textContent = `${entry.bounty.toLocaleString('en-US')} BNTY`;
      row.append(name, bounty); this.leaderboardList.append(row);
    });
  }
  private button(label: string, icon: HudIcon, panel: string = icon) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'command-button'; button.dataset.hudCommand = panel;
    button.setAttribute('aria-label', label); button.setAttribute('aria-expanded', 'false');
    button.innerHTML = hudIcon(icon) + `<span>${label}</span>`; return button;
  }
}
