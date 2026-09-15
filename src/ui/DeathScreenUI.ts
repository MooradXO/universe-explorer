import './styles/death-screen.css';

export class DeathScreenUI {
  private readonly root: HTMLElement;
  private readonly timer: HTMLOutputElement;
  private countdownId: number | null = null;
  private hideId: number | null = null;

  constructor() {
    this.root = document.createElement('section');
    this.root.className = 'death-screen';
    this.root.setAttribute('role', 'alert');
    this.root.setAttribute('aria-live', 'assertive');
    this.root.innerHTML = `
      <div class="death-screen__reticle" aria-hidden="true"></div>
      <article class="death-screen__console">
        <header><span>FC-07 / CASUALTY SIGNAL</span><i aria-hidden="true"></i></header>
        <div class="death-screen__warning">PILOT LINK INTERRUPTED</div>
        <h1>HULL BREACH</h1>
        <p>Flight core is transferring control to the nearest recovery beacon.</p>
        <div class="death-screen__sequence">
          <span>AUTO RE-LAUNCH</span>
          <output aria-label="Seconds until respawn">5</output>
          <small>SECONDS</small>
        </div>
        <footer><b>RECOVERY BUS</b><span>LOCKED · STANDBY</span></footer>
      </article>
    `;
    this.timer = this.root.querySelector('output') as HTMLOutputElement;
    document.body.appendChild(this.root);
  }

  public show(seconds: number): void {
    this.clearTimers();
    let remaining = Math.max(0, Math.ceil(seconds));
    this.timer.value = `${remaining}`;
    this.root.style.display = 'grid';
    window.requestAnimationFrame(() => this.root.classList.add('is-visible'));

    this.countdownId = window.setInterval(() => {
      remaining -= 1;
      this.timer.value = `${Math.max(0, remaining)}`;
      if (remaining <= 0) this.hide();
    }, 1000);
  }

  private hide(): void {
    this.clearTimers();
    this.root.classList.remove('is-visible');
    this.hideId = window.setTimeout(() => {
      this.root.style.display = 'none';
      this.hideId = null;
    }, 360);
  }

  private clearTimers(): void {
    if (this.countdownId !== null) window.clearInterval(this.countdownId);
    if (this.hideId !== null) window.clearTimeout(this.hideId);
    this.countdownId = null;
    this.hideId = null;
  }
}
