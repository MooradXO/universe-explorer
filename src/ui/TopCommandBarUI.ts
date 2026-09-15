import { Settings } from '../core/Settings';
import './styles/top-command-bar.css';

interface CommandBarActions {
  onWarpToBase: () => void;
  onToggleHangar: () => void;
  onToggleComms: () => void;
}

interface LeaderboardEntry {
  username?: string;
  bounty?: number;
}

const ICONS = {
  system: '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"></path>',
  bounties: '<circle cx="12" cy="12" r="9"></circle><path d="M12 5v14M5 12h14"></path><circle cx="12" cy="12" r="2.5"></circle>',
  warp: '<path d="M12 2 3 7v10l9 5 9-5V7Z"></path><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v6M12 16v6M2 12h6M16 12h6"></path>',
  hangar: '<path d="M4 10V4h16v6M4 14v6h16v-6"></path><path d="m12 8-4 6h8Z"></path>',
  comms: '<path d="M12 3a9 9 0 0 1 9 9M12 7a5 5 0 0 1 5 5"></path><circle cx="12" cy="17" r="2"></circle><path d="M12 12v3"></path>',
};

export class TopCommandBarUI {
  public readonly hangarButton: HTMLButtonElement;
  private readonly leaderboardPanel: HTMLElement;
  private readonly leaderboardList: HTMLDivElement;
  private readonly systemPanel: HTMLElement;

  constructor(layer: HTMLElement, actions: CommandBarActions) {
    const bar = document.createElement('nav');
    bar.className = 'top-command-bar hud-metal-panel';
    bar.setAttribute('aria-label', 'Flight commands');

    const systemButton = this.createButton('SYSTEM', 'SYS 01', ICONS.system);
    const bountyButton = this.createButton('BOUNTIES', 'WNT 02', ICONS.bounties);
    const warpButton = this.createButton('WARP', 'RTB 03', ICONS.warp);
    this.hangarButton = this.createButton('HANGAR', 'BAY 04', ICONS.hangar);
    const commsButton = this.createButton('COMMS', 'COM 05', ICONS.comms);

    this.hangarButton.id = 'btn-hangar';
    this.hangarButton.style.display = 'none';
    warpButton.addEventListener('click', actions.onWarpToBase);
    this.hangarButton.addEventListener('click', actions.onToggleHangar);
    commsButton.addEventListener('click', actions.onToggleComms);

    bar.append(systemButton, bountyButton, warpButton, this.hangarButton, commsButton);
    layer.appendChild(bar);

    this.systemPanel = this.createSystemPanel();
    layer.appendChild(this.systemPanel);

    this.leaderboardPanel = document.createElement('section');
    this.leaderboardPanel.id = 'leaderboard-container';
    this.leaderboardPanel.className = 'command-drawer command-drawer--bounties hud-metal-panel';
    this.leaderboardPanel.style.display = 'none';
    this.leaderboardPanel.innerHTML = `
      <header class="command-drawer__header">
        <span>WANTED BOARD</span><small>TOP CONTRACTS</small>
      </header>
    `;
    this.leaderboardList = document.createElement('div');
    this.leaderboardList.className = 'command-leaderboard';
    this.leaderboardPanel.appendChild(this.leaderboardList);
    layer.appendChild(this.leaderboardPanel);

    systemButton.addEventListener('click', () => this.togglePanel(this.systemPanel, 'actions-panel'));
    bountyButton.addEventListener('click', () => this.togglePanel(this.leaderboardPanel, 'leaderboard-container'));

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      this.togglePanel(this.leaderboardPanel, 'leaderboard-container');
    });
  }

  public updateLeaderboard(players: Map<string, LeaderboardEntry>): void {
    if (this.leaderboardPanel.style.display === 'none') return;

    const entries = Array.from(players.values()).map((player) => ({
      name: player.username || 'Unknown pilot',
      bounty: player.bounty || 100,
    }));
    entries.push({ name: 'You', bounty: (window as Window & { localPlayerBounty?: number }).localPlayerBounty || 100 });
    entries.sort((a, b) => b.bounty - a.bounty);

    this.leaderboardList.replaceChildren();
    entries.slice(0, 5).forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = `command-leaderboard__row command-leaderboard__row--rank-${index + 1}`;

      const name = document.createElement('span');
      name.textContent = `${String(index + 1).padStart(2, '0')}  ${entry.name}`;
      const bounty = document.createElement('strong');
      bounty.textContent = `${entry.bounty} BNTY`;
      row.append(name, bounty);
      this.leaderboardList.appendChild(row);
    });
  }

  private createButton(label: string, code: string, path: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${path}</svg>
      <span class="command-button__copy"><small>${code}</small><b>${label}</b></span>
      <i aria-hidden="true"></i>
    `;
    return button;
  }

  private createSystemPanel(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'actions-panel command-drawer command-drawer--system hud-metal-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <header class="command-drawer__header">
        <span>FLIGHT SYSTEM</span><small>CONTROL BUS</small>
      </header>
      <div class="command-system-actions">
        <button type="button" class="command-system-action" data-action="manual">
          <strong>FLIGHT MANUAL</strong><small>Input map / keyboard + pointer</small>
        </button>
        <button type="button" class="command-system-action" data-action="graphics">
          <strong>GRAPHICS / ${Settings.graphicsMode}</strong><small>Render profile / restart required</small>
        </button>
      </div>
      <div class="controls-hint command-manual">
        <div><b>FLIGHT</b><span>Mouse · W/S · A/D · Space/Ctrl · Q/E</span></div>
        <div><b>TACTICAL</b><span>Double A/D · Double S · Shift</span></div>
        <div><b>WEAPONS</b><span>LMB · 1/2/3 · C · V</span></div>
        <div><b>COMMS</b><span>Enter · Tab · T</span></div>
      </div>
    `;

    const manual = panel.querySelector<HTMLElement>('.command-manual');
    panel.querySelector<HTMLButtonElement>('[data-action="manual"]')?.addEventListener('click', () => {
      if (manual) manual.style.display = manual.style.display === 'grid' ? 'none' : 'grid';
    });
    panel.querySelector<HTMLButtonElement>('[data-action="graphics"]')?.addEventListener('click', () => {
      Settings.graphicsMode = Settings.graphicsMode === 'HIGH' ? 'LOW' : 'HIGH';
      window.location.reload();
    });
    return panel;
  }

  private togglePanel(panel: HTMLElement, panelId: string): void {
    const opening = panel.style.display !== 'flex';
    if (opening) {
      (window as Window & { closeAllPanelsExcept?: (exceptId: string) => void }).closeAllPanelsExcept?.(panelId);
      panel.style.display = 'flex';
    } else {
      panel.style.display = 'none';
    }
  }
}
