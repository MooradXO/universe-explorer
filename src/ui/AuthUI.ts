import { AuthManager } from '../auth/AuthManager';
import { isGameMode, type GameMode } from '../network/shared/GameMode';
import { mountMusicControls } from './MusicControls';
import './styles/start-auth.css';

const orbitIcon = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="6"/><ellipse cx="20" cy="20" rx="19" ry="9" transform="rotate(-35 20 20)"/><circle cx="34" cy="11" r="2" class="icon-dot"/></svg>';
const combatIcon = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="13"/><path d="M20 1v11m0 16v11M1 20h11m16 0h11M15 20h10m-5-5v10"/></svg>';

export class AuthUI {
  private container: HTMLDivElement | null = null;
  private disposeMusic?: () => void;
  constructor(private auth: AuthManager, private launch: () => Promise<unknown> = async () => {}) { this.render(); }

  render() {
    this.disposeMusic?.(); this.disposeMusic = undefined;
    if (this.auth.isLoggedIn && this.auth.profile) {
      const screen = this.container; this.container = null;
      if (screen) { screen.classList.add('fade-out'); window.setTimeout(() => screen.remove(), 650); }
      return;
    }
    this.container?.remove(); document.getElementById('start-screen')?.remove();
    let selected: GameMode = 'exploration', savedName = '';
    try { const mode = localStorage.getItem('universe:last-mode'); if (isGameMode(mode)) selected = mode; savedName = localStorage.getItem('universe:pilot-name') ?? ''; } catch { /* optional preferences */ }
    const online = !!import.meta.env.VITE_MULTIPLAYER_URL?.trim();
    const screen = document.createElement('div'); screen.id = 'start-screen';
    screen.innerHTML = `
      <header class="launch-header"><a class="launch-brand" href="/" aria-label="Universe Explorer home"><img src="/universe-mark.svg" alt="" width="26" height="26"><span>UNIVERSE EXPLORER</span></a><span class="launch-edition">FLIGHT DECK <i>01</i></span></header>
      <main class="launch-main">
        <section class="launch-panel" aria-label="Choose your flight">
          <p class="launch-eyebrow"><span></span> THE NEXT HORIZON AWAITS</p>
          <h1 class="start-title">UNIVERSE<br><span>EXPLORER</span></h1>
          <p class="launch-intro">Distant worlds. Open space. Your course.<br>Choose how you want to fly.</p>
          <fieldset class="launch-modes"><legend>SELECT GAME MODE</legend>
            <label class="mode-card"><input type="radio" name="game-mode" value="exploration"><span class="mode-card-top">${orbitIcon}<span class="mode-check" aria-hidden="true"></span></span><strong>Exploration</strong><span class="mode-description">Discover worlds together.<br>No weapons. No combat.</span><span class="mode-foot">PEACEFUL FLIGHT</span></label>
            <label class="mode-card"><input type="radio" name="game-mode" value="pvp"><span class="mode-card-top">${combatIcon}<span class="mode-check" aria-hidden="true"></span></span><strong>PvP</strong><span class="mode-description">Share the sky. Take the fight.<br>Live weapons & ship combat.</span><span class="mode-foot">COMBAT FLIGHT</span></label>
          </fieldset>
          <label class="launch-pilot"><span>PILOT NAME</span><input id="launch-pilot-name" type="text" maxlength="32" placeholder="Guest Pilot" autocomplete="nickname" spellcheck="false"></label>
          <button class="start-btn" id="btn-start-game" type="button"><span class="start-btn-label">LAUNCH EXPLORATION</span><span aria-hidden="true">↗</span></button>
          <p class="launch-note">${online ? 'Separate sessions for each mode · Guest access' : 'Local solo flight · Select a mode to begin'}</p>
          <p class="start-error" role="alert" hidden></p>
        </section>
        <aside class="launch-scene-caption" aria-hidden="true"><span class="scene-caption-line"></span><span>EARTH ORBIT<small>Departure corridor / clear</small></span></aside>
      </main>
      <footer class="launch-footer"><span>LOOK BEYOND THE FAMILIAR</span><div class="launch-music"></div></footer>`;
    this.container = screen; document.body.appendChild(screen);
    this.disposeMusic = mountMusicControls(screen.querySelector('.launch-music')!, 'launch-music-volume');
    for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) screen.addEventListener(type, event => event.stopPropagation());
    screen.addEventListener('pointerdown', () => window.dispatchEvent(new Event('StartAmbient')));
    const button = screen.querySelector<HTMLButtonElement>('#btn-start-game')!, label = screen.querySelector('.start-btn-label')!;
    const errorMessage = screen.querySelector<HTMLElement>('.start-error')!, name = screen.querySelector<HTMLInputElement>('#launch-pilot-name')!;
    name.value = savedName;
    const radios = [...screen.querySelectorAll<HTMLInputElement>('input[name="game-mode"]')];
    const refresh = () => { for (const radio of radios) { radio.checked = radio.value === selected; radio.closest('label')!.classList.toggle('selected', radio.checked); } label.textContent = selected === 'exploration' ? 'LAUNCH EXPLORATION' : 'LAUNCH PvP'; };
    for (const radio of radios) radio.onchange = () => { if (isGameMode(radio.value)) selected = radio.value; refresh(); };
    refresh();
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true; name.disabled = true; radios.forEach(radio => { radio.disabled = true; });
      button.setAttribute('aria-busy', 'true'); label.textContent = 'DEPARTING'; errorMessage.hidden = true;
      try {
        try { localStorage.setItem('universe:last-mode', selected); localStorage.setItem('universe:pilot-name', name.value.trim()); } catch { /* optional */ }
        window.dispatchEvent(new Event('StartAmbient')); screen.classList.add('departing');
        await this.launch();
        await this.auth.signInAsGuest(selected, name.value);
      } catch {
        if (!button.isConnected) return;
        screen.classList.remove('departing'); window.dispatchEvent(new Event('StartScreenReset'));
        button.disabled = false; name.disabled = false; radios.forEach(radio => { radio.disabled = false; });
        button.removeAttribute('aria-busy'); refresh(); errorMessage.textContent = 'Unable to start. Please try again.'; errorMessage.hidden = false;
      }
    });
  }
}
