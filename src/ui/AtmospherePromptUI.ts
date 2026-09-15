import './styles/atmosphere-prompt.css';

export class AtmospherePromptUI {
  private readonly layer: HTMLElement;
  private prompt: HTMLDivElement | null = null;
  private promptTitle: HTMLDivElement | null = null;
  private promptAction: HTMLSpanElement | null = null;
  private loading: HTMLDivElement | null = null;
  private status: HTMLDivElement | null = null;
  private statusTitle: HTMLDivElement | null = null;

  constructor(layer: HTMLElement) {
    this.layer = layer;
  }

  public showPrompt(planetName: string, actionLabel: string): void {
    this.ensurePrompt();
    if (!this.prompt || !this.promptTitle || !this.promptAction) return;
    this.promptTitle.textContent = planetName;
    this.promptAction.textContent = actionLabel.replace(/^\[F\]\s*/i, '');
    this.prompt.classList.add('active');
  }

  public hidePrompt(): void {
    this.prompt?.classList.remove('active');
  }

  public showLoading(label: string): void {
    if (!this.loading) {
      this.loading = document.createElement('div');
      this.loading.className = 'atmosphere-loading atmosphere-loading--frontier';
      this.layer.appendChild(this.loading);
    }
    this.loading.textContent = label;
    this.loading.classList.add('active');
  }

  public hideLoading(): void {
    this.loading?.classList.remove('active');
  }

  public showStatus(planetName: string): void {
    if (!this.status) {
      this.status = document.createElement('div');
      this.status.className = 'atmosphere-status atmosphere-status--frontier hud-metal-panel';
      this.statusTitle = document.createElement('div');
      this.statusTitle.className = 'atmosphere-status-title';
      const returnButton = document.createElement('button');
      returnButton.type = 'button';
      returnButton.className = 'atmosphere-status-button';
      returnButton.textContent = 'RETURN TO ORBIT';
      returnButton.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ReturnToOrbit')));
      this.status.append(this.statusTitle, returnButton);
      this.layer.appendChild(this.status);
    }
    if (this.statusTitle) this.statusTitle.textContent = `${planetName} / ATMOSPHERE`;
    this.status.classList.add('active');
  }

  public hideStatus(): void {
    this.status?.classList.remove('active');
  }

  private ensurePrompt(): void {
    if (this.prompt) return;
    this.prompt = document.createElement('div');
    this.prompt.className = 'atmosphere-prompt atmosphere-prompt--frontier hud-metal-panel';
    this.prompt.innerHTML = '<div class="atmosphere-prompt-label">PLANETARY APPROACH</div>';
    this.promptTitle = document.createElement('div');
    this.promptTitle.className = 'atmosphere-prompt-title';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atmosphere-prompt-button';
    button.innerHTML = '<kbd>F</kbd>';
    this.promptAction = document.createElement('span');
    button.appendChild(this.promptAction);
    button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('EnterAtmosphereRequested')));
    this.prompt.append(this.promptTitle, button);
    this.layer.appendChild(this.prompt);
  }
}
