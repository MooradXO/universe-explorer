import { AuthManager } from '../auth/AuthManager';
import { isSupabaseConfigured } from '../lib/supabase';
import './styles/start-auth.css';

export class AuthUI {
  private container: HTMLDivElement | null = null;
  private auth: AuthManager;

  constructor(auth: AuthManager) {
    this.auth = auth;
    this.render();
  }

  render() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    if (this.auth.isLoggedIn && this.auth.profile) {
      const startScreen = document.getElementById('start-screen');
      if (startScreen) {
        startScreen.classList.add('fade-out');
        window.setTimeout(() => startScreen.remove(), 650);
      }
      return;
    }

    document.getElementById('start-screen')?.remove();

    this.container = document.createElement('div');
    this.container.id = 'start-screen';
    this.container.innerHTML = `
      <div class="start-ambient-grid" aria-hidden="true"></div>

      <header class="start-brand" aria-label="Universe Explorer">
        <span class="start-rivet start-rivet-left" aria-hidden="true"></span>
        <span class="start-rivet start-rivet-right" aria-hidden="true"></span>
        <div class="start-brand-kicker">DEEP RANGE FLIGHT PROGRAM</div>
        <h1 class="start-title"><span>UNIVERSE</span><span>EXPLORER</span></h1>
        <div class="start-brand-meta">
          <span>FRONTIER BUILD 01</span>
          <span class="start-brand-divider" aria-hidden="true"></span>
          <span>FREE FLIGHT</span>
        </div>
      </header>

      <main class="start-console" aria-label="Pilot access console">
        <div class="start-console-header">
          <span>PILOT ACCESS / BAY 07</span>
          <span class="start-console-state"><i aria-hidden="true"></i> STANDBY</span>
        </div>

        <section class="start-menu-window" id="menu-initial" aria-labelledby="launch-title">
          <div class="start-section-index">01 / LAUNCH</div>
          <h2 id="launch-title">LAUNCH CLEARANCE</h2>
          <p class="start-copy">Enter the flight network, choose a pilot identity and deploy your ship.</p>

          <button class="start-btn start-btn-primary" id="btn-start-game" type="button">
            <span class="start-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 19h14M8 16l4-12 4 12-4-2-4 2Z"></path><path d="M9 19v2M15 19v2"></path></svg>
            </span>
            <span class="start-btn-copy">
              <strong>ENGAGE</strong>
              <small>Open pilot access</small>
            </span>
            <span class="start-btn-arrow" aria-hidden="true">›</span>
          </button>
        </section>

        <section class="start-menu-window hidden" id="menu-connection" aria-labelledby="connection-title" aria-hidden="true">
          <div class="start-section-index">02 / IDENTITY</div>
          <h2 id="connection-title">SELECT PILOT PROFILE</h2>
          <p class="start-copy">Choose how this sortie will be registered.</p>

          <div class="start-buttons-container">
            <button class="start-btn start-btn-guest" id="btn-guest-login" type="button">
              <span class="start-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"></path></svg>
              </span>
              <span class="start-btn-copy">
                <strong>GUEST SORTIE</strong>
                <small>Instant entry · temporary pilot</small>
              </span>
              <span class="start-btn-arrow" aria-hidden="true">›</span>
            </button>

            <button class="start-btn start-btn-github" id="btn-github-login" type="button" ${isSupabaseConfigured ? '' : 'disabled'}>
              <span class="start-btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.36 6.84 9.72.5.1.68-.22.68-.49 0-.24-.01-1.04-.02-1.89-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .08 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.64-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.78c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"></path></svg>
              </span>
              <span class="start-btn-copy">
                <strong>GITHUB PILOT</strong>
                <small>${isSupabaseConfigured ? 'Persistent network profile' : 'Requires server link'}</small>
              </span>
              <span class="start-btn-arrow" aria-hidden="true">›</span>
            </button>
          </div>

          <button class="start-btn-back" id="btn-back-to-menu" type="button">
            <span aria-hidden="true">‹</span> BACK TO LAUNCH
          </button>
        </section>

        <div class="start-console-footer" aria-live="polite">
          <span id="start-console-message">AWAITING PILOT INPUT</span>
          <span>UE-FC-07</span>
        </div>
      </main>

      <footer class="start-status-rail" aria-label="Flight system status">
        <span><i aria-hidden="true"></i> FLIGHT CORE <b>READY</b></span>
        <span><i aria-hidden="true"></i> PILOT LINK <b>STANDBY</b></span>
        <span class="start-status-coordinate">SECTOR 07 / DEEP RANGE</span>
      </footer>
    `;

    document.body.appendChild(this.container);
    this.bindControls();
  }

  private bindControls() {
    if (!this.container) return;

    const menuInitial = this.container.querySelector<HTMLElement>('#menu-initial');
    const menuConnection = this.container.querySelector<HTMLElement>('#menu-connection');
    const btnStart = this.container.querySelector<HTMLButtonElement>('#btn-start-game');
    const btnBack = this.container.querySelector<HTMLButtonElement>('#btn-back-to-menu');
    const btnGuest = this.container.querySelector<HTMLButtonElement>('#btn-guest-login');
    const btnGitHub = this.container.querySelector<HTMLButtonElement>('#btn-github-login');
    const consoleMessage = this.container.querySelector<HTMLElement>('#start-console-message');
    const startScreen = this.container;
    let transitionTimer = 0;

    const setMessage = (message: string) => {
      if (consoleMessage) consoleMessage.textContent = message;
    };

    const setBusy = (button: HTMLButtonElement, message: string) => {
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      setMessage(message);
    };

    btnStart?.addEventListener('click', () => {
      if (!menuInitial || !menuConnection) return;

      window.clearTimeout(transitionTimer);
      window.dispatchEvent(new CustomEvent('StartScreenEngage'));
      startScreen.classList.add('is-engaging');
      menuInitial.classList.add('hidden');
      menuInitial.setAttribute('aria-hidden', 'true');
      setMessage('OPENING PILOT LINK');

      transitionTimer = window.setTimeout(() => {
        startScreen.classList.add('blurred');
        menuInitial.style.display = 'none';
        menuConnection.style.display = 'flex';
        menuConnection.getBoundingClientRect();
        menuConnection.classList.remove('hidden');
        menuConnection.setAttribute('aria-hidden', 'false');
        startScreen.classList.remove('is-engaging');
        setMessage('SELECT PILOT PROFILE');
        btnGuest?.focus({ preventScroll: true });
      }, 480);
    });

    btnBack?.addEventListener('click', () => {
      if (!menuInitial || !menuConnection) return;

      window.clearTimeout(transitionTimer);
      window.dispatchEvent(new CustomEvent('StartScreenReset'));
      startScreen.classList.remove('blurred', 'is-engaging');
      menuConnection.classList.add('hidden');
      menuConnection.setAttribute('aria-hidden', 'true');
      setMessage('RETURNING TO LAUNCH CONTROL');

      transitionTimer = window.setTimeout(() => {
        menuConnection.style.display = 'none';
        menuInitial.style.display = 'flex';
        menuInitial.getBoundingClientRect();
        menuInitial.classList.remove('hidden');
        menuInitial.setAttribute('aria-hidden', 'false');
        setMessage('AWAITING PILOT INPUT');
        btnStart?.focus({ preventScroll: true });
      }, 280);
    });

    btnGitHub?.addEventListener('click', () => {
      if (!isSupabaseConfigured) return;
      setBusy(btnGitHub, 'CONTACTING GITHUB PILOT LINK');
      void this.auth.signInWithGitHub().finally(() => {
        if (!btnGitHub.isConnected) return;
        btnGitHub.disabled = false;
        btnGitHub.classList.remove('is-loading');
        btnGitHub.removeAttribute('aria-busy');
        setMessage('PILOT LINK STANDBY');
      });
    });

    btnGuest?.addEventListener('click', () => {
      setBusy(btnGuest, 'PREPARING GUEST SORTIE');
      void this.auth.signInAsGuest();
    });

    window.requestAnimationFrame(() => btnStart?.focus({ preventScroll: true }));
  }
}
