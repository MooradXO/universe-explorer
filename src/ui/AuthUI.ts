import { AuthManager } from '../auth/AuthManager';
import './styles/start-auth.css';

export class AuthUI {
  private container: HTMLDivElement | null = null;

  constructor(private auth: AuthManager) {
    this.render();
  }

  render() {
    if (this.auth.isLoggedIn && this.auth.profile) {
      const screen = this.container;
      this.container = null;
      if (screen) {
        screen.classList.add('fade-out');
        window.setTimeout(() => screen.remove(), 650);
      }
      return;
    }

    this.container?.remove();
    document.getElementById('start-screen')?.remove();
    const screen = document.createElement('div');
    screen.id = 'start-screen';
    screen.innerHTML = `
      <header class="start-brand">
        <h1 class="start-title">
          <img src="/assets/ui/start-menu/universe-explorer-title-v1.png" alt="Universe Explorer" width="1942" height="809" fetchpriority="high" decoding="async">
        </h1>
      </header>
      <main class="start-actions">
        <button class="start-btn" id="btn-start-game" type="button" aria-label="Start game as guest">
          <span class="start-btn-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 19h14M8 16l4-12 4 12-4-2-4 2Z"></path><path d="M9 19v2M15 19v2"></path></svg>
          </span>
          <strong class="start-btn-label">ENGAGE</strong>
          <span class="start-btn-arrow" aria-hidden="true">›</span>
        </button>
        <p class="start-error" role="alert" hidden></p>
      </main>
    `;
    this.container = screen;
    document.body.appendChild(screen);
    // Keep native button keys from reaching the flight/chat shortcuts beneath the menu.
    for (const type of ['keydown', 'keyup']) {
      screen.addEventListener(type, event => event.stopPropagation());
    }

    const button = screen.querySelector<HTMLButtonElement>('#btn-start-game')!;
    const label = screen.querySelector<HTMLElement>('.start-btn-label')!;
    const errorMessage = screen.querySelector<HTMLElement>('.start-error')!;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      label.textContent = 'LAUNCHING';
      errorMessage.hidden = true;
      try {
        await this.auth.signInAsGuest();
      } catch {
        if (!button.isConnected) return;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        label.textContent = 'ENGAGE';
        errorMessage.textContent = 'Unable to start. Please try again.';
        errorMessage.hidden = false;
        button.focus({ preventScroll: true });
      }
    });
    window.requestAnimationFrame(() => button.focus({ preventScroll: true }));
  }
}
